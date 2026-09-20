/**
 * exportZip.ts — bundle all points into a single ZIP (notes.md + screenshots/).
 *
 * Ported faithfully from qa-overlay/exportZip.js and extended in Phase 2
 * to include an AI handoff preamble at the top of notes.md, then in v0.3 to
 * delegate each point's body to noteMarkdown.ts so a note reads identically
 * here and in the "Copy as agent prompt" button (NoteList.tsx).
 *
 * File structure of notes.md:
 *   [AI handoff preamble — sections 1-10]
 *   ---NOTES---
 *   # {brand.label} Testing Notes
 *   Exported / Total points / per-point sections (each rendered by
 *   noteMarkdown.ts's noteToMarkdown(), joined with a "---" divider)
 *
 * When config / preamble / journey are absent the preamble degrades
 * gracefully, marking each missing section as "(not provided)" or "(none)".
 *
 * Note: `QaNote` is imported here with `import type`, which is erased at
 * build time (esbuild/tsc both strip type-only imports) — so this does NOT
 * introduce a runtime circular dependency with QaContext.tsx (which
 * value-imports `buildAndDownloadZip` from this file). noteMarkdown.ts
 * already relies on the same erasure. Schema types (QaJourneyLane, QaTheme,
 * etc.) are likewise safe to import from schema.ts, which has no dependency
 * on exportZip.ts at all.
 */

import type { QaJourneyLane, QaTheme, QaCredential, QaPreamble } from '../config/schema';
import type { QaNote } from '../context/QaContext';
import { computeCoverage } from './coverage';
import { noteToMarkdown, noteCheckLine, noteContextMarkdown } from './noteMarkdown';
import { reproSpec } from './reproSpec';
import { shotExtension } from './capture';

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
// Per-point body — delegated to noteMarkdown.ts (see buildAndDownloadZip)
// ---------------------------------------------------------------------------

/**
 * The archive's name, when nobody typed one.
 *
 * WHY THIS IS NOT `qa-notes-<date>`
 * ---------------------------------
 * That name was the same on every project, so the second export of the day
 * landed as `qa-notes-2026-09-20 (1).zip` and the developer opening it had to
 * guess which app it came from. Both facts needed to identify an archive —
 * which project, and which run — were already known here and thrown away.
 *
 * So: `<project>-qa-2026-09-20-1432`. Date first inside the run so archives
 * from one project sort chronologically, and minutes because two exports an
 * hour apart is a normal afternoon.
 */
