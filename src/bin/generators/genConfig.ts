/**
 * genConfig — assemble the text of qa.config.ts (or qa.config.js).
 *
 * The generated file exports a single default object that matches QaConfig:
 *   namespace / theme / brand / loginField / credentials / journey / preamble
 *
 * All unknown/undetected values are left as 'TODO:' strings with explanatory
 * inline comments so the developer knows exactly what to fill in.
 *
 * Does NOT write any files — returns the text only. Writing is handled by init.ts.
 */

import type { ThemeDraft } from '../detectors/detectTheme.js';
import type { JourneyDraft, JourneyLane, JourneyStep } from '../detectors/detectRoutes.js';
import type { CredentialDraft } from '../detectors/detectCredentials.js';
import { CREDENTIALS_BANNER } from '../detectors/detectCredentials.js';
import { PLACEHOLDER } from '../detectors/detectTheme.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface GenConfigOptions {
  /** Resolved namespace (package name or 'qapture'). */
  namespace:    string;
  /** true → emit qa.config.ts; false → emit qa.config.js */
  isTypeScript: boolean;
  theme:        ThemeDraft;
  journey:      JourneyDraft;
  credentials:  CredentialDraft[];
  /** Optional detected framework hints for doc comments. */
  frameworkHints?: string[];
}

export interface GenConfigResult {
  filename: string; // 'qa.config.ts' | 'qa.config.js'
  text:     string;
}

// ── Serialisation helpers ─────────────────────────────────────────────────────

function singleQuote(s: string): string {
  // Escape single quotes inside the string
  return `'${s.replace(/'/g, "\\'")}'`;
}

function serializeTheme(theme: ThemeDraft): string {
  const lines: string[] = [];
  const keys = Object.keys(theme) as Array<keyof ThemeDraft>;

  for (const key of keys) {
    const val = theme[key];
    const isPlaceholder = val === PLACEHOLDER;
    if (isPlaceholder) {
      lines.push(`    ${key}: ${singleQuote(val)}, // TODO: replace with your brand colour`);
    } else {
      lines.push(`    ${key}: ${singleQuote(val)},`);
    }
  }

  return `  theme: {\n${lines.join('\n')}\n  }`;
}

function serializeCredentials(creds: CredentialDraft[]): string {
  if (creds.length === 0) {
    return (
      `  // ${CREDENTIALS_BANNER.replace(/\n/g, '\n  // ')}\n` +
      `  credentials: [\n` +
      `    // TODO: add dev/test credentials here (seeder/seed data)\n` +
      `    // { role: 'buyer', login: 'buyer@test.com', password: 'test123', seeded: true },\n` +
      `  ]`
    );
  }

  const banner = CREDENTIALS_BANNER.split('\n').map(l => `  ${l}`).join('\n');
  const rows = creds.map(c => {
    const lines = [
      `    {`,
      `      role:     ${singleQuote(c.role)},`,
      `      login:    ${singleQuote(c.login)},`,
      `      password: ${singleQuote(c.password)},`,
      `      seeded:   true,`,
      `    }`,
    ];
    return lines.join('\n');
  });

  return `${banner}\n  credentials: [\n${rows.join(',\n')},\n  ]`;
}

function serializeStep(step: JourneyStep): string {
  // `what` is always an object from detectRoutes — { en, ar }
  const what = `{ en: ${singleQuote(step.what.en)}, ar: ${singleQuote(step.what.ar)} }`;

  return [
    `        {`,
    `          path: ${singleQuote(step.path)},`,
    `          // TODO: grade — risk 'red' (money/auth/irreversible) | 'amber' (important) | 'green' (informational)`,
    `          risk: 'green',`,
    `          what: ${what},`,
    `        }`,
  ].join('\n');
}

function serializeLane(lane: JourneyLane): string {
  // `role` is always an object from detectRoutes — { en, ar }
  const role = `{ en: ${singleQuote(lane.role.en)}, ar: ${singleQuote(lane.role.ar)} }`;

  const steps = lane.steps.map(s => serializeStep(s)).join(',\n');

  return [
    `    {`,
    `      id:    ${singleQuote(lane.id)},`,
    `      color: ${singleQuote(lane.color ?? '#4f46e5')},`,
    `      role:  ${role},`,
    `      steps: [`,
    steps,
    `      ],`,
    `    }`,
  ].join('\n');
}

