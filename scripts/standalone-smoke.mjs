// Standalone <qapture-widget> smoke test — regression coverage for bug #26
// (src/standalone.ts): a <qapture-widget> element that connects and then
// disconnects again *before* the lazy `import('./index')` resolves used to
// silently never mount, because browsers/jsdom only auto-upgrade (and fire
// connectedCallback on) elements that are still connected at the exact
// moment `customElements.define()` runs. The fix adds three things:
//   1. a `connectedCallback` idempotency guard (`if (this._destroy) return`)
//   2. `disconnectedCallback` resetting `this._destroy = undefined`
//   3. a post-`define()` sweep of `document.querySelectorAll('qapture-widget')`
//      that manually invokes `connectedCallback` on anything still connected
//      that the native upgrade didn't already reach.
//
// --- IMPORTANT: why there are TWO scenarios below -------------------------
//
// SCENARIO 1 ("late define / sweep", elements A/B) exercises the sweep loop
// end to end, but an adversarial review correctly flagged that, *in jsdom*,
// it is NON-DISCRIMINATING on its own: it passes identically whether the
// fix's guard/sweep code is present or fully reverted. Why: jsdom implements
// the CustomElementRegistry spec correctly, which means
//   (a) `customElements.define()` itself synchronously upgrades (and fires
//       connectedCallback on) every currently-*connected* candidate as part
//       of the define() call, before our sweep line ever runs — so by the
//       time the sweep's querySelectorAll executes, every element it could
//       possibly find connected is *already* mounted natively; the guard
//       merely makes the sweep's redundant call a no-op, and
//   (b) an element that's disconnected at define()-time and never
//       reconnects (element A here) is correctly never mounted in *either*
//       version — there's no bug to catch there, so asserting "A stays
//       unmounted" can't discriminate either.
// We verified this two ways: (i) by reasoning through the spec's upgrade
// algorithm, and (ii) empirically — running this exact scenario against
// `git show bugfix-batch-base:src/standalone.ts` (fully reverted, no guard,
// no reset, no sweep) produces the *same* assertions passing as the fixed
// version. We keep this scenario because it's still a legitimate end-to-end
// regression test of the sweep's basic wiring/observable behaviour, but it
// must NOT be relied on as the sole proof the fix matters.
//
// SCENARIO 2 ("idempotency guard", element C) is the one that actually
// discriminates. It manually invokes `connectedCallback()` a second time,
// directly on the JS instance, while the element is already connected *and*
// already mounted — bypassing normal DOM connect semantics (no browser
// fires connectedCallback twice for one connection), but this is exactly
// what the sweep's redundant call *would* look like if jsdom's native
// define()-time upgrade were ever absent, slower, or ordered differently
// (e.g. non-spec-compliant hosts, polyfilled custom elements, or future
// jsdom changes) — which is precisely the defensive scenario the guard
// exists to cover. Since `mountQaStudio()` (src/mount/ShadowMount.ts)
// unconditionally creates a *new* `<qapture-overlay>` host on every call
// and does not dedupe by caller, a second un-guarded connectedCallback call
// on an already-mounted instance produces a second, independent host node —
// a real, observable double-mount. Reverted source (no guard) fails this
// with 2 hosts; fixed source passes with exactly 1. This was verified by
// actually running the assertions below against both
// `git show bugfix-batch-base:src/standalone.ts` (RED — 2 hosts, extra
// `init()` call) and the current fixed `src/standalone.ts` (GREEN — 1 host).
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
function gateDynamicIndexImport() {
  return {
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
}

// Builds a fresh copy of the real, unmodified src/standalone.ts into its own
// bundle directory (each scenario gets a distinct directory so their output
// file paths — and therefore Node's ESM module cache entries — never
// collide; that matters because customElements.define('qapture-widget', …)
// can only run once per registry, and each scenario needs its own).
async function buildBundle(bundleDir) {
  mkdirSync(bundleDir, { recursive: true });
  await esbuild.build({
    entryPoints: [STANDALONE_SRC],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    splitting: true,
    outdir: bundleDir,
    write: true,
    plugins: [gateDynamicIndexImport()],
    external: ['react', 'react-dom', 'react-dom/client'],
    logLevel: 'error',
  });
  return join(bundleDir, 'standalone.js');
}

// Spins up a fresh jsdom window and patches globalThis (mirrors
// scripts/smoke.mjs's global patching). Each scenario calls this so it gets
// its own independent `customElements` registry.
function setupJsdomGlobals() {
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
  return window;
}

// ---------------------------------------------------------------------------
// Scenario 1: late define / sweep (elements A + B). Kept as end-to-end sweep
// coverage — see the big header comment above for why this alone does NOT
// discriminate fixed vs reverted in jsdom.
// ---------------------------------------------------------------------------
async function runLateDefineScenario() {
  console.log('\nScenario 1: connect-then-disconnect-before-define (sweep wiring)');
  const bundleDir = join(ROOT, 'dist', '_standalone_smoke_a');
  try {
    const entryFile = await buildBundle(bundleDir);
    const window = setupJsdomGlobals();
    const g = globalThis;

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
    rmSync(bundleDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Scenario 2: idempotency guard (element C). THIS is the discriminating
// scenario — see the big header comment above for why. It:
//   1. connects element C before define() runs, so jsdom's native
//      define()-time upgrade mounts it once (exactly like a real page load);
//   2. then manually calls `connectedCallback()` a second time directly on
//      the live instance — the same shape of call the fix's own sweep makes
//      on an already-upgraded element, just triggered by hand instead of by
//      timing luck;
//   3. asserts the guard made that second call a no-op: still exactly one
//      <qapture-overlay> host, and it's the *same* host node (not replaced).
// Reverted source has no guard, so the second call runs `init()` again and
// produces a second, independent host — this is a real, observable
// double-mount via mountQaStudio()'s unconditional `document.createElement`.
// ---------------------------------------------------------------------------
async function runIdempotencyGuardScenario() {
  console.log('\nScenario 2: direct double-invocation of connectedCallback (idempotency guard)');
  const bundleDir = join(ROOT, 'dist', '_standalone_smoke_b');
  try {
    const entryFile = await buildBundle(bundleDir);
    const window = setupJsdomGlobals();
    const g = globalThis;

    // No artificial delay needed for this scenario — resolve the gate
    // immediately so the lazy import proceeds as soon as it's kicked off.
    g[GATE_KEY] = Promise.resolve();

    // 1. Element C connects *before* define() runs, so it gets mounted via
    // jsdom's ordinary, spec-compliant native upgrade — nothing synthetic
    // about this first mount.
    const elC = window.document.createElement('qapture-widget');
    window.document.body.appendChild(elC);
    assertTrue(elC.isConnected, 'element C starts out connected');

    await import(pathToFileURL(entryFile).href);
    await window.customElements.whenDefined('qapture-widget');
    await new Promise((r) => setTimeout(r, 50));

    const hostsAfterFirstMount = window.document.querySelectorAll('qapture-overlay');
    assertTrue(
      hostsAfterFirstMount.length === 1,
      `element C was mounted natively exactly once (found ${hostsAfterFirstMount.length} host(s))`,
    );
    const firstHost = hostsAfterFirstMount[0];

    // 2. Directly invoke connectedCallback() a second time on the
    // already-connected, already-mounted instance. No browser does this on
    // its own for a single connection — we're deliberately bypassing normal
    // DOM connect semantics to exercise the guard the fix added for exactly
    // this shape of redundant call (i.e. what the sweep would trigger if
    // native upgrade hadn't already run).
    assertTrue(
      typeof elC.connectedCallback === 'function',
      'element C exposes a connectedCallback method to invoke directly',
    );
    elC.connectedCallback();

    // Synchronous mount path (see src/mount/ShadowMount.ts), but give any
    // queued reactions/microtasks a chance to settle anyway for parity with
    // scenario 1 and to catch any async double-mount we might otherwise miss.
    await new Promise((r) => setTimeout(r, 50));

    // --- Assertions -----------------------------------------------------
    const hostsAfterSecondCall = window.document.querySelectorAll('qapture-overlay');
    assertTrue(
      hostsAfterSecondCall.length === 1,
      `manually re-invoking connectedCallback() on an already-mounted element did NOT create a second host (found ${hostsAfterSecondCall.length})`,
    );
    assertTrue(
      hostsAfterSecondCall.length === 1 && hostsAfterSecondCall[0] === firstHost,
      'the original <qapture-overlay> host instance was left untouched (not replaced/remounted)',
    );
  } finally {
    rmSync(bundleDir, { recursive: true, force: true });
  }
}

await runLateDefineScenario();
await runIdempotencyGuardScenario();

if (failures > 0) {
  console.error(`\nSTANDALONE SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nSTANDALONE SMOKE PASS ✅  (bug #26: late-defined <qapture-widget> still mounts the still-connected element, and connectedCallback is idempotent against redundant invocation)');