function autoName(project: string | undefined, stamp: string): string {
  // ISO 8601: 2026-09-20T14:32:07.123Z → date, then hours and minutes.
  const date = stamp.slice(0, 10);
  const time = stamp.slice(11, 16).replace(':', '');
  const slug = (project ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const when = time ? `${date}-${time}` : date;
  return slug ? `${slug}-qa-${when}` : `qa-notes-${when}`;
}

/**
 * The project's own name, as the archive should spell it.
 *
 * `preamble.projectName` is the field someone actually filled in for this app.
 * `brand.label` is deliberately NOT a fallback: it defaults to "Qapture", so
 * using it would name every unconfigured project's export after the tool
 * instead of the app — which is the problem this is here to fix.
 */
export function exportProjectName(config?: ExportConfig): string | undefined {
  const name = config?.preamble?.projectName;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

function safeName(name: string | undefined, stamp: string, project?: string): string {
  let base = (name ?? '').trim().replace(/\.zip$/i, '');
  base = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').slice(0, 80).trim();
  return `${base || autoName(project, stamp)}.zip`;
}

/**
 * The name the export field should start with, so the tester sees what they
 * are about to get rather than an empty box and a surprise.
 */
export function suggestedExportName(project: string | undefined, stamp: string): string {
  return autoName(project, stamp);
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
    ...rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, ' ')).join(' | ')} |`),
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
function summariseSession(notes: QaNote[], stamp: string): string {
  if (!notes.length) return 'No points captured.';
  let bugs = 0, enhancements = 0, designs = 0, verified = 0, awaiting = 0, secondRound = 0;
  const pages = new Set<string>();
  let earliest = Number.POSITIVE_INFINITY;
  let latest = 0;

  for (const n of notes) {
    const sev = n.severity ?? 'bug';
    if (sev === 'bug') bugs++;
    else if (sev === 'enhance') enhancements++;
    else designs++;
    const status = n.status ?? 'open';
    if (status === 'verified') verified++;
    else if (status === 'fixed') awaiting++;
    if (n.followUp && n.followUp.trim()) secondRound++;
    pages.add((n.route || '/').split('?')[0]);
    const t = Date.parse(n.timestamp);
    if (Number.isFinite(t)) {
      if (t < earliest) earliest = t;
      if (t > latest) latest = t;
    }
  }

  const parts = [
    `${notes.length} point${notes.length === 1 ? '' : 's'}`,
    `${bugs} bug${bugs === 1 ? '' : 's'}`,
  ];
  if (enhancements) parts.push(`${enhancements} enhancement${enhancements === 1 ? '' : 's'}`);
  if (designs) parts.push(`${designs} design`);
  if (verified) parts.push(`${verified} verified`);
  if (awaiting) parts.push(`${awaiting} awaiting re-test`);
  // Worth saying up front: a second round means an earlier attempt missed.
  if (secondRound) parts.push(`${secondRound} back for a second round`);
  parts.push(`${pages.size} page${pages.size === 1 ? '' : 's'}`);

  if (Number.isFinite(earliest) && latest > earliest) {
    const minutes = Math.max(1, Math.round((latest - earliest) / 60000));
    parts.push(minutes >= 60
      ? `over ${Math.round(minutes / 6) / 10} hours`
      : `over ${minutes} minutes`);
  }
  const endStamp = stamp.slice(0, 16).replace('T', ' ');
  return `${parts.join(' · ')} — captured up to ${endStamp}.`;
}

function buildPreamble(
  config: ExportConfig,
  guideChecked: Set<string>,
  stamp: string,
  notes: QaNote[],
  guideSkipped?: Set<string>,
): string {
  const noteCount = notes.length;
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

  // ── 2b. Session summary (v0.7) ──────────────────────────────────────────
  // The first question anyone opening this asks is "what am I looking at?".
  // A one-line answer — how many findings, of what kind, over how many pages
  // and how long — costs nothing to compute and saves the reader scrolling
  // the whole file to find out whether it is a smoke test or a full sweep.
  //
  // Declared here, rendered in section 2, because it needs the note list that
  // buildPreamble already receives via its caller.
  // (kept as a helper so the notes-header can reuse the same wording)

  // ── 2. Project title + oneLiner + stamp + point count ────────────────────
  const oneLiner = typeof p.oneLiner === 'string' && p.oneLiner.trim()
    ? `\n> ${p.oneLiner.trim()}`
    : '';
  sections.push(
    `# ${projectName} — QA Handoff${oneLiner}\n\n` +
    `Exported: ${stamp}  \n` +
    `Points: ${noteCount}\n\n` +
    `**Session:** ${summariseSession(notes, stamp)}`,
  );

  // ── 2c. What the three tags mean, and what each one asks of the reader ───
  //
  // Every point carries one of three tags. They are not severities — they are
  // three different KINDS OF WORK, and the whole value of the tag is that it
  // tells the agent which posture to take before it touches anything. Without
  // this section the tag is decoration: an agent reads "design" and starts
  // hunting for a fault that was never reported, or reads "enhance" and
  // bolts a feature on without looking at what it lands next to.
  //
  // Deliberately written as instructions to the reader, not as definitions.
  sections.push(
    `## What the tags mean\n\n` +
    `Every point below is tagged **Bug**, **Design** or **Enhance**. These are ` +
    `not priorities — they are three different kinds of work. Read the tag ` +
    `before you decide what to do.\n\n` +

    `### Bug — something is broken\n\n` +
    `Find the **root cause**, not the symptom. Do not patch over it.\n\n` +
    `State the cause in one plain sentence before you change anything — ` +
    `e.g. "the date was wrong because the server sends UTC and the list ` +
    `formats in local time". **If you cannot write that sentence, you have ` +
    `not found the cause yet.** Keep looking. The real cause is often ` +
    `something small and silly; that is normal, and it is still the cause.\n\n` +
    `**The cause is not always in the code.** If the code does exactly what it ` +
    `was asked to do and the result is still wrong, then nothing is broken — ` +
    `what was *asked for* and what was *meant* did not match. That mismatch is ` +
    `the bug. Realign to what the owner meant and fix it there. If the note ` +
    `already says what they meant ("this isn't what I wanted, I wanted X"), ` +
    `they have told you — just do X. Do not stop to ask a question they have ` +
    `already answered.\n\n` +

    `### Design — it works, but it looks or feels wrong\n\n` +
    `The functionality is fine and is not in question. Do not go hunting for a ` +
    `fault; there isn't one. Think properly about the interface and the ` +
    `experience — layout, spacing, hierarchy, wording, states, what the ` +
    `person is actually trying to do — and change how it looks and feels.\n\n` +

    `### Enhance — a new idea, thought of while using the app\n\n` +
    `The tester wants something added or changed: a new section, a new ` +
    `feature, a different way of doing it.\n\n` +
    `**Plan it before you build it.** Read the surrounding code, work out what ` +
    `it touches and what it might break, and choose an approach that fits how ` +
    `the app is already built. Then build it. You do not need to stop and ask ` +
    `for approval — plan well, then go.\n\n` +
    `Push back only when you have a real reason: it would break something, or ` +
    `it conflicts with an invariant below. Then say so plainly and propose the ` +
    `alternative you would build instead.\n\n` +

    `### A point with a "round 2" on it\n\n` +
    `Some points carry a **round 2** block: the same finding, already worked ` +
    `on once, re-tested, and still not right. Two things follow from that.\n\n` +
    `First, **the round-2 text is the current ask** and the paragraph above it ` +
    `is history — read the history to understand what was wanted, act on the ` +
    `round 2.\n\n` +
    `Second, **the previous attempt is evidence.** Something about the first ` +
    `reading was wrong, so do not simply do it again more carefully. Work out ` +
    `what was misunderstood the first time and say so in one sentence, then ` +
    `fix that. If a "Before"/"After" screenshot pair is attached, the After is ` +
    `what the tester was looking at when they wrote the round 2.\n\n` +

    `### When the tag and the words disagree\n\n` +
    `The tag sets your starting posture; **the words win.** A point tagged ` +
    `Design that says "this crashes" is a bug — treat it as one, and mention ` +
    `that you changed lane. People pick the wrong chip all the time; that is ` +
    `not a reason to do the wrong work.\n\n` +
    `And if a point is phrased as a question rather than a report, **answer it ` +
    `— do not change code on a maybe.**`,
  );

  // ── 2b. The contract ──────────────────────────────────────────────────────
  // Placed before the project details on purpose: an agent that reads only
  // the top of this file must still come away knowing it is being graded, and
  // on what. This is the section that turns an export from a wish list into
  // a piece of work with an agreed definition of done.
  sections.push(
    `## You Are Being Graded On This\n\n` +
    `This archive is not a list of suggestions. Every point in \`notes.md\` is ` +
    `an acceptance test, and \`verify.md\` is the checklist those tests live ` +
    `in — one unticked box per point.\n\n` +
    `**What happens next.** The tester will be walked back through these same ` +
    `checks on the real page, in this order, one stop at a time, and asked ` +
    `about each: *is this now what I asked for?* Anything they say is still ` +
    `wrong comes back to you as round two with their new words attached, so ` +
    `nothing quietly disappears.\n\n` +
    `**What to do.** Do the work, then fill in \`verify.md\`: tick a box only ` +
    `when the check is true on a fresh load of the page named beside it, with ` +
    `the tester doing nothing extra. Where you could not do something, or you ` +
    `think it is the wrong thing to do, leave the box unticked and write one ` +
    `line saying why. An unticked box with a reason is a good answer. A ticked ` +
    `box that does not hold up is the only bad one — it costs the tester the ` +
    `trip to find out.\n\n` +
    `Hand \`verify.md\` back with the work.\n\n` +

    `### What is in this archive\n\n` +
    `- \`notes.md\` — the points themselves, under an **Observed** heading. ` +
    `Most carry only that: the tester writes one sentence about what is wrong, ` +
    `which is the right amount to ask of somebody who is not an engineer. An ` +
    `**Expected** heading appears where somebody stated one.\n` +
    `  Where a point is ambiguous, **ask — do not pick a reading and commit ` +
    `to it.** That failure mode is specific to you: a person would stop and ` +
    `check, and an agent tends to fill the gap in and carry on. One question ` +
    `costs a message. A confident fix to the wrong problem costs the round.\n` +
    `- \`verify.md\` — the checklist, one unticked box per point.\n` +
    `- \`screenshots/\` — one per point. A point marked with a screenshot ` +
    `caveat was re-drawn rather than photographed, so canvases, charts and ` +
    `maps may be blank in it; trust the words over the picture there.\n` +
    `- \`context/\` — console, network, environment and element forensics, one ` +
    `file per point. Deliberately **not** in \`notes.md\`: a longer report ` +
    `measurably lowers the chance of the right thing getting fixed, because ` +
    `the two sentences that matter get buried. Open these only when something ` +
    `is genuinely unresolved.\n` +
    `- \`repro/\` — Playwright drafts, one per point, all optional. Finish the ` +
    `ones where the point is behavioural and worth pinning down; delete the ` +
    `ones where it is cosmetic. That judgement is yours.`,
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
  // Only credentials explicitly flagged `seeded: true` — i.e. pulled by the
  // `qapture init` detector from .env.example / seeder files, or hand-marked
  // seeded by whoever wrote the config — get their password exported in the
  // clear. `seeded` is the one signal the schema already gives us that a
  // value is synthetic/throwaway rather than something a human typed in by
  // hand (which could, by mistake, be a real account). Manually-entered
  // credentials without that flag are redacted by default: the export is
  // built for third-party (coding-agent) handoff, so nothing here should
  // assume a password is safe to leak just because someone put it in
  // `credentials:` — an unflagged row still shows role/login/hint so the
  // handoff stays useful, it just withholds the password.
  const creds: QaCredential[] = config.credentials ?? [];
  const redactedCount = creds.filter((c) => !c.seeded).length;
  let credBlock: string;
  if (creds.length > 0) {
    const credRows = creds.map((c) => [
      c.role,
      c.login,
      c.seeded ? (c.password || '(none)') : '(redacted — not marked seeded)',
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
  const redactionNote = redactedCount > 0
    ? ` ${redactedCount} credential${redactedCount === 1 ? '' : 's'} above ${redactedCount === 1 ? 'is' : 'are'} ` +
      'not marked `seeded: true`, so its password was withheld from this export — set `seeded: true` ' +
      'in `credentials` only for synthetic/throwaway values (e.g. from a seed script), never for a real account.'
    : '';
  sections.push(
    `## Login Context\n\n${credBlock}\n\n` +
    '> **WARNING:** These are DEV/TEST/SEED credentials only. ' +
    `Never forward, commit, or use in production.${redactionNote}`,
  );

  // ── 7. Coverage Report ────────────────────────────────────────────────────
  const cov = computeCoverage(journey, guideChecked, guideSkipped);

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
 *   [per-point sections — each rendered by noteToMarkdown(), "---"-separated]
 *
 * @param notes        - the full list of QA notes to export
 * @param stamp        - ISO timestamp for the export header
 * @param filename     - user-supplied base name (without .zip extension)
 * @param config       - resolved config supplying brand/theme/credentials/journey/preamble
 * @param guideChecked - set of checked guide step keys for coverage computation
 */
export async function buildZipBlob(
  notes:         QaNote[],
  stamp:         string,
  config?:       ExportConfig,
  guideChecked?: Set<string>,
  guideSkipped?: Set<string>,
): Promise<Blob | null> {
  // SSR guard — browser-only API
  if (typeof document === 'undefined') return null;

  const { default: JSZip } = await import('jszip');
  const zip   = new JSZip();
  const shots = zip.folder('screenshots');

  const resolvedChecked = guideChecked ?? new Set<string>();
  const resolvedConfig: ExportConfig = config ?? {};

  // ── Preamble block ────────────────────────────────────────────────────────
  const preambleMd = buildPreamble(resolvedConfig, resolvedChecked, stamp, notes, guideSkipped);

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

  // ── Per-point bodies ───────────────────────────────────────────────────────
  // Delegated to noteMarkdown.ts so a note reads identically here and via the
  // "Copy as agent prompt" button (NoteList.tsx) — carries severity/status/
  // journeyRef/context (runtime events + env + forensics) automatically,
  // since noteToMarkdown reads those straight off the QaNote.
  const noteBlocks = notes.map((n, i) =>
    noteToMarkdown(n, {
      brand: brandLabel,
      index: i + 1,
      // Runtime evidence goes to its own file and is pointed at from here.
      // See the contextFile branch in noteMarkdown.ts for why: a long report
      // measurably lowers an agent's chance of fixing the thing.
      contextFile: n.context ? `context/point-${i + 1}.md` : undefined,
    }),
  );
  const notesBody = noteBlocks.length > 0
    ? `${noteBlocks.join('\n\n---\n\n')}\n\n---\n`
    : '';

  // ── Assemble notes.md ─────────────────────────────────────────────────────
  const notesMd =
    preambleMd +
    '\n\n---NOTES---\n\n' +
    notesHeader +
    notesBody;

  zip.file('notes.md', notesMd);

  // ── verify.md ─────────────────────────────────────────────────────────────
  // The same points, as a checklist somebody owes an answer on.
  //
  // WHY A SECOND FILE AND NOT A SECTION
  // -----------------------------------
  // notes.md is long -- context, forensics, network events -- and an agent
  // reading it produces work and then stops, because nothing in it says what
  // finished looks like or asks to be filled in. A short file that is nothing
  // but unticked boxes is a different instrument: it can be handed back, it
  // can be diffed, and every unticked line is visibly outstanding.
  //
  // It also matches what happens on the tester's side. Exporting now marks
  // these points as sent, and when the tester returns the widget walks them
  // through this list one stop at a time and asks for a verdict on each. So
  // the boxes here and the questions there are the same boxes and the same
  // questions -- which is the whole point: the agent knows in advance exactly
  // what it will be graded on.
  zip.file('verify.md', [
    `# ${brandLabel} — checks to satisfy`,
    '',
    `Exported: ${stamp}`,
    `Checks: ${notes.length}`,
    '',
    'Each line below is one thing the tester asked for. The full ask, the',
    'screenshot, the page and the element are in `notes.md` under the matching',
    '"Point" heading.',
    '',
    '**What is expected of you**',
    '',
    '1. Do the work in `notes.md`.',
    '2. Tick a box here only when the check is true on a fresh load of the page',
    '   named beside it, with the tester doing nothing extra.',
    '3. Leave a box unticked and write one line under it saying why, if you',
    '   could not do it or disagree with it. An unticked box with a reason is a',
    '   good answer; a ticked box that is not true is the only bad one.',
    '4. Hand this file back with the work.',
    '',
    'The tester will then be walked back through these same checks on the real',
    'page, in this order, and asked about each one. Anything they say is still',
    'wrong comes back to you as round two, with their new words attached.',
    '',
    '---',
    '',
    ...notes.map((n, i) => noteCheckLine(n, i + 1)),
    '',
    '---',
    '',
    'Re-open the walkthrough on the tester\'s machine with `?qa=walk:verify`.',
    '',
  ].join('\n'));

  // ── Runtime context, one file per point ───────────────────────────────────
  // Everything the browser recorded, kept out of notes.md so the report stays
  // short enough to be read properly, and kept in the archive so nothing that
  // might be needed has been thrown away.
  const contextDir = zip.folder('context');
  notes.forEach((n, i) => {
    if (n.context && contextDir) {
      contextDir.file(`point-${i + 1}.md`, noteContextMarkdown(n, i + 1));
    }
  });

  // ── Reproduction drafts ───────────────────────────────────────────────────
  // Drafts, not tests -- see reproSpec.ts. The agent decides which are worth
  // finishing and deletes the rest; most points do not want one.
  const reproDir = zip.folder('repro');
  let reproCount = 0;
  notes.forEach((n, i) => {
    const spec = reproSpec(n, i + 1);
    if (spec && reproDir) {
      reproDir.file(`check-${i + 1}.spec.ts`, spec);
      reproCount++;
    }
  });
  if (reproCount && reproDir) {
    reproDir.file('README.md', [
      '# Reproduction drafts',
      '',
      'One per point, and every one of them is optional.',
      '',
      '**Use one** where the point is behavioural and worth pinning down, so it',
      'cannot quietly come back later. An executable check is worth far more to',
      'you than another paragraph of steps written in English.',
      '',
      '**Delete it** where the point is cosmetic -- a colour, a spacing, a word.',
      'A test asserting that a heading is visible proves nothing anybody wanted',
      'proved, and it is one more file to maintain forever.',
      '',
      'That call is yours. The tester was not asked to make it and could not.',
      '',
      'What is already done for you in each file: the URL, a selector verified',
      'against the live DOM at capture time, and the observed and expected',
      'behaviour quoted in place. What is left is the assertion, marked TODO.',
      '',
    ].join('\n'));
  }

  // ── Screenshots ───────────────────────────────────────────────────────────
  notes.forEach((n, i) => {
    if (n.screenshot && shots) {
      // Must match the reference noteMarkdown.ts writes into notes.md.
      shots.file(`point-${i + 1}.${shotExtension(n.screenshot)}`, n.screenshot);
    }
    if (n.afterScreenshot && shots) {
      shots.file(`point-${i + 1}-after.${shotExtension(n.afterScreenshot)}`, n.afterScreenshot);
    }
  });

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Build the ZIP and hand it to the browser as a download.
 *
 * Split from buildZipBlob() in v0.5 so the same archive can also be handed to
 * the phone's share sheet (see shareZip()) — on a phone a "download" lands
 * somewhere the tester will never find, while Share puts it straight into
 * WhatsApp, Mail or Files.
 */
export async function buildAndDownloadZip(
  notes:         QaNote[],
  stamp:         string,
  filename?:     string,
  config?:       ExportConfig,
  guideChecked?: Set<string>,
  guideSkipped?: Set<string>,
): Promise<void> {
  const blob = await buildZipBlob(notes, stamp, config, guideChecked, guideSkipped);
  if (!blob) return;
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = safeName(filename, stamp, exportProjectName(config));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The filename a shared/downloaded archive should carry. */
export function exportFileName(
  filename: string | undefined,
  stamp: string,
  project?: string,
): string {
  return safeName(filename, stamp, project);
}

/**
 * Alias matching the original exportZip.js export name.
 */
export const exportZip = buildAndDownloadZip;
