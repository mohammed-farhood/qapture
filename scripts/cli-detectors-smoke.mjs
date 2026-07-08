// CLI detector regression smoke test — builds a throwaway fixture project on
// disk, esbuild-bundles the four src/bin detector/util modules to Node-runnable
// ESM (mirroring export-smoke.mjs's approach for exportZip.ts), then asserts
// the specific behaviors of five previously-fixed bugs:
//   #5  detectCredentials: matches from different files must never cluster
//       into one fabricated credential, regardless of line-number proximity.
//   #6  detectRoutes: auth/admin/seller classification must not prefix-match
//       unrelated routes like /registered-users, /authors, /administrator-guide.
//   #7  secretGuard: the exact-basename blocklist must be case-insensitive
//       (a literal .ENV must be blocked just like .env).
//   #8  detectCredentials: camelCase/SCREAMING_SNAKE_CASE field declarations
//       (e.g. `const adminPassword = '...'`) must be detected, not just
//       object-literal `password: '...'` style.
//   #16 detectTheme: nested Tailwind shade objects (`primary: { 500: '#hex' }`)
//       must resolve to the outer key name, not just flat `key: '#hex'` pairs.
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE_DIR = join(ROOT, 'dist', '_cli_detectors_smoke');

function bundle(srcRel, outName) {
  const out = join(BUNDLE_DIR, outName);
  execSync(
    `npx esbuild ${JSON.stringify(join(ROOT, srcRel))} --bundle --platform=node --format=esm --outfile=${JSON.stringify(out)} --log-level=error`,
    { stdio: 'inherit' },
  );
  return pathToFileURL(out).href;
}

let failures = 0;
function assertTrue(cond, label) {
  if (cond) { console.log(`  ok   - ${label}`); }
  else { console.error(`  FAIL - ${label}`); failures++; }
}

mkdirSync(BUNDLE_DIR, { recursive: true });

const credentialsUrl = bundle('src/bin/detectors/detectCredentials.ts', 'detectCredentials.mjs');
const routesUrl      = bundle('src/bin/detectors/detectRoutes.ts', 'detectRoutes.mjs');
const themeUrl        = bundle('src/bin/detectors/detectTheme.ts', 'detectTheme.mjs');
const secretGuardUrl  = bundle('src/bin/utils/secretGuard.ts', 'secretGuard.mjs');

const { detectCredentials } = await import(credentialsUrl);
const { detectRoutes }      = await import(routesUrl);
const { detectTheme }       = await import(themeUrl);
const { assertSafeToRead }  = await import(secretGuardUrl);

// ── Fixture project ──────────────────────────────────────────────────────────
const fixtureDir = mkdtempSync(join(tmpdir(), 'qapture-cli-detectors-'));

