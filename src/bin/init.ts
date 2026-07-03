/**
 * qapture CLI — deterministic, AI-free, network-free scaffolder.
 *
 * CORE PHILOSOPHY: Qapture ships ZERO AI. No model, no API keys, no network
 * calls. This CLI is a plain deterministic scaffolder: it greps the target repo
 * and drops a draft config + skill/markdown templates. It never calls an AI and
 * never reads real secrets.
 *
 * Commands:
 *   qapture init [target-dir] [--force]   ← main command
 *   qapture version                        ← print version
 *
 * The #!/usr/bin/env node shebang is injected by tsup's banner config.
 * DO NOT add a shebang here.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as process from 'node:process';

// ── Static AI artifacts — bundled as text constants by tsup's md loader ───────
import SKILL_MD      from '../artifacts/SKILL.md';
import AGENTS_SECTION from '../artifacts/AGENTS_SECTION.md';

// ── Utils ─────────────────────────────────────────────────────────────────────
import { parseArgs } from './utils/args.js';
import { writeIfAbsent, writeAlways } from './utils/writeIdempotent.js';
import { mergeAgentsMd } from './utils/mergeAgentsMd.js';

// ── Detectors ─────────────────────────────────────────────────────────────────
import { detectRoutes } from './detectors/detectRoutes.js';
import { detectTheme, hasDetectedColors } from './detectors/detectTheme.js';
import { detectCredentials } from './detectors/detectCredentials.js';

// ── Generators ────────────────────────────────────────────────────────────────
import { genConfigText } from './generators/genConfig.js';
import { genPreambleText } from './generators/genPreamble.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const REPO_URL = 'https://github.com/mohammed-farhood/qapture';

const PKG_VERSION = (() => {
  // Try to read our own package.json (bundled into dist/, so walk up from __dirname)
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'package.json'),
      path.join(__dirname, '..', 'package.json'),
      path.join(__dirname, 'package.json'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      }
    }
  } catch { /* ignore */ }
  return '0.x';
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function readTargetPkg(targetDir: string): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function hasFile(targetDir: string, ...names: string[]): boolean {
  return names.some(n => fs.existsSync(path.join(targetDir, n)));
}

/** Detect framework hints for doc comments and stack detection. */
function detectFrameworkHints(targetDir: string, pkg: Record<string, unknown>): string[] {
  const hints: string[] = [];
  const deps = {
    ...((pkg['dependencies'] as Record<string, unknown>) ?? {}),
    ...((pkg['devDependencies'] as Record<string, unknown>) ?? {}),
  };

  const hasDep = (name: string) => name in deps;

  // Framework
  if (hasDep('next'))        hints.push('Next.js');
  if (hasDep('nuxt'))        hints.push('Nuxt');
  if (hasDep('astro'))       hints.push('Astro');
  if (hasDep('vite') && !hasDep('next')) hints.push('Vite');
  if (hasDep('remix'))       hints.push('Remix');
  if (hasDep('gatsby'))      hints.push('Gatsby');
  if (hasDep('svelte'))      hints.push('Svelte');

  // UI
  if (hasDep('react'))       hints.push('React');
  if (hasDep('vue'))         hints.push('Vue');

  // Styling
  if (hasDep('tailwindcss')) hints.push('Tailwind CSS');
  if (hasDep('styled-components')) hints.push('styled-components');

  // ORM / DB
  if (hasDep('@prisma/client') || hasDep('prisma')) hints.push('Prisma');
  if (hasDep('drizzle-orm'))   hints.push('Drizzle ORM');
  if (hasDep('mongoose'))      hints.push('MongoDB/Mongoose');
  if (hasDep('typeorm'))       hints.push('TypeORM');

  // Auth
  if (hasDep('next-auth') || hasDep('@auth/core')) hints.push('NextAuth');
  if (hasDep('lucia'))         hints.push('Lucia');
  if (hasDep('clerk'))         hints.push('Clerk');

  // Language
  if (hasFile(targetDir, 'tsconfig.json')) hints.push('TypeScript');

  return hints;
}

