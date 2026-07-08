// Capture-timeout smoke: esbuild-bundles src/lib/capture.ts to a temp
// Node-runnable ESM file (mirroring export-smoke.mjs's approach for
// exportZip.ts / cli-detectors-smoke.mjs's approach for the bin detectors),
// then exercises the (test-only-exported) `withTimeout` helper added for
// bug #13: captureRegion no longer hangs forever when the wrapped
// html2canvas(...) promise never settles — withTimeout races it against a
// timeout and resolves to null instead.
//
// This avoids mocking html2canvas/DOM canvas rendering (brittle in jsdom):
// we test the timeout-racing behavior directly and in isolation, using a
// short ms value in the test call itself (NOT the real 10s production
// HTML2CANVAS_TIMEOUT_MS constant, which is left untouched).
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE_DIR = join(ROOT, 'dist', '_capture_timeout_smoke');
const OUT = join(BUNDLE_DIR, 'capture.mjs');

let failures = 0;
function assertTrue(cond, label) {
  if (cond) { console.log(`  ok   - ${label}`); }
  else { console.error(`  FAIL - ${label}`); failures++; }
}

mkdirSync(BUNDLE_DIR, { recursive: true });

try {
  execSync(
    `npx esbuild ${JSON.stringify(join(ROOT, 'src/lib/capture.ts'))} --bundle --platform=node --format=esm --outfile=${JSON.stringify(OUT)} --log-level=error`,
    { stdio: 'inherit' },
  );

  const { withTimeout } = await import(pathToFileURL(OUT).href);
  assertTrue(typeof withTimeout === 'function', 'withTimeout is exported from the capture.ts bundle');

  // --- Bug #13: a promise that never settles must not hang captureRegion
  // forever — withTimeout must resolve to null once the (short, test-only)
  // timeout elapses.
  const start = Date.now();
  const hungResult = await withTimeout(new Promise(() => {}), 50);
  const elapsedMs = Date.now() - start;

  assertTrue(hungResult === null, `#13 withTimeout resolves to null for a never-settling promise (got ${JSON.stringify(hungResult)})`);
  assertTrue(
    elapsedMs < 200,
    `#13 withTimeout resolves within bounded wall-clock time, well under the real 10s production timeout (took ${elapsedMs}ms, expected < 200ms)`,
  );

  // --- Happy path: a promise that resolves before the timeout must still
  // pass its value through untouched.
  const happyResult = await withTimeout(Promise.resolve('ok'), 50);
  assertTrue(happyResult === 'ok', `withTimeout still resolves to the wrapped promise's value on the happy path (got ${JSON.stringify(happyResult)})`);
} finally {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nCAPTURE TIMEOUT SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nCAPTURE TIMEOUT SMOKE PASS ✅');
