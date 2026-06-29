// jsdom mount smoke test: proves the built widget mounts an isolated Shadow-DOM
// host + FAB without throwing, and that destroy() cleans up. (Click/drag capture
// needs a real browser; this only gates mount-time crashes.)
import { JSDOM } from 'jsdom';

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
