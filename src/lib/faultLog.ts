/**
 * faultLog.ts — the widget's own failures, where somebody can actually see them.
 *
 * WHY
 * ---
 * Until now, when this tool broke it broke into `console.warn`. That is a fine
 * place for a developer and a useless one for everybody else: a client watching
 * a screenshot fail has no idea the browser already explained why, six inches
 * away, behind a keyboard shortcut nobody has taught them.
 *
 * The consequence was not just a bad afternoon. It is that failures never got
 * reported accurately — "the screenshot didn't work" is what reaches you, when
 * the browser had said `SecurityError: Tainted canvases may not be exported`.
 *
 * So faults are recorded here as well as logged, and Settings can show them and
 * copy them. Small and bounded: this is a breadcrumb trail, not telemetry.
 *
 * NOTHING LEAVES THE DEVICE. There is no endpoint. It is an array in memory
 * that a person can choose to copy.
 */

export interface Fault {
  at: number;
  /** Where it happened, e.g. 'screenshot'. */
  where: string;
  /** What went wrong, in whatever words the browser used. */
  what: string;
}

/**
 * How many to keep.
 *
 * Small on purpose. The useful fault is nearly always the most recent one, and
 * an unbounded log on a page that fails in a loop is a memory leak that turns
 * a small bug into a crashed tab.
 */
const LIMIT = 40;

const faults: Fault[] = [];

/** Record a fault, and mirror it to the console for whoever is watching. */
export function recordFault(where: string, err: unknown): void {
  const what =
    err instanceof Error ? `${err.name}: ${err.message}`
      : typeof err === 'string' ? err
        : (() => { try { return JSON.stringify(err); } catch { return String(err); } })();

  faults.push({ at: Date.now(), where, what: what.slice(0, 500) });
  if (faults.length > LIMIT) faults.splice(0, faults.length - LIMIT);

  // eslint-disable-next-line no-console
  console.warn(`[QA] ${where}:`, err);
}

/** Newest first, for display. */
export function readFaults(): Fault[] {
  return [...faults].reverse();
}

export function clearFaults(): void {
  faults.length = 0;
}

/** The log as text, for the copy button. */
export function faultsAsText(version: string): string {
  if (!faults.length) return 'No faults recorded.';
  const head = [
    `qapture ${version}`,
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
    typeof location !== 'undefined' ? location.href.split('?')[0] : '',
    '',
  ].filter(Boolean).join('\n');
  return head + readFaults()
    .map((f) => `${new Date(f.at).toISOString()}  [${f.where}] ${f.what}`)
    .join('\n');
}