try {
  // --- Bug #5 + #8 fixture: two seeder files, engineered so a match near the
  // end of file A and a match near the start of file B land within the
  // existing 20-line proximity window if file boundaries were ignored.
  mkdirSync(join(fixtureDir, 'seeders'), { recursive: true });
  const fileALines = Array.from({ length: 38 }, (_, i) => `// filler line ${i}`);
  fileALines.push(`  email: 'buyer@fileA.test',`); // lineIdx 38
  writeFileSync(join(fixtureDir, 'seeders', 'aSeeder.ts'), fileALines.join('\n') + '\n');

  const fileBLines = [`  password: 'UnrelatedFileB!23',`]; // lineIdx 0 — only 1 line "away" from fileA's match if boundaries ignored
  writeFileSync(join(fixtureDir, 'seeders', 'bSeeder.ts'), fileBLines.join('\n') + '\n');

  // Bug #8 fixture: isolated in its own file/cluster so it can't collide with
  // another same-type match elsewhere and get shadowed by Array.find() picking
  // the first candidate in a cluster (a separate, pre-existing heuristic
  // limitation of groupMatches — not what bug #8 is about).
  const fileCLines = [
    `const adminEmail = 'admin@fileC.test';`,
    `const adminPassword = 'CamelCase!42';`, // bug #8: camelCase, no word boundary before "Password"
    `const GUEST_ROLE = 'guest';`,
  ];
  writeFileSync(join(fixtureDir, 'seeders', 'cSeeder.ts'), fileCLines.join('\n') + '\n');

  const creds = detectCredentials(fixtureDir);

  const fabricated = creds.find(
    (c) => c.login === 'buyer@fileA.test' && c.password === 'UnrelatedFileB!23',
  );
  assertTrue(!fabricated, '#5 detectCredentials never pairs an email from one file with a password from a different file');

  const camelCase = creds.find((c) => c.login === 'admin@fileC.test' && c.password === 'CamelCase!42');
  assertTrue(!!camelCase, '#8 detectCredentials picks up camelCase `const adminPassword = ...` declarations');

  // --- Bug #6 fixture: Next.js pages-router routes that should NOT be
  // misclassified as auth/admin by a bare prefix match.
  const pagesDir = join(fixtureDir, 'pages');
  for (const route of ['registered-users', 'authors', 'administrator-guide', 'login']) {
    mkdirSync(pagesDir, { recursive: true });
    writeFileSync(join(pagesDir, `${route}.tsx`), 'export default function Page() { return null; }\n');
  }
  mkdirSync(join(pagesDir, 'admin'), { recursive: true });
  writeFileSync(join(pagesDir, 'admin', 'dashboard.tsx'), 'export default function Page() { return null; }\n');

  const journey = detectRoutes(fixtureDir);
  const buyerLane = journey.find((l) => l.id === 'buyer');
  const adminLane = journey.find((l) => l.id === 'admin');
  const buyerPaths = (buyerLane?.steps ?? []).map((s) => s.path);
  const adminPaths = (adminLane?.steps ?? []).map((s) => s.path);

  assertTrue(buyerPaths.includes('/registered-users'), '#6 /registered-users is NOT misclassified as auth (prefix "register")');
  assertTrue(buyerPaths.includes('/authors'), '#6 /authors is NOT misclassified as auth (prefix "auth")');
  assertTrue(buyerPaths.includes('/administrator-guide'), '#6 /administrator-guide is NOT misclassified as admin (prefix "admin")');
  assertTrue(!buyerPaths.includes('/login') && !adminPaths.includes('/login'), '#6 /login is still correctly excluded as an auth route');
  assertTrue(adminPaths.includes('/admin/dashboard'), '#6 /admin/dashboard is still correctly classified as admin');

  // --- Bug #7 fixture: case-sensitivity of the exact-basename blocklist.
  writeFileSync(join(fixtureDir, '.ENV'), 'SECRET=should-never-be-read\n');
  writeFileSync(join(fixtureDir, '.env'), 'SECRET=should-never-be-read\n');
  writeFileSync(join(fixtureDir, '.env.example'), 'EMAIL=demo@example.test\n');

  assertTrue(assertSafeToRead(join(fixtureDir, '.ENV')) === false, '#7 secretGuard blocks uppercase ".ENV" just like ".env"');
  assertTrue(assertSafeToRead(join(fixtureDir, '.env')) === false, '#7 secretGuard still blocks lowercase ".env"');
  assertTrue(assertSafeToRead(join(fixtureDir, '.env.example')) === true, '#7 secretGuard still allows ".env.example"');

  // --- Bug #16 fixture: nested Tailwind shade object.
  writeFileSync(
    join(fixtureDir, 'tailwind.config.js'),
    `module.exports = {\n` +
      `  theme: {\n` +
      `    extend: {\n` +
      `      colors: {\n` +
      `        primary: { 50: '#eef2ff', 500: '#4f46e5', DEFAULT: '#4f46e5' },\n` +
      `        accent: '#7c3aed',\n` +
      `      },\n` +
      `    },\n` +
      `  },\n` +
      `};\n`,
  );

  const theme = detectTheme(fixtureDir);
  assertTrue(theme.primary === '#4f46e5', `#16 detectTheme resolves nested primary shade to #4f46e5 (got ${theme.primary})`);
  assertTrue(theme.accent === '#7c3aed', `#16 detectTheme still resolves flat accent color (got ${theme.accent})`);
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nCLI DETECTORS SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nCLI DETECTORS SMOKE PASS ✅');
