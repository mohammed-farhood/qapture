/**
 * reproSpec.ts — a runnable check, for the points that deserve one.
 *
 * WHY A SCRIPT AND NOT MORE PROSE
 * -------------------------------
 * Measured against repair agents, an executable reproduction is one of the
 * largest wins a report can carry, while natural-language "steps to reproduce"
 * showed no measurable benefit at all. That is an uncomfortable finding — the
 * steps are the part humans work hardest on — but it makes sense: prose has to
 * be interpreted, and a script can simply be run.
 *
 * WHY IT IS A DRAFT AND NOT A TEST
 * --------------------------------
 * Because most points do not want one. "Make this heading bigger" needs no
 * Playwright spec, and generating one for it produces a test that asserts
 * nothing useful, costs the agent time to read, and adds a file somebody has
 * to delete. Emitting a spec for every point would be exactly the padding the
 * research warns about.
 *
 * So these are written as DRAFTS with the assertion left as a marked TODO, and
 * the export tells the agent plainly: use one where the change is behavioural
 * and worth pinning down, delete it where the change is cosmetic. The tester
 * is never asked to make that call, and neither is this file — the person
 * doing the work is the only one who can.
 *
 * What the draft is actually worth is the boring half: the URL, a selector
 * that was verified against the live DOM at capture time, and the observed and
 * expected text sitting right there in the file. That is the part that is
 * tedious to reconstruct and easy to get wrong.
 */

import type { QaNote } from '../context/QaContext';

/** Escape a string for a single-quoted TypeScript literal. */
function lit(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
}

/** Trim to one readable line for a comment. */
function line(value: string | undefined, limit = 200): string {
  const one = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!one) return '';
  return one.length > limit ? `${one.slice(0, limit - 3)}...` : one;
}

/**
 * A Playwright draft for one point, or null when there is nothing to hang a
 * check on (no selector and no route — a free-standing note).
 */
export function reproSpec(note: QaNote, index: number): string | null {
  const selector = note.target?.selector;
  const route = note.route || '/';
  if (!selector && !note.route) return null;

  const observed = line(note.description);
  const expected = line(note.wanted);

  const out: string[] = [];
  out.push(`// check-${index} -- DRAFT. Delete this file if the change is cosmetic.`);
  out.push('//');
  out.push('// The URL and the selector below were captured from the live page, so');
  out.push('// they are the tedious part already done. The assertion is yours: only');
  out.push('// you know whether this point is worth pinning down with a test.');
  out.push('//');
  if (observed) out.push(`// Observed: ${observed}`);
  if (expected) out.push(`// Expected: ${expected}`);
  else out.push('// Expected: (the tester did not say -- ask before asserting anything)');
  if (note.origin?.file) {
    out.push(`// Rendered by: ${note.origin.component ?? '?'} (${note.origin.file}${note.origin.line ? `:${note.origin.line}` : ''})`);
  }
  out.push('');
  out.push("import { test, expect } from '@playwright/test';");
  out.push('');
  out.push(`test('check-${index}: ${lit(line(note.description, 60) || 'reported point')}', async ({ page }) => {`);
  out.push(`  await page.goto('${lit(route)}');`);
  if (selector) {
    out.push('');
    out.push(`  const target = page.locator('${lit(selector)}');`);
    out.push('  await expect(target).toBeVisible();');
    out.push('');
    out.push('  // TODO: assert the EXPECTED behaviour quoted above.');
    out.push('  // Being visible only proves the element is still there -- it does not');
    out.push('  // prove the thing the tester asked for actually happened.');
  } else {
    out.push('');
    out.push('  // No element was picked for this point -- it was a region or a plain');
    out.push('  // note. Drive the page to the state described above, then assert.');
    out.push('  // TODO');
  }
  out.push('});');
  out.push('');
  return out.join('\n');
}
