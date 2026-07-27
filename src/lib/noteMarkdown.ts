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
import type { QaContextEvent } from './contextBuffer';

/** Newlines would break the enclosing Markdown table/bullet structure. */
function oneLine(s: string | undefined | null): string {
  return String(s ?? '').replace(/\r?\n|\r/g, ' ').trim();
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
    lines.push(`- **Screenshot:** screenshots/point-${idx}.png`);
  }

  // — the tester's own words —
  lines.push('');
  lines.push(oneLine(note.description) ? note.description.trim() : '_(no description)_');

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
