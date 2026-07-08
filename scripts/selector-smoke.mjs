// Selector smoke test — esbuild-bundles src/lib/selector.ts to a throwaway
// ESM file on disk (mirroring export-smoke.mjs's approach for exportZip.ts),
// then asserts the behavior of two previously-fixed bugs in getStableSelector:
//
//   #4  Uniqueness check: a candidate selector (e.g. `[data-testid="x"]`) is
//       only accepted if `document.querySelectorAll(sel).length === 1`. When
//       two elements share the same data-testid, the generated selector for
//       either one must fall through to the next-priority strategy (here,
//       the structural nth-of-type path) instead of returning an ambiguous
//       selector that resolves to both elements.
//
//   #21 esc() fallback: when CSS.escape is unavailable, the hand-rolled
//       fallback must escape backslashes and double-quotes rather than
//       interpolating the raw value into a quoted attribute selector (which
//       would produce a syntactically broken/injectable selector).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE_DIR = join(ROOT, 'dist', '_selector_smoke');
mkdirSync(BUNDLE_DIR, { recursive: true });

const OUT = join(BUNDLE_DIR, 'selector.mjs');
execSync(
  `npx esbuild ${JSON.stringify(join(ROOT, 'src/lib/selector.ts'))} --bundle --platform=node --format=esm --outfile=${JSON.stringify(OUT)} --log-level=error`,
  { stdio: 'inherit' },
);
const { getStableSelector } = await import(pathToFileURL(OUT).href);

let failures = 0;
function assertTrue(cond, label) {
  if (cond) { console.log(`  ok   - ${label}`); }
  else { console.error(`  FAIL - ${label}`); failures++; }
}

// Fresh jsdom environment; expose document globally the same way
// export-smoke.mjs exposes window/document for its bundled module.
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
const { window } = dom;
const g = globalThis;
g.window = window;
g.document = window.document;

console.log('--- Bug #4: duplicate data-testid must not yield an ambiguous selector ---');
{
  const body = document.body;
  body.innerHTML = '';
  const elA = document.createElement('div');
  elA.setAttribute('data-testid', 'dup');
  elA.textContent = 'A';
  const elB = document.createElement('div');
  elB.setAttribute('data-testid', 'dup');
  elB.textContent = 'B';
  body.appendChild(elA);
  body.appendChild(elB);

  const selA = getStableSelector(elA);
  const selB = getStableSelector(elB);
  console.log(`  selector(elA) = ${JSON.stringify(selA)}`);
  console.log(`  selector(elB) = ${JSON.stringify(selB)}`);

  assertTrue(
    selA !== '[data-testid="dup"]',
    'selector for elA does NOT use the ambiguous [data-testid="dup"] selector',
  );
  assertTrue(
    selB !== '[data-testid="dup"]',
    'selector for elB does NOT use the ambiguous [data-testid="dup"] selector',
  );
  assertTrue(
    document.querySelectorAll(selA).length === 1 && document.querySelector(selA) === elA,
    'selector for elA resolves to exactly elA (falls through to a unique selector)',
  );
  assertTrue(
    document.querySelectorAll(selB).length === 1 && document.querySelector(selB) === elB,
    'selector for elB resolves to exactly elB (falls through to a unique selector)',
  );
  assertTrue(selA !== selB, 'the two fallback selectors are distinct from each other');
  assertTrue(
    /nth-of-type/.test(selA) && /nth-of-type/.test(selB),
    'fallback selectors use the structural nth-of-type path, as expected',
  );
}

console.log('\n--- Bug #21: esc() fallback must escape backslashes/double-quotes ---');
{
  // Defensively remove CSS.escape from the environment regardless of what
  // this jsdom version provides by default, so the hand-rolled fallback in
  // esc() is definitely what's exercised (mirrors old Safari/IE).
  delete g.CSS;
  assertTrue(typeof CSS === 'undefined', 'CSS.escape has been removed from the test environment');

  const body = document.body;
  body.innerHTML = '';
  const el = document.createElement('input');
  const rawValue = 'foo"bar';
  el.setAttribute('data-testid', rawValue);
  body.appendChild(el);

  const sel = getStableSelector(el);
  console.log(`  selector(el) = ${JSON.stringify(sel)}`);

  const expected = '[data-testid="foo\\"bar"]'; // foo\"bar inside the quotes
  assertTrue(sel === expected, `escaped selector matches expected form ${JSON.stringify(expected)}`);

  let matched;
  let threw = false;
  try {
    matched = document.querySelectorAll(sel);
  } catch {
    threw = true;
  }
  assertTrue(!threw, 'the escaped selector does not throw when passed to querySelectorAll');
  assertTrue(
    !threw && matched.length === 1 && matched[0] === el,
    'the escaped selector resolves to exactly the target element',
  );
}

console.log('');
if (failures > 0) {
  console.error(`SELECTOR SMOKE FAIL ❌ (${failures} assertion${failures === 1 ? '' : 's'} failed)`);
  process.exit(1);
}
console.log('SELECTOR SMOKE PASS ✅');
