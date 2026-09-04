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
  // v0.3: severity/status/journeyRef/context are carried through exportZip's
  // per-note body via noteToMarkdown() — populate them so this smoke test
  // actually exercises that delegation instead of just not-regressing it.
  severity: 'bug',
  status: 'open',
  journeyRef: { laneId: 'buyer', path: '/checkout' },
  context: {
    events: [
      { t: Date.parse('2026-06-29T09:59:59Z'), kind: 'network', method: 'POST', url: '/api/checkout', status: 500, durationMs: 340 },
    ],
    env: {
      url: 'http://localhost/checkout', route: '/checkout',
      viewportW: 1280, viewportH: 800, dpr: 1,
      userAgent: 'jsdom-test-agent', language: 'en-US', online: true, timezone: 'UTC',
    },
    // v0.5: the recorded run-up. The `type` step deliberately carries only a
    // field LABEL — asserted below, because the whole privacy promise of the
    // step recorder is that a typed value can never reach the export.
    steps: [
      { t: Date.parse('2026-06-29T09:59:50Z'), kind: 'click', label: 'Sign in' },
      { t: Date.parse('2026-06-29T09:59:53Z'), kind: 'type', label: 'Email', repeat: 14 },
      { t: Date.parse('2026-06-29T09:59:56Z'), kind: 'nav', label: '/checkout' },
      { t: Date.parse('2026-06-29T09:59:58Z'), kind: 'click', label: 'Place order' },
    ],
  },
}, {
  // v0.7.8: a point that came back. The original ask and the re-test must
  // BOTH survive into the export — merging them, or letting the follow-up
  // replace the description, would destroy the record of what was originally
  // wanted, which is the one thing the second round needs in order to explain
  // how the first attempt missed.
  id: '2', url: 'http://localhost/cart', route: '/cart',
  timestamp: '2026-06-29T09:40:00Z',
  description: 'Totals should include VAT.',
  severity: 'bug',
  status: 'fixed',
  followUp: 'VAT is shown now but it is added twice on the summary line.',
  followUpAt: '2026-06-29T09:55:00Z',
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

const must = [
  'Demo Shop', 'Login Context', 'admin@demo.test', 'Coverage Report', 'RED', '/checkout', '---NOTES---', 'Place order', 'Do not push without approval',
  // v0.3: per-point body now comes from noteMarkdown.ts's noteToMarkdown() —
  // assert severity/status/journeyRef/context actually made it into notes.md
  // rather than being silently dropped by the delegation.
  '**Severity:** bug', '**Status:** open', '**Journey step:** buyer → /checkout',
  'Runtime context at capture', 'POST /api/checkout → 500', 'viewport   1280×800 @1x',
  // v0.5: steps to reproduce, rendered as a numbered list above the runtime
  // context block.
  '**Steps before this**', '1. [-10.0s] clicked “Sign in”', 'typed in “Email”', 'went to /checkout',
];
const missing = must.filter((s) => !md.includes(s));
console.log('\nASSERT required content:', missing.length ? 'MISSING ' + missing.join(', ') : 'all present ✅');
if (missing.length) throw new Error('FAIL: preamble missing: ' + missing.join(', '));

// --- v0.5 privacy: a step must never carry what was typed. The fixture's
// `type` step has only the field's label; assert the export contains the
// label and nothing that looks like a value, and that a repeated interaction
// collapsed into a count rather than 14 separate lines.
if (!md.includes('typed in “Email”')) throw new Error('FAIL: typed-field step missing from notes.md');
if (md.includes('typed in “Email”: ') || /typed in “Email”[^\n]*@/.test(md)) {
  throw new Error('FAIL: a typed VALUE reached the export — the step recorder must record labels only');
}
const typedLines = md.split('\n').filter((l) => l.includes('typed in “Email”'));
if (typedLines.length !== 1) {
  throw new Error(`FAIL: expected one collapsed typing step, got ${typedLines.length}`);
}
console.log('ASSERT v0.5 steps: rendered, collapsed, and value-free ✅');

// --- v0.7.8 second round: the follow-up must arrive as its own block, the
// original ask must still be there, and the reader must be told which of the
// two is the current one.
const roundTwo = [
  'This one came back — round 2.',
  'What happened this time',
  'VAT is shown now but it is added twice on the summary line.',
  'Totals should include VAT.',            // the original ask, not overwritten
  'back for a second round',               // session summary counts it
  'A point with a "round 2" on it',        // the instruction that reads it
];
const missingRound = roundTwo.filter((s) => !md.includes(s));
if (missingRound.length) {
  throw new Error('FAIL: second round missing from notes.md: ' + missingRound.join(', '));
}
// The follow-up belongs UNDER the original, not in place of it.
if (md.indexOf('Totals should include VAT.') > md.indexOf('added twice on the summary line')) {
  throw new Error('FAIL: the follow-up rendered above the original ask');
}
console.log('ASSERT v0.7.8 second round: original kept, follow-up added under it ✅');

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

// ── v0.8.2: the export is an acceptance test, not a wish list ──────────────
// Every point must arrive with the question it will be graded on, and the ZIP
// must carry the checklist that question lives in. Without these the agent
// reads the archive as a set of suggestions, does part of it, and stops.
if (!files.includes('verify.md')) {
  throw new Error('FAIL: verify.md missing from the ZIP (files: ' + files.join(', ') + ')');
}
const verify = await zip.file('verify.md').async('string');

const boxes = (verify.match(/^- \[ \] \*\*check-\d+\*\*/gm) || []).length;
console.log('\nASSERT verify.md holds one unticked box per point:',
  `${boxes} box(es) for ${notes.length} point(s)` + (boxes === notes.length ? ' OK ✅' : ' FAIL'));
if (boxes !== notes.length) {
  throw new Error(`FAIL: verify.md has ${boxes} check box(es) for ${notes.length} point(s)`);
}

const verifyMust = [
  'checks to satisfy',
  'Tick a box here only when the check is true',
  '?qa=walk:verify',
];
const verifyMissing = verifyMust.filter((m) => !verify.includes(m));
console.log('ASSERT verify.md explains what is owed:',
  verifyMissing.length ? 'FAIL ' + JSON.stringify(verifyMissing) : 'all present OK ✅');
if (verifyMissing.length) {
  throw new Error('FAIL: verify.md missing: ' + verifyMissing.join(', '));
}

const gradedMust = [
  '## You Are Being Graded On This',
  'Check 1 — how this will be graded',
  'is this now what I asked for?',
];
const gradedMissing = gradedMust.filter((m) => !md.includes(m));
console.log('ASSERT notes.md states the grading contract:',
  gradedMissing.length ? 'FAIL ' + JSON.stringify(gradedMissing) : 'all present OK ✅');
if (gradedMissing.length) {
  throw new Error('FAIL: notes.md missing: ' + gradedMissing.join(', '));
}

console.log('EXPORT SMOKE PASS ✅');
