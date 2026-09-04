/**
 * noteMarkdown.ts — render ONE note as agent-ready Markdown.
 *
 * Two callers share this so a note reads identically wherever it surfaces:
 *  - exportZip.ts, for each point in the exported notes.md
 *  - the "Copy as agent prompt" button, for pasting a single finding straight
 *    into a terminal agent without exporting anything
 *
 * The output is written for a coding agent to act on: what was observed, where
 * exactly, and what the runtime was doing at that moment.
 */

import type { QaNote } from '../context/QaContext';
import type { QaContextEvent, QaStep } from './contextBuffer';
import { shotExtension } from './capture';

/** Newlines would break the enclosing Markdown table/bullet structure. */
function oneLine(s: string | undefined | null): string {
  return String(s ?? '').replace(/\r?\n|\r/g, ' ').trim();
}

/**
 * Render one recorded interaction as a line a human can follow and an agent
 * can replay. Phrased as the tester's own actions ("clicked Place order"),
 * not as DOM events, because this section is read as steps to reproduce.
 */
function formatStep(step: QaStep, t0: number): string {
  const rel = `${((step.t - t0) / 1000).toFixed(1)}s`;
  const times = step.repeat && step.repeat > 1 ? ` (×${step.repeat})` : '';
  const name = oneLine(step.label) || 'element';
  switch (step.kind) {
    case 'click':  return `[${rel}] clicked “${name}”${times}`;
    case 'type':   return `[${rel}] typed in “${name}”`;
    case 'toggle': return `[${rel}] set “${name}” ${step.detail ?? ''}`.trimEnd();
    case 'select': return `[${rel}] changed “${name}”`;
    case 'submit': return `[${rel}] submitted “${name}”`;
    case 'key':    return `[${rel}] pressed ${step.detail ?? 'a key'} on “${name}”${times}`;
    case 'nav':    return `[${rel}] went to ${name}`;
    default:       return `[${rel}] ${name}`;
  }
}

function formatEvent(ev: QaContextEvent, t0: number): string {
  // Offsets are far more useful than wall-clock stamps: "-1.2s" tells the
  // agent this happened just before the capture.
  const rel = `${((ev.t - t0) / 1000).toFixed(1)}s`;
  if (ev.kind === 'network') {
    const status = ev.status === null ? (ev.error ?? 'failed') : String(ev.status);
    return `[${rel}] ${ev.method} ${ev.url} → ${status} (${ev.durationMs}ms)`;
  }
  if (ev.kind === 'console') {
    return `[${rel}] console.${ev.level}: ${oneLine(ev.message)}`;
  }
  return `[${rel}] uncaught: ${oneLine(ev.message)}`;
}

/**
 * The one-line acceptance check for a note, as it appears in `verify.md` and
 * as the question the walkthrough puts to the tester. Kept here, beside the
 * note renderer, so the two can never drift apart and describe different
 * tests for the same point.
 */
export function noteCheckLine(note: QaNote, index: number): string {
  const where = oneLine(note.route) || '/';
  const what = oneLine(note.description) || '(no description)';
  const trimmed = what.length > 160 ? `${what.slice(0, 157)}...` : what;
  return `- [ ] **check-${index}** (\`${where}\`) — ${trimmed}`;
}

/**
 * Render a note.
 * @param opts.index - 1-based point number, used for the heading and the
 *   screenshot filename reference. Omit for a standalone copy-to-clipboard.
 */
