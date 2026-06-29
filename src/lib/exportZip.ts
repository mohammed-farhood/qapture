/**
 * exportZip.ts — bundle all points into a single ZIP (notes.md + screenshots/).
 *
 * Ported faithfully from qa-overlay/exportZip.js and extended in Phase 2
 * to include an AI handoff preamble at the top of notes.md.
 *
 * File structure of notes.md:
 *   [AI handoff preamble — sections 1-10]
 *   ---NOTES---
 *   # {brand.label} Testing Notes
 *   Exported / Total points / per-point sections (UNCHANGED format)
 *
 * When config / preamble / journey are absent the preamble degrades
 * gracefully, marking each missing section as "(not provided)" or "(none)".
 *
 * Note: QaNote/QaTarget/QaRect types are defined locally here to avoid a
 * circular dependency with QaContext (which imports buildAndDownloadZip).
 * Schema types (QaJourneyLane, QaTheme, etc.) are safe to import from
 * schema.ts because schema.ts has no dependency on exportZip.ts.
 */

import type { QaJourneyLane, QaTheme, QaCredential, QaPreamble } from '../config/schema';
import { computeCoverage } from './coverage';

// ---------------------------------------------------------------------------
// Local aliases for QaNote / QaTarget / QaRect (avoid circular dep)
// ---------------------------------------------------------------------------

type ExportRect = { top: number; left: number; width: number; height: number };
type ExportTarget = {
  kind: 'element' | 'region';
  selector?: string;
  tagName?: string;
  text?: string;
  rect?: ExportRect;
};
type ExportNote = {
  id: string;
  url: string;
  route: string;
  timestamp: string;
  description: string;
  screenshot?: Blob;
  target?: ExportTarget;
};

// ---------------------------------------------------------------------------
// Config shape accepted by buildAndDownloadZip
// ---------------------------------------------------------------------------

/**
 * Subset of ResolvedConfig relevant for the export.
 * All fields optional so that callers can pass a partial or null config
 * and the preamble will degrade gracefully.
 */
export type ExportConfig = {
  theme?:       QaTheme;
  brand?:       { label: string };
  loginField?:  { en: string; ar?: string };
  credentials?: QaCredential[];
  journey?:     QaJourneyLane[];
  preamble?:    QaPreamble | null;
};

// ---------------------------------------------------------------------------
// Per-point formatter (UNCHANGED from baseline)
// ---------------------------------------------------------------------------

function fmtTarget(t: ExportTarget): string[] {
  const lines: string[] = [];
  lines.push(`- **Target:** ${t.kind === 'region' ? 'freeform region' : 'element'}`);
  if (t.selector) lines.push(`- **Selector:** \`${t.selector}\``);
  if (t.tagName)  lines.push(`- **Tag:** \`<${t.tagName}>\``);
  if (t.text)     lines.push(`- **Text:** ${t.text}`);
  if (t.rect) {
    lines.push(
      `- **Position:** top ${t.rect.top}, left ${t.rect.left}, ${t.rect.width}×${t.rect.height}`,
    );
  }
  return lines;
}

function fmt(note: ExportNote, index: number): string {
  const num   = index + 1;
  const lines: string[] = [`## Point ${num}`];
  lines.push(`- **Page:** ${note.route || note.url || '(unknown)'}`);
  if (note.url && note.url !== note.route) lines.push(`- **Full URL:** ${note.url}`);
  lines.push(`- **When:** ${note.timestamp}`);
  if (note.target) {
    lines.push(...fmtTarget(note.target));
  }
  if (note.screenshot) lines.push(`- **Screenshot:** screenshots/point-${num}.png`);
  lines.push('', note.description || '(no description)', '', '---', '');
  return lines.join('\n');
}

function safeName(name: string | undefined, stamp: string): string {
  const fallback = `qa-notes-${stamp.slice(0, 10)}`;
  let base = (name ?? '').trim().replace(/\.zip$/i, '');
  base = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80).trim();
  return `${base || fallback}.zip`;
}

// ---------------------------------------------------------------------------
// Preamble builder helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a preamble list field (string | string[] | undefined) to string[].
 * A plain string is split on newlines; blank lines are discarded.
 */
function toStrings(val: string | string[] | undefined | null): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val.filter((l) => String(l).trim().length > 0);
  return val.split('\n').filter((l) => l.trim().length > 0);
}

