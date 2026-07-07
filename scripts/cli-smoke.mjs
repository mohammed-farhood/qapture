// Minimal CLI invocation smoke test — proves the built dist/bin/init.cjs
// binary actually runs (previously nothing invoked it at all: the CLI was
// excluded from tsc --noEmit AND never smoke-tested, see verify:typecheck:bin).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = new URL('../dist/bin/init.cjs', import.meta.url).pathname;
const pkgVersion = execFileSync(
  'node',
  ['-e', 'process.stdout.write(require(process.argv[1]).version)', new URL('../package.json', import.meta.url).pathname],
  { encoding: 'utf8' },
);

let failures = 0;
function assertTrue(cond, label) {
  if (cond) { console.log(`  ok   - ${label}`); }
  else { console.error(`  FAIL - ${label}`); failures++; }
}

function run(args) {
  try {
    const out = execFileSync('node', [BIN, ...args], { encoding: 'utf8' });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

const version = run(['version']);
assertTrue(version.code === 0, 'cli `version` exits 0');
assertTrue(version.out.includes(String(pkgVersion)), `cli \`version\` output mentions the package version (${pkgVersion})`);

const help = run(['help']);
assertTrue(help.code === 0, 'cli `help` exits 0');
assertTrue(/qapture/i.test(help.out), 'cli `help` output mentions qapture usage');

const bareInvoke = run([]);
assertTrue(bareInvoke.code === 0, 'cli with no args falls through to help (exits 0)');

// `init` against a minimal real fixture directory, exercising the full
// detector + generator + idempotent-write pipeline end-to-end.
const fixtureDir = mkdtempSync(join(tmpdir(), 'qapture-cli-init-smoke-'));
try {
  writeFileSync(join(fixtureDir, 'package.json'), JSON.stringify({ name: 'fixture-app', version: '0.0.0' }, null, 2));
  const init = run(['init', fixtureDir]);
  assertTrue(init.code === 0, 'cli `init <dir>` exits 0 against a minimal fixture project');

  const initAgain = run(['init', fixtureDir]);
  assertTrue(initAgain.code === 0, 'cli `init <dir>` is idempotent — re-running does not error');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nCLI SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nCLI SMOKE PASS ✅');