function serializeJourney(journey: JourneyDraft): string {
  if (journey.length === 0) {
    return (
      `  journey: [\n` +
      `    // TODO: add journey lanes here. See qa.preamble.md for guidance.\n` +
      `    // { id: 'buyer', color: '#4f46e5', role: { en: 'Buyer', ar: 'مشتري' }, steps: [...] },\n` +
      `  ]`
    );
  }

  const lanes = journey.map(l => serializeLane(l)).join(',\n');
  return `  journey: [\n${lanes},\n  ]`;
}

function serializePreamble(): string {
  return [
    `  /**`,
    `   * preamble — read by your AI coding agent (Claude Code, Cursor, Windsurf, etc.)`,
    `   * when it processes a qa-notes-*.zip export. Fill every TODO field.`,
    `   * Alternatively, fill qa.preamble.md and copy the values here.`,
    `   */`,
    `  preamble: {`,
    `    projectName:       'TODO: Your Project Name',`,
    `    oneLiner:          'TODO: one sentence describing what this project does',`,
    `    stack:             'TODO: e.g. Next.js 14, React 18, Prisma, PostgreSQL, Tailwind',`,
    `    runCommands:       'TODO: e.g. npm run dev   (starts on http://localhost:3000)',`,
    `    conventions:       'TODO: coding conventions, naming patterns, file organisation',`,
    `    invariants:        'TODO: things that must ALWAYS be true (e.g. prices ≥ 0, auth required for checkout)',`,
    `    verifySteps:       'TODO: how to confirm a fix worked (e.g. reload + complete the flow)',`,
    `    additionalContext: 'TODO: anything else the AI agent should know',`,
    `  }`,
  ].join('\n');
}

// ── Main assembler ────────────────────────────────────────────────────────────

/**
 * Generate the full text of qa.config.ts or qa.config.js.
 */
export function genConfigText(opts: GenConfigOptions): GenConfigResult {
  const { namespace, isTypeScript, theme, journey, credentials, frameworkHints = [] } = opts;

  const filename = isTypeScript ? 'qa.config.ts' : 'qa.config.js';

  const hintsComment =
    frameworkHints.length > 0
      ? ` *\n * Auto-detected stack:\n${frameworkHints.map(h => ` *   • ${h}`).join('\n')}`
      : '';

  const typeImport = isTypeScript
    ? `import type { QaConfig } from 'qapture2';\n\n`
    : `// @ts-check\n/** @type {import('qapture2').QaConfig} */\n`;

  const typeAnnotation = isTypeScript ? ': QaConfig' : '';
  const exportStatement = `export default config;\n`;

  const header = [
    `/**`,
    ` * qapture config — generated by \`qapture init\``,
    ` *`,
    ` * Fill every TODO field before mounting <Qapture config={config} />.`,
    ` * Re-run \`qapture init --force\` only if you want to regenerate from scratch`,
    ` * (your edits WILL be overwritten with --force).`,
    ` *`,
    ` * Schema reference: https://github.com/mohammed-farhood/qapture#qaconfig`,
    hintsComment,
    ` */`,
  ]
    .filter(l => l !== '')
    .join('\n');

  const themeBlock       = serializeTheme(theme);
  const credentialsBlock = serializeCredentials(credentials);
  const journeyBlock     = serializeJourney(journey);
  const preambleBlock    = serializePreamble();

  const body = [
    `const config${typeAnnotation} = {`,
    `  namespace: ${singleQuote(namespace)},`,
    ``,
    themeBlock + ',',
    ``,
    `  brand: {`,
    `    label: 'TODO: Your Project Name', // displayed in the QA panel header`,
    `  },`,
    ``,
    `  loginField: {`,
    `    en: 'TODO: e.g. Email or Username',`,
    `    ar: 'TODO: e.g. البريد الإلكتروني',`,
    `  },`,
    ``,
    credentialsBlock + ',',
    ``,
    journeyBlock + ',',
    ``,
    preambleBlock + ',',
    `};`,
  ].join('\n');

  const text = [header, '', typeImport + body, '', exportStatement].join('\n');

  return { filename, text };
}