export function noteToMarkdown(
  note: QaNote,
  opts?: { brand?: string; index?: number },
): string {
  const brand = opts?.brand ?? 'Qapture';
  const idx = opts?.index;
  const lines: string[] = [];

  lines.push(idx != null ? `## Point ${idx}` : `## ${brand} point`);
  lines.push('');

  // — where —
  lines.push(`- **Page:** ${oneLine(note.route) || '/'}`);
  if (note.url) lines.push(`- **Full URL:** ${oneLine(note.url)}`);
  lines.push(`- **When:** ${oneLine(note.timestamp)}`);

  // — triage —
  if (note.severity) lines.push(`- **Severity:** ${note.severity}`);
  if (note.status) lines.push(`- **Status:** ${note.status}`);
  if (note.journeyRef) {
    lines.push(`- **Journey step:** ${oneLine(note.journeyRef.laneId)} → ${oneLine(note.journeyRef.path)}`);
  }

  // — target —
  const target = note.target;
  if (target) {
    lines.push(`- **Target:** ${target.kind}`);
    if (target.selector) lines.push(`- **Selector:** \`${oneLine(target.selector)}\``);
    if (target.tagName) lines.push(`- **Tag:** \`<${oneLine(target.tagName)}>\``);
    if (target.text) lines.push(`- **Text:** ${oneLine(target.text)}`);
    const r = target.rect;
    if (r) {
      lines.push(
        `- **Position:** top ${Math.round(r.top)}, left ${Math.round(r.left)}, ` +
        `${Math.round(r.width)}×${Math.round(r.height)}`,
      );
    }
  }

  if (idx != null && note.screenshot) {
    // Extension follows the blob's real type: v0.4 encodes screenshots as
    // WebP where the browser supports it (far smaller), PNG otherwise.
    lines.push(`- **Screenshot:** screenshots/point-${idx}.${shotExtension(note.screenshot)}`);
  }
  if (idx != null && note.afterScreenshot) {
    // v0.5: proof from a re-test. Named so the pair reads as before/after
    // without needing the note body to explain it.
    lines.push(
      `- **After re-test${note.afterAt ? ` (${oneLine(note.afterAt)})` : ''}:** ` +
      `screenshots/point-${idx}-after.${shotExtension(note.afterScreenshot)}`,
    );
  }

  // — the tester's own words —
  lines.push('');
  lines.push(oneLine(note.description) ? note.description.trim() : '_(no description)_');

  // — round two (v0.7.8) —
  // Placed immediately under the original, and never merged into it: the
  // point above is what was asked for the first time, and this is what came
  // back. An agent reading only the first paragraph would re-do work that has
  // already been attempted, so this says outright that an attempt was made
  // and missed, and that the sentence below is the correction.
  if (note.followUp && oneLine(note.followUp)) {
    lines.push('');
    lines.push(
      '> **This one came back — round 2.** ' +
      'The point above was already worked on once and it is still not right. ' +
      'What follows is the tester re-testing it, so treat it as the current ask ' +
      'and the point above as the history of what was originally wanted.',
    );
    lines.push('');
    lines.push(`**What happened this time**${note.followUpAt ? ` (${oneLine(note.followUpAt)})` : ''}`);
    lines.push('');
    lines.push(note.followUp.trim());
  }

  // — steps to reproduce, recorded automatically (v0.5) —
  // Placed directly under the description, ABOVE the runtime-context
  // <details>, because this is the part a human reads first: it is the
  // answer to "how do I get to this?".
  const recordedSteps = note.context?.steps ?? [];
  if (recordedSteps.length) {
    const t0 = Date.parse(note.timestamp) || recordedSteps[recordedSteps.length - 1].t;
    lines.push('');
    lines.push('**Steps before this** (recorded automatically, oldest first)');
    lines.push('');
    recordedSteps.forEach((step, i) => {
      lines.push(`${i + 1}. ${formatStep(step, t0)}`);
    });
  }

  // — the check this point will be graded against (v0.8.2) —
  // Every point is now an acceptance test, not a suggestion. The tester will
  // be walked back to this exact spot and asked one question, so the agent is
  // told the question in advance, in the same words it will be asked in.
  // Without this the export read as a wish list and came back half-done; with
  // it, "what does finished look like" is on the page next to the ask.
  if (idx != null) {
    lines.push('');
    lines.push(`**Check ${idx} — how this will be graded**`);
    lines.push('');
    lines.push(`The tester will be taken back to \`${oneLine(note.route) || '/'}\`` +
      (target?.selector ? `, shown \`${oneLine(target.selector)}\`` : ', shown this region') +
      ', and asked: *is this now what I asked for?*');
    lines.push('');
    lines.push('Treat it as done only when the paragraph above is true on that page, ' +
      'on a fresh load, without the tester doing anything extra. ' +
      `Record the outcome against \`check-${idx}\` in \`verify.md\`.`);
  }

  // — runtime context —
  const ctx = note.context;
  if (ctx) {
    const env = ctx.env;
    const events = Array.isArray(ctx.events) ? ctx.events : [];

    lines.push('');
    lines.push('<details><summary>Runtime context at capture</summary>');
    lines.push('');
    lines.push('```');
    if (env) {
      lines.push(`viewport   ${env.viewportW}×${env.viewportH} @${env.dpr}x`);
      if (env.language) lines.push(`language   ${env.language}`);
      if (env.timezone) lines.push(`timezone   ${env.timezone}`);
      lines.push(`online     ${env.online}`);
      if (env.pageLoadMs != null) lines.push(`pageLoad   ${env.pageLoadMs}ms`);
      if (env.memoryUsedMB != null) lines.push(`jsHeap     ${env.memoryUsedMB}MB`);
      if (env.userAgent) lines.push(`userAgent  ${env.userAgent}`);
    }
    if (events.length) {
      // Anchor offsets to the capture itself so every line reads as
      // "how long before the tester hit capture".
      const t0 = Date.parse(note.timestamp) || (events[events.length - 1]?.t ?? 0);
      lines.push('');
      lines.push(`events (${events.length}, most recent last):`);
      for (const ev of events) lines.push(`  ${formatEvent(ev, t0)}`);
    } else {
      lines.push('');
      lines.push('events     (none recorded)');
    }
    lines.push('```');

    const f = ctx.forensics;
    if (f && (f.html || f.styles || f.a11y)) {
      lines.push('');
      lines.push('**Element forensics**');
      lines.push('');
      lines.push('```');
      if (f.html) lines.push(`html    ${oneLine(f.html)}`);
      if (f.styles) {
        for (const [k, v] of Object.entries(f.styles)) lines.push(`${k.padEnd(7)} ${v}`);
      }
      if (f.a11y) {
        if (f.a11y.role) lines.push(`role    ${f.a11y.role}`);
        lines.push(`a11y    accessibleName=${f.a11y.hasAccessibleName} tabReachable=${f.a11y.tabReachable}` +
          (f.a11y.contrastFlag ? ` contrast=${f.a11y.contrastFlag}` : ''));
      }
      lines.push('```');
    }

    lines.push('');
    lines.push('</details>');
  }

  return lines.join('\n');
}