// ── Output helpers ────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(
    `\nqapture CLI v${PKG_VERSION}\n` +
    `\nUsage:\n` +
    `  qapture init [target-dir] [--force]   Scaffold config + artifacts into target-dir\n` +
    `  qapture version                        Print version\n` +
    `\nOptions:\n` +
    `  --force  Overwrite qa.config.* and qa.preamble.md if they already exist\n` +
    `           (SKILL.md is always refreshed regardless of --force)\n` +
    `\nDocs: ${REPO_URL}\n\n`,
  );
}

function printVersion(): void {
  process.stdout.write(`qapture ${PKG_VERSION}\n`);
}

const DIVIDER = '─'.repeat(60);

function printSummary(
  targetDir: string,
  configFile: string,
  results: {
    config:    'written' | 'skipped';
    preamble:  'written' | 'skipped';
    skill:     'written';
    agents:    'created' | 'replaced' | 'appended';
  },
  routeCount: number,
  credCount:  number,
  colorsDetected: boolean,
): void {
  const icon = (r: string) => r === 'skipped' ? '  (skip)' : '  ✓';

  const configLabel   = configFile;
  const preambleLabel = 'qa.preamble.md';
  const skillLabel    = '.claude/skills/qapture/SKILL.md';
  const agentsLabel   = 'AGENTS.md';

  const configNote    = results.config   === 'skipped' ? ' (already exists — use --force to overwrite)' : ' (review & fill TODOs)';
  const preambleNote  = results.preamble === 'skipped' ? ' (already exists — use --force to overwrite)' : ' (fill project context)';
  const agentsNote    = results.agents === 'created' ? ' (created)' : results.agents === 'replaced' ? ' (section updated)' : ' (section appended)';

  process.stdout.write(
    `\n${DIVIDER}\n` +
    `  qapture init — done!\n` +
    `${DIVIDER}\n` +
    `\n` +
    `  Files:\n` +
    `${icon(results.config)}  ${configLabel}${configNote}\n` +
    `${icon(results.preamble)}  ${preambleLabel}${preambleNote}\n` +
    `  ✓  ${skillLabel} (always refreshed)\n` +
    `  ✓  ${agentsLabel}${agentsNote}\n` +
    `\n` +
    `  Detected:\n` +
    `    • Routes/steps : ${routeCount > 0 ? routeCount : 'none (fallback placeholder added)'}\n` +
    `    • Brand colours: ${colorsDetected ? 'partial palette detected' : 'none (all #REPLACE_ME)'}\n` +
    `    • Credentials  : ${credCount > 0 ? credCount + ' row(s) from .env.example/seeders' : 'none (add manually)'}\n` +
    `\n` +
    `${DIVIDER}\n` +
    `  Mount the widget near your app root:\n` +
    `${DIVIDER}\n` +
    `\n` +
    `    import { Qapture } from 'qapture2';\n` +
    `    import config from './${configFile.replace(/\.[jt]s$/, '')}';\n` +
    `\n` +
    `    // Render once near your app root:\n` +
    `    <Qapture config={config} />\n` +
    `\n` +
    `${DIVIDER}\n` +
    `  Next steps:\n` +
    `${DIVIDER}\n` +
    `\n` +
    `    1. Fill in ${preambleLabel} with your project context\n` +
    `       (or ask your terminal agent to auto-populate it from the codebase)\n` +
    `    2. Sync the preamble into the preamble block of ${configLabel}\n` +
    `    3. Grade JOURNEY risk levels — change  risk: 'green'  to:\n` +
    `         'red'   → money / auth / irreversible flows\n` +
    `         'amber' → important but recoverable flows\n` +
    `         'green' → informational / display only  (current default)\n` +
    `    4. Fill remaining TODO: fields in ${configLabel}\n` +
    `    5. Run your app and open Qapture (shortcut: Shift+Alt+Q)\n` +
    `\n` +
    `${DIVIDER}\n` +
    `  IDE advisory:\n` +
    `${DIVIDER}\n` +
    `\n` +
    `    Cursor   → copy the qapture block from AGENTS.md\n` +
    `               into  .cursor/rules/qapture.md\n` +
    `\n` +
    `    Windsurf → append the qapture block from AGENTS.md\n` +
    `               to    .windsurf/rules.md\n` +
    `\n` +
    `  Docs: ${REPO_URL}\n` +
    `${DIVIDER}\n\n`,
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(argv: string[]): void {
  const args = parseArgs(argv);

  // ── version ────────────────────────────────────────────────────────────────
  if (args.command === 'version') {
    printVersion();
    process.exit(0);
  }

  // ── help ───────────────────────────────────────────────────────────────────
  if (args.command === 'help') {
    printUsage();
    process.exit(0);
  }

  // ── init ───────────────────────────────────────────────────────────────────

  const targetDir = path.resolve(args.dir);
  const { force } = args;

  // Validate target directory
  if (!fs.existsSync(targetDir)) {
    process.stderr.write(`\nError: target directory does not exist: ${targetDir}\n\n`);
    process.exit(1);
  }

  if (!fs.statSync(targetDir).isDirectory()) {
    process.stderr.write(`\nError: ${targetDir} is not a directory\n\n`);
    process.exit(1);
  }

  process.stdout.write(`\nqapture init — scanning ${targetDir} ...\n`);

  // ── 1. Detect ────────────────────────────────────────────────────────────
  const pkg            = readTargetPkg(targetDir);
  const frameworkHints = detectFrameworkHints(targetDir, pkg);
  const isTypeScript   = hasFile(targetDir, 'tsconfig.json');

  process.stdout.write(`  Detecting routes ...\n`);
  const journey        = detectRoutes(targetDir);
  const routeCount     = journey.reduce((n, lane) => n + lane.steps.length, 0);

  process.stdout.write(`  Detecting theme ...\n`);
  const theme          = detectTheme(targetDir);
  const colorsDetected = hasDetectedColors(theme);

  process.stdout.write(`  Detecting credentials (safe sources only) ...\n`);
  const credentials    = detectCredentials(targetDir);

  // Derive namespace from package.json name
  const namespace =
    typeof pkg['name'] === 'string' && pkg['name'].trim()
      ? (pkg['name'] as string).trim().replace(/^@[^/]+\//, '') // strip scope
      : 'qapture';

  const projectName =
    typeof pkg['name'] === 'string' && pkg['name'].trim()
      ? (pkg['name'] as string).trim()
      : undefined;

  // ── 2. Generate ──────────────────────────────────────────────────────────
  process.stdout.write(`  Generating files ...\n`);

  const { filename: configFilename, text: configText } = genConfigText({
    namespace,
    isTypeScript,
    theme,
    journey,
    credentials,
    frameworkHints,
  });

  const preambleText = genPreambleText({ projectName, frameworkHints });

  // ── 3. Write ─────────────────────────────────────────────────────────────
  const configPath   = path.join(targetDir, configFilename);
  const preamblePath = path.join(targetDir, 'qa.preamble.md');
  const skillPath    = path.join(targetDir, '.claude', 'skills', 'qapture', 'SKILL.md');
  const agentsMdPath = path.join(targetDir, 'AGENTS.md');

  const configResult   = writeIfAbsent(configPath,   configText,   force);
  const preambleResult = writeIfAbsent(preamblePath, preambleText, force);

  // SKILL.md is always overwritten — it's a static vendor artifact
  writeAlways(skillPath, SKILL_MD);
  const skillResult = 'written' as const;

  // Merge AGENTS.md (idempotent via sentinels)
  const agentsResult = mergeAgentsMd(agentsMdPath, AGENTS_SECTION);

  // ── 4. Summary ───────────────────────────────────────────────────────────
  printSummary(
    targetDir,
    configFilename,
    { config: configResult, preamble: preambleResult, skill: skillResult, agents: agentsResult },
    routeCount,
    credentials.length,
    colorsDetected,
  );
}

main(process.argv.slice(2));