/** Render a Markdown pipe table from headers + data rows. */
function mdTable(headers: string[], rows: string[][]): string {
  const sep  = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`),
  ];
  return lines.join('\n');
}

/** Format a coverage percentage (0–1 or NaN) as a readable string. */
function fmtPct(n: number, d: number): string {
  if (d === 0) return 'N/A';
  return `${Math.round((n / d) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Preamble builder
// ---------------------------------------------------------------------------

/**
 * Build the AI handoff preamble markdown block.
 * Degrades gracefully when config or preamble fields are absent.
 */
function buildPreamble(
  config: ExportConfig,
  guideChecked: Set<string>,
  stamp: string,
  noteCount: number,
): string {
  const sections: string[] = [];

  // Resolve top-level helpers (all null-safe)
  const p:           QaPreamble     = config.preamble ?? {};
  const brandLabel:  string         = config.brand?.label ?? 'Qapture';
  const projectName: string         = (typeof p.projectName === 'string' && p.projectName.trim())
    ? p.projectName.trim()
    : brandLabel;
  const loginLabel:  string         = config.loginField?.en ?? 'Login';
  const journey:     QaJourneyLane[] = config.journey ?? [];

  // ── 1. HTML-comment banner ────────────────────────────────────────────────
  sections.push(
    '<!-- Qapture Export Preamble — read before acting on any point. ' +
    'NO AI is bundled in Qapture — YOU are the AI reading this. -->',
  );

  // ── 2. Project title + oneLiner + stamp + point count ────────────────────
  const oneLiner = typeof p.oneLiner === 'string' && p.oneLiner.trim()
    ? `\n> ${p.oneLiner.trim()}`
    : '';
  sections.push(
    `# ${projectName} — QA Handoff${oneLiner}\n\n` +
    `Exported: ${stamp}  \n` +
    `Points: ${noteCount}`,
  );

  // ── 3. Project table ──────────────────────────────────────────────────────
  const stack = typeof p.stack === 'string' && p.stack.trim()
    ? p.stack.trim()
    : '(not provided)';
  const runArr = toStrings(p.runCommands as string | string[] | undefined);
  const runValue = runArr.length > 0
    ? runArr.map((c) => `\`${c}\``).join(', ')
    : '(not provided)';
  sections.push(
    `## Project\n\n${mdTable(
      ['Field', 'Value'],
      [
        ['Name',         projectName],
        ['Stack',        stack],
        ['Run commands', runValue],
      ],
    )}`,
  );

  // ── 4. Theme Tokens table ─────────────────────────────────────────────────
  if (config.theme) {
    const tokenRows = Object.entries(config.theme).map(
      ([k, v]) => [k, typeof v === 'string' ? v : String(v)],
    );
    sections.push(
      `## Theme Tokens\n\n${mdTable(['Token', 'Hex'], tokenRows)}`,
    );
  } else {
    sections.push('## Theme Tokens\n\n(not provided)');
  }

  // ── 5. Conventions ────────────────────────────────────────────────────────
  const conventions = toStrings(p.conventions as string | string[] | undefined);
  if (conventions.length > 0) {
    const list = conventions.map((c, i) => `${i + 1}. ${c}`).join('\n');
    sections.push(`## Conventions\n\n${list}`);
  } else {
    sections.push('## Conventions\n\n(not provided)');
  }

  // ── 6. Login Context ──────────────────────────────────────────────────────
  const creds: QaCredential[] = config.credentials ?? [];
  let credBlock: string;
  if (creds.length > 0) {
    const credRows = creds.map((c) => [
      c.role,
      c.login,
      c.password || '(none)',
      c.seeded ? 'seeded' : 'manual',
      c.hint?.en ?? '—',
    ]);
    credBlock = mdTable(
      ['Role', loginLabel, 'Password', 'Status', 'Hint'],
      credRows,
    );
  } else {
    credBlock = '(not provided)';
  }
  sections.push(
    `## Login Context\n\n${credBlock}\n\n` +
    '> **WARNING:** These are DEV/TEST/SEED credentials only. ' +
    'Never forward, commit, or use in production.',
  );

  // ── 7. Coverage Report ────────────────────────────────────────────────────
  const cov = computeCoverage(journey, guideChecked);

  const covTableRows: string[][] = [
    ['RED',   String(cov.red.total),   String(cov.red.covered),   String(cov.red.total   - cov.red.covered),   fmtPct(cov.red.covered,   cov.red.total)],
    ['AMBER', String(cov.amber.total), String(cov.amber.covered), String(cov.amber.total - cov.amber.covered), fmtPct(cov.amber.covered, cov.amber.total)],
    ['GREEN', String(cov.green.total), String(cov.green.covered), String(cov.green.total - cov.green.covered), fmtPct(cov.green.covered, cov.green.total)],
    ['TOTAL', String(cov.total.total), String(cov.total.covered), String(cov.total.total - cov.total.covered), fmtPct(cov.total.covered, cov.total.total)],
  ];

  const uncoveredList = cov.uncoveredReds.length > 0
    ? cov.uncoveredReds
        .map((r) => {
          const why = r.riskWhy ? ` — ${r.riskWhy}` : '';
          return `- [ ] [${r.lane}] ${r.path}${why}`;
        })
        .join('\n')
    : '(none)';

  const coveredList = cov.coveredReds.length > 0
    ? cov.coveredReds.map((r) => `- [x] [${r.lane}] ${r.path}`).join('\n')
    : '(none)';

  sections.push(
    `## Coverage Report\n\n` +
    `${mdTable(['Risk', 'Total', 'Covered', 'Uncovered', 'Coverage %'], covTableRows)}\n\n` +
    `Coverage tier: **${cov.tier}**\n\n` +
    `### Uncovered RED zones (verify before shipping)\n\n${uncoveredList}\n\n` +
    `### Covered RED zones\n\n${coveredList}\n\n` +
    '> Supervision note: Flag any uncovered RED zones that are directly related to the ' +
    'change requests in this batch — but do not block delivery on unrelated uncovered reds.',
  );

  // ── 8. How to Verify a Fix ────────────────────────────────────────────────
  const verifySteps = toStrings(p.verifySteps as string | string[] | undefined);
  if (verifySteps.length > 0) {
    const list = verifySteps.map((s, i) => `${i + 1}. ${s}`).join('\n');
    sections.push(`## How to Verify a Fix\n\n${list}`);
  } else {
    sections.push('## How to Verify a Fix\n\n(not provided)');
  }

  // ── 9. Invariants (Do Not Break) ──────────────────────────────────────────
  const invariants = toStrings(p.invariants as string | string[] | undefined);
  if (invariants.length > 0) {
    const list = invariants.map((s, i) => `${i + 1}. ${s}`).join('\n');
    sections.push(`## Invariants (Do Not Break)\n\n${list}`);
  } else {
    sections.push('## Invariants (Do Not Break)\n\n(not provided)');
  }

  // ── 10. Additional Context ────────────────────────────────────────────────
  const additionalContext =
    typeof p.additionalContext === 'string' && p.additionalContext.trim()
      ? p.additionalContext.trim()
      : '(none)';
  sections.push(`## Additional Context\n\n${additionalContext}`);

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a ZIP archive from the given notes and trigger a browser download.
 *
 * The generated notes.md is structured as:
 *   [AI handoff preamble]
 *   ---NOTES---
 *   # {brand.label} Testing Notes
 *   [per-point sections — identical format to the original baseline]
 *
 * @param notes        - the full list of QA notes to export
 * @param stamp        - ISO timestamp for the export header
 * @param filename     - user-supplied base name (without .zip extension)
 * @param config       - resolved config supplying brand/theme/credentials/journey/preamble
 * @param guideChecked - set of checked guide step keys for coverage computation
 */
export async function buildAndDownloadZip(
  notes:         ExportNote[],
  stamp:         string,
  filename?:     string,
  config?:       ExportConfig,
  guideChecked?: Set<string>,
): Promise<void> {
  // SSR guard — browser-only API
  if (typeof document === 'undefined') return;

  const { default: JSZip } = await import('jszip');
  const zip   = new JSZip();
  const shots = zip.folder('screenshots');

  const resolvedChecked = guideChecked ?? new Set<string>();
  const resolvedConfig: ExportConfig = config ?? {};

  // ── Preamble block ────────────────────────────────────────────────────────
  const preambleMd = buildPreamble(resolvedConfig, resolvedChecked, stamp, notes.length);

  // ── Notes section header (unchanged baseline format) ──────────────────────
  const brandLabel = resolvedConfig.brand?.label ?? 'Qapture';
  const notesHeader = [
    `# ${brandLabel} Testing Notes`,
    '',
    `Exported: ${stamp}`,
    `Total points: ${notes.length}`,
    '',
    'Each point below is a requested change, bug, or observation captured while',
    'testing. Where present, a screenshot of the exact element/region is in the',
    'screenshots/ folder, referenced by point number.',
    '',
    '---',
    '',
  ].join('\n');

  // ── Assemble notes.md ─────────────────────────────────────────────────────
  const notesMd =
    preambleMd +
    '\n\n---NOTES---\n\n' +
    notesHeader +
    notes.map((n, i) => fmt(n, i)).join('\n');

  zip.file('notes.md', notesMd);

  // ── Screenshots ───────────────────────────────────────────────────────────
  notes.forEach((n, i) => {
    if (n.screenshot && shots) {
      shots.file(`point-${i + 1}.png`, n.screenshot);
    }
  });

  // ── Generate + download ───────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = safeName(filename, stamp);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Alias matching the original exportZip.js export name.
 */
export const exportZip = buildAndDownloadZip;
