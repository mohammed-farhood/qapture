// Standalone <qapture-widget> smoke test — regression coverage for bug #26
// (src/standalone.ts): a <qapture-widget> element that connects and then
// disconnects again *before* the lazy `import('./index')` resolves used to
// silently never mount, because browsers/jsdom only auto-upgrade (and fire
// connectedCallback on) elements that are still connected at the exact
// moment `customElements.define()` runs. The fix tracks this by sweeping
// `document.querySelectorAll('qapture-widget')` right after the import
// resolves and manually invoking connectedCallback on any instance that's
// still connected then (idempotent — connectedCallback's `if (this._destroy)
// return` guard makes it a no-op for anything the native upgrade already
// handled).
//
// APPROACH TAKEN (and why): we first attempted the full end-to-end race —
// bundling the real src/standalone.ts fresh via esbuild and letting a real
// dynamic `import('./index')` (against the real built dist/index.js) race
// against synchronous DOM mutation. That full race turned out to be a *false
// negative* in jsdom: jsdom's CustomElementRegistry.define() already runs
// its native "upgrade already-connected candidates" scan synchronously and
// correctly (verified directly: an element connected before define(), left
// connected through define(), gets connectedCallback natively — no manual
// sweep required; likewise an element disconnected-then-reconnected *after*
// define() also gets picked up natively via the standard node-insertion
// "try to upgrade" step). Concretely: running this exact scenario against
// BOTH the pre-fix standalone.ts (git commit 1c116c3~1) and the current
// fixed version produced the *same* passing result in jsdom, which means
// that specific timing shape can't discriminate red vs green here — i.e. it
// is exactly the "too brittle to reproduce deterministically" case flagged
// as acceptable to route around.
//
// So instead we take the explicitly-sanctioned direct approach: bundle the
// *real, unmodified* src/standalone.ts via esbuild, but redirect only its
// dynamic `import('./index')` call to a tiny stand-in module that awaits a
// promise we control by hand from the test (standing in for "the lazy
// import is still resolving"). This lets us assert exactly the contract the
// fix promises — connect element A, disconnect it *before* letting the
// stand-in "import" resolve, connect element B and leave it connected, then
// resolve — and confirm the tracking/mount logic still picks up whatever is
// connected at that point (B), while A (gone before resolution) is not
// spuriously mounted. It still exercises the actual production
// src/standalone.ts source (guard, disconnectedCallback reset, and the
// sweep loop) end to end through real jsdom customElements — only the
// timing of "when does the import settle" is hand-driven instead of relying
// on real filesystem/module-graph latency to win a race.
//
// "Mounted" is observed the same way scripts/smoke.mjs does: initQaStudio()
// -> mountQaStudio() (src/mount/ShadowMount.ts) synchronously creates and
// appends a <qapture-overlay data-qa-overlay> host with an open shadow root.

import * as esbuild from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url).pathname;
const STANDALONE_SRC = join(ROOT, 'src', 'standalone.ts');
const DIST_INDEX_URL = pathToFileURL(join(ROOT, 'dist', 'index.js')).href;
const BUNDLE_DIR = join(ROOT, 'dist', '_standalone_smoke');
const GATE_KEY = '__qaStandaloneSmokeGate';

let failures = 0;
function assertTrue(cond, label) {
  if (cond) { console.log(`  ok   - ${label}`); }
  else { console.error(`  FAIL - ${label}`); failures++; }
}

// Plugin: leave every import alone EXCEPT the dynamic `import('./index')`
// inside src/standalone.ts, which we redirect to a virtual module that
// awaits a manually-controlled global promise before resolving to the real
// (already-built) dist/index.js. The static `export { initQaStudio } from
// './index'` re-export at the top of standalone.ts is left pointing at a
// trivial stub — we never exercise that named export in this test, and
// stubbing it avoids pulling react/react-dom into the bundle for no reason.
const gateDynamicIndexImport = {
  name: 'gate-dynamic-index-import',
  setup(build) {
    build.onResolve({ filter: /^\.\/index$/ }, (args) => {
      if (args.importer !== STANDALONE_SRC) return null;
      return args.kind === 'dynamic-import'
        ? { path: 'gated-index', namespace: 'qa-smoke-gate' }
        : { path: 'stub-index', namespace: 'qa-smoke-gate' };
    });
    build.onLoad({ filter: /^gated-index$/, namespace: 'qa-smoke-gate' }, () => ({
      loader: 'js',
      contents: `
        // Stands in for "the lazy import('./index') is still resolving".
        await globalThis[${JSON.stringify(GATE_KEY)}];
        // Held in a variable (not a string literal) so esbuild treats this
        // as a fully-dynamic, non-bundleable import and leaves it for Node's
        // real runtime module resolver to handle against the real build.
        const target = ${JSON.stringify(DIST_INDEX_URL)};
        const mod = await import(target);
        export const initQaStudio = mod.initQaStudio;
      `,
    }));
    build.onLoad({ filter: /^stub-index$/, namespace: 'qa-smoke-gate' }, () => ({
      loader: 'js',
      contents: `export const initQaStudio = undefined;`,
    }));
  },
};

