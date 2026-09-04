/**
 * duplicate.ts — has this already been said?
 *
 * WHY
 * ---
 * A real export contained six notes reading "delete this", on six different
 * elements. Every one of them was filed in good faith: the tester could not
 * see what they had already written, so on each pass they wrote it again.
 *
 * That costs twice. The client does the work six times, and the agent reads
 * six points, treats them as six requirements, and either does six pieces of
 * work or gets confused about why the same sentence keeps arriving.
 *
 * WHAT COUNTS AS THE SAME, AND WHAT DELIBERATELY DOES NOT
 * -------------------------------------------------------
 * Same words on the SAME element is a duplicate: it is the same request, filed
 * twice. Same words on a DIFFERENT element is not — "delete this" on the
 * header and "delete this" on the footer are two genuine requests that happen
 * to be phrased identically, and merging them would destroy information.
 *
 * That asymmetry is the whole design. This is why it flags rather than blocks:
 * being wrong here means silently eating somebody's bug report, so the tester
 * is told and left to decide.
 */

import type { QaNote } from '../context/QaContext';

/** Words too common to carry meaning when comparing two short notes. */
const NOISE = new Set([
  'the', 'this', 'that', 'a', 'an', 'is', 'it', 'to', 'and', 'of', 'in', 'on',
  'for', 'be', 'should', 'i', 'we', 'please', 'here',
  'هذا', 'هذه', 'في', 'من', 'على', 'الى', 'إلى', 'ان', 'أن', 'و', 'ال',
]);

function words(text: string): Set<string> {
  return new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !NOISE.has(w)),
  );
}

/** Overlap of two word sets, 0..1 (Jaccard). */
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * How alike two notes must read before we mention it.
 *
 * High on purpose. A false positive here interrupts somebody mid-thought to
 * tell them they are repeating themselves when they are not, which is worse
 * than letting a genuine duplicate through — they can always delete one later,
 * and they cannot un-hear being wrongly corrected.
 */
const SAME_ENOUGH = 0.7;

/**
 * The note this one appears to repeat, or null.
 *
 * @param text  what the tester has typed so far
 * @param selector  the element they picked, if any
 * @param existing  notes already filed
 */
export function findDuplicate(
  text: string,
  selector: string | undefined,
  existing: QaNote[],
): QaNote | null {
  const typed = words(text);
  // Under three meaningful words there is not enough to compare. "fix" and
  // "fix" are not evidence of anything.
  if (typed.size < 3) return null;

  for (const note of existing) {
    // Different element, different request -- see the header.
    if (selector && note.target?.selector && note.target.selector !== selector) continue;
    if (selector && !note.target?.selector) continue;
    if (!selector && note.target?.selector) continue;
    if (overlap(typed, words(note.description)) >= SAME_ENOUGH) return note;
  }
  return null;
}
