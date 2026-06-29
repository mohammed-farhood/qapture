// Export smoke: builds a real ZIP via buildAndDownloadZip (esbuild-bundled to
// argv[2]), captures the Blob, unzips it, and asserts the AI handoff preamble +
// coverage report + ---NOTES--- sentinel + per-point block are all present.
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Resolve to an absolute file URL so dynamic import() doesn't treat a relative
// path like "dist/x.mjs" as a bare package specifier.
const BUNDLE = pathToFileURL(resolve(process.argv[2])).href;
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
const { window } = dom;
const g = globalThis;
g.window = window;
g.document = window.document;
let captured = null;
window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:mock'; };
window.URL.revokeObjectURL = () => {};
g.URL = window.URL;

const { buildAndDownloadZip } = await import(BUNDLE);

const config = {
  brand: { label: 'Demo QA' },
  theme: { primary: '#6B2C3E', accent: '#D4726B', sage: '#8B9D83', ink: '#3A2A2E', surface: '#FFFDFB' },
  loginField: { en: 'Email' },
  credentials: [{ role: 'Admin', login: 'admin@demo.test', password: 'Admin@123', seeded: true }],
  journey: [{
    id: 'buyer', role: { en: 'Buyer' }, steps: [
      { path: '/checkout', risk: 'red', riskWhy: 'money flow', what: { en: 'place order' } },
      { path: '/cart', risk: 'red', what: { en: 'cart math' } },
      { path: '/about', risk: 'green', what: { en: 'static' } },
    ],
  }],
  preamble: {
    projectName: 'Demo Shop', oneLiner: 'A demo store.', stack: 'React + Vite',
    conventions: ['Use api.js for all calls'], invariants: ['Do not push without approval'],
    verifySteps: ['Run npm run dev'], additionalContext: '',
  },
};
const guideChecked = new Set(['buyer::/cart']); // 1 of 2 reds covered → redScore 0.5
const notes = [{
  id: '1', url: 'http://localhost/checkout', route: '/checkout',
  timestamp: '2026-06-29T10:00:00Z',
  description: 'Button stays enabled with empty address.',
  target: { kind: 'element', selector: 'button[aria-label="Place order"]', tagName: 'BUTTON', text: 'Place order', rect: { top: 10, left: 20, width: 100, height: 40 } },
}];

await buildAndDownloadZip(notes, '2026-06-29T10:00:00Z', 'demo-export', config, guideChecked);
if (!captured) throw new Error('FAIL: no zip blob produced');

const buf = Buffer.from(await captured.arrayBuffer());
const zip = await JSZip.loadAsync(buf);
const files = Object.keys(zip.files);
const md = await zip.file('notes.md').async('string');

console.log('ZIP files:', files.join(', '));
console.log('--- notes.md (first 70 lines) ---');
console.log(md.split('\n').slice(0, 70).join('\n'));

const must = ['Demo Shop', 'Login Context', 'admin@demo.test', 'Coverage Report', 'RED', '/checkout', '---NOTES---', 'Place order', 'Do not push without approval'];
const missing = must.filter((s) => !md.includes(s));
console.log('\nASSERT required content:', missing.length ? 'MISSING ' + missing.join(', ') : 'all present ✅');
if (missing.length) throw new Error('FAIL: preamble missing: ' + missing.join(', '));
console.log('EXPORT SMOKE PASS ✅');