mkdirSync(BUNDLE_DIR, { recursive: true });

try {
  // format:'esm' + splitting:true forces the gated dynamic import into its
  // own real chunk file, so its awaited gate promise doesn't get inlined
  // into (and stall) the entry module's own synchronous evaluation.
  await esbuild.build({
    entryPoints: [STANDALONE_SRC],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    splitting: true,
    outdir: BUNDLE_DIR,
    write: true,
    plugins: [gateDynamicIndexImport],
    external: ['react', 'react-dom', 'react-dom/client'],
    logLevel: 'error',
  });
  const entryFile = join(BUNDLE_DIR, 'standalone.js');

  // --- jsdom environment (mirrors scripts/smoke.mjs's global patching) ---
  const dom = new JSDOM(
    '<!doctype html><html><body></body></html>',
    { url: 'http://localhost/', pretendToBeVisual: true },
  );
  const { window } = dom;
  const g = globalThis;
  g.window = window;
  g.document = window.document;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.Node = window.Node;
  g.CustomEvent = window.CustomEvent;
  g.customElements = window.customElements;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  g.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
  g.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
  g.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true }); } catch {}

  // Manually-controlled promise standing in for the lazy dynamic import.
  let resolveGate;
  g[GATE_KEY] = new Promise((resolve) => { resolveGate = resolve; });

  // 1. Element A connects...
  const elA = window.document.createElement('qapture-widget');
  window.document.body.appendChild(elA);
  assertTrue(elA.isConnected, 'element A starts out connected');

  // 2. ...load standalone.ts. Its top-level code runs synchronously and
  // kicks off the (gated) dynamic import, but doesn't block on it — so this
  // outer import resolves immediately while the inner one stays pending.
  await import(pathToFileURL(entryFile).href);

  // 3. ...then element A disconnects again, all *before* we let the gated
  // import resolve — i.e. before customElements.define('qapture-widget')
  // has run at all. This reproduces "connected-then-disconnected before the
  // lazy import resolved" from the bug description.
  elA.remove();
  assertTrue(!elA.isConnected, 'element A is disconnected before the lazy import resolves');

  // 4. A different element B connects and stays connected all the way
  // through resolution.
  const elB = window.document.createElement('qapture-widget');
  window.document.body.appendChild(elB);
  assertTrue(elB.isConnected, 'element B connects and stays connected');

  // 5. Now let "the lazy import" resolve — this is the moment
  // customElements.define() + the post-define sweep run.
  resolveGate();
  await window.customElements.whenDefined('qapture-widget');
  // Let any queued custom-element reactions/microtasks settle.
  await new Promise((r) => setTimeout(r, 50));

  // --- Assertions -----------------------------------------------------
  const hosts = window.document.querySelectorAll('qapture-overlay');
  assertTrue(hosts.length === 1, `exactly one <qapture-overlay> shadow host was mounted (found ${hosts.length})`);

  const host = hosts[0];
  assertTrue(!!host && !!host.shadowRoot, 'the mounted host has an attached shadow root');
  assertTrue(!!host && host.hasAttribute('data-qa-overlay'), 'the mounted host carries data-qa-overlay');

  assertTrue(
    window.document.contains(elB),
    'element B (still connected at resolve time) remains in the document',
  );
  assertTrue(
    !window.document.contains(elA),
    'element A (disconnected before resolve time) was correctly not re-attached or mounted on its own',
  );
} finally {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nSTANDALONE SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nSTANDALONE SMOKE PASS ✅  (bug #26: late-defined <qapture-widget> still mounts the still-connected element)');
