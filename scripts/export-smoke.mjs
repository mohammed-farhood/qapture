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
  credentials: [{ role: 'Admin\nRole', login: 'admin@demo.test', password: 'Admin@123', seeded: true }],
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

// --- Bug #14: mdTable() must replace embedded \r\n/\r/\n in cell values with
// a space, not leave them intact, or a config field with a literal newline
// (e.g. credentials[].role = 'Admin\nRole') splits a Markdown table row across
// physical lines and corrupts the "## Login Context" table. Verify every
// non-blank, non-separator line in that table section is a well-formed row:
// starts/ends with '|' and has the same '|' count as the header row.
const loginSectionMatch = md.match(/## Login Context\n\n([\s\S]*?)\n\n>/);
if (!loginSectionMatch) throw new Error('FAIL: could not locate "## Login Context" table section');
const loginTableLines = loginSectionMatch[1].split('\n').filter((l) => l.trim().length > 0);
if (loginTableLines.length < 2) throw new Error('FAIL: Login Context table has too few lines');
const headerPipeCount = (loginTableLines[0].match(/\|/g) || []).length;
console.log('\n--- Login Context table lines ---');
loginTableLines.forEach((l) => console.log(JSON.stringify(l)));
const badRows = loginTableLines.filter((line, i) => {
  const isSeparator = i === 1 && /^\|[\s:-]+\|$/.test(line.replace(/\s*\|\s*/g, '|'));
  if (isSeparator) return false;
  const pipeCount = (line.match(/\|/g) || []).length;
  return !line.startsWith('|') || !line.endsWith('|') || pipeCount !== headerPipeCount;
});
console.log(
  '\nASSERT Login Context table rows well-formed (no newline-split rows):',
  badRows.length ? 'FAIL ' + JSON.stringify(badRows) : `all ${loginTableLines.length} lines OK ✅`,
);
if (badRows.length) {
  throw new Error('FAIL: Login Context table row(s) split/corrupted by embedded newline: ' + JSON.stringify(badRows));
}
if (!md.includes('Admin Role')) {
  throw new Error('FAIL: expected mdTable() to replace embedded newline in "Admin\\nRole" with a space ("Admin Role")');
}

console.log('EXPORT SMOKE PASS ✅');
