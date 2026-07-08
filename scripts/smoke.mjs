// jsdom mount smoke test: proves the built widget mounts an isolated Shadow-DOM
// host + FAB without throwing, and that destroy() cleans up. (Click/drag capture
// needs a real browser; this only gates mount-time crashes.)
import { JSDOM } from 'jsdom';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM(
  '<!doctype html><html><body><div id="app"><button aria-label="Buy">Buy</button></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true },
);
const { window } = dom;

// Expose the globals the runtime + React expect (mount-time only).
const g = globalThis;
g.window = window;
g.document = window.document;
g.HTMLElement = window.HTMLElement;
g.Element = window.Element;
g.Node = window.Node;
g.CustomEvent = window.CustomEvent;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
g.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
g.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
g.localStorage = window.localStorage;
try { Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true }); } catch {}

const { initQaStudio } = await import('../dist/index.js');

const inst = initQaStudio({
  namespace: 'smoke',
  alwaysVisible: true,
  brand: { label: 'Smoke' },
  theme: { primary: '#6B2C3E', accent: '#D4726B' },
  journey: [{ id: 'public', role: { en: 'Public' }, steps: [{ path: '/', risk: 'green', what: { en: 'home' } }] }],
  credentials: [{ role: 'Admin', login: 'a', password: 'b', seeded: true }],
});

// Poll for the React tree to flush (createRoot renders async).
async function waitFor(fn, ms = 2000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

const host = window.document.querySelector('qapture-overlay');
if (!host) throw new Error('FAIL: <qapture> host element not mounted');
if (!host.shadowRoot) throw new Error('FAIL: shadow root not attached');
if (!host.hasAttribute('data-qa-overlay')) throw new Error('FAIL: host missing data-qa-overlay');

const sawButton = await waitFor(() => host.shadowRoot.querySelector('button'));
const shadowLen = (host.shadowRoot.innerHTML || '').length;
console.log(`host=ok shadowRoot=ok data-qa-overlay=ok fab=${sawButton ? 'ok' : 'MISSING'} shadowHtmlLen=${shadowLen}`);
if (!sawButton) throw new Error('FAIL: no FAB <button> rendered in the shadow root');

inst.destroy();
await waitFor(() => !window.document.querySelector('qapture-overlay'), 500);
if (window.document.querySelector('qapture-overlay')) throw new Error('FAIL: destroy() did not remove the host');

console.log('SMOKE PASS ✅  (mount → shadow host + FAB → destroy/cleanup)');

// ─────────────────────────────────────────────────────────────────────────
// Bug #3 (src/lib/storage.ts) + Bug #15 (src/lib/scrollLock.ts) regressions.
// Both files are TypeScript source, not standalone dist/ modules, so they're
// esbuild-bundled to throwaway ESM first (mirroring scripts/export-smoke.mjs's
// approach for exportZip.ts).
const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE_DIR = join(ROOT, 'dist', '_smoke_bundles');
mkdirSync(BUNDLE_DIR, { recursive: true });

function bundle(srcRel, outName) {
  const out = join(BUNDLE_DIR, outName);
  execSync(
    `npx esbuild ${JSON.stringify(join(ROOT, srcRel))} --bundle --platform=node --format=esm --outfile=${JSON.stringify(out)} --log-level=error`,
    { stdio: 'inherit' },
  );
  return pathToFileURL(out).href;
}

try {
  // --- Bug #3: getItem/getJSON must read the in-memory fallback map when a
  // prior setItem call degraded (localStorage.setItem threw, e.g. a simulated
  // QuotaExceededError), even though `available` was true at creation time.
  //
  // jsdom's window.localStorage is a legacy platform object (named property
  // setter), so `window.localStorage.setItem = fn` silently no-ops instead of
  // overriding the method — swap the whole property for a plain stub object
  // we can freely monkeypatch, then restore the original descriptor after.
  const storageUrl = bundle('src/lib/storage.ts', 'storage.mjs');
  const { createStorage } = await import(storageUrl);

  const originalLocalStorageDesc = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const backing = new Map();
  const stubStorage = {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { backing.set(k, String(v)); },
    removeItem: (k) => { backing.delete(k); },
  };
  Object.defineProperty(window, 'localStorage', { value: stubStorage, configurable: true, writable: true, enumerable: true });

  try {
    const store = createStorage('smoke-storage-fallback');

    let threw = false;
    const originalSetItem = stubStorage.setItem;
    stubStorage.setItem = () => { threw = true; throw new Error('QuotaExceededError (simulated)'); };
    try {
      store.setItem('widget-key', 'fallback-value');
    } finally {
      stubStorage.setItem = originalSetItem;
    }
    if (!threw) throw new Error('FAIL: monkeypatched localStorage.setItem was never invoked');

    const got = store.getItem('widget-key');
    if (got !== 'fallback-value') {
      throw new Error(`FAIL: getItem after a degraded setItem should return the in-memory fallback value, got ${JSON.stringify(got)}`);
    }
    console.log('Bug #3 storage fallback: getItem returns the in-memory value after a simulated QuotaExceededError ✅');
  } finally {
    Object.defineProperty(window, 'localStorage', originalLocalStorageDesc);
  }

  // --- Bug #15: lockPageScroll/unlockPageScroll must use a reference count,
  // so two overlapping callers (e.g. two independent mount/capture instances)
  // don't let one release the other's lock.
  const scrollLockUrl = bundle('src/lib/scrollLock.ts', 'scrollLock.mjs');
  const { lockPageScroll, unlockPageScroll } = await import(scrollLockUrl);

  lockPageScroll(); // caller A
  lockPageScroll(); // caller B (overlapping)
  if (window.document.body.style.overflow !== 'hidden') {
    throw new Error('FAIL: expected body scroll to be locked after two overlapping lockPageScroll() calls');
  }
  unlockPageScroll(); // caller A releases
  if (window.document.body.style.overflow !== 'hidden') {
    throw new Error('FAIL: scroll was released after only one of two overlapping callers unlocked (ref-count regression)');
  }
  unlockPageScroll(); // caller B releases
  if (window.document.body.style.overflow === 'hidden') {
    throw new Error('FAIL: scroll should be restored once both overlapping callers have unlocked');
  }
  console.log('Bug #15 scrollLock ref-count: overlapping lock/unlock calls do not release prematurely ✅');
} finally {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}

console.log('SMOKE PASS ✅  (storage fallback + scrollLock ref-count regressions covered)');
