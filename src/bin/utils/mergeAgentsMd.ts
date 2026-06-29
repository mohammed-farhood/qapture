/**
 * Idempotently insert or replace the qa-studio section in AGENTS.md.
 *
 * Uses HTML-comment sentinels as section markers:
 *   <!-- qa-studio-section -->
 *   ...content...
 *   <!-- /qa-studio-section -->
 *
 * Behaviour:
 *   • AGENTS.md absent   → create with `sectionContent`
 *   • Sentinels found    → replace the block (sentinels inclusive)
 *   • Sentinels absent   → append `sectionContent` to the file
 *
 * `sectionContent` is expected to already wrap itself with the sentinel tags
 * (i.e. it is the full content of AGENTS_SECTION.md, which starts with
 * `<!-- qa-studio-section -->` and ends with `<!-- /qa-studio-section -->`).
 */

import * as fs from 'node:fs';
import { writeAlways } from './writeIdempotent.js';

export const SENTINEL_OPEN  = '<!-- qa-studio-section -->';
export const SENTINEL_CLOSE = '<!-- /qa-studio-section -->';

export function mergeAgentsMd(agentsMdPath: string, sectionContent: string): 'created' | 'replaced' | 'appended' {
  // File doesn't exist — create from scratch
  if (!fs.existsSync(agentsMdPath)) {
    writeAlways(agentsMdPath, sectionContent.trimEnd() + '\n');
    return 'created';
  }

  const existing = fs.readFileSync(agentsMdPath, 'utf8');
  const openIdx  = existing.indexOf(SENTINEL_OPEN);
  const closeIdx = existing.indexOf(SENTINEL_CLOSE);

  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    // Both sentinels present — replace the block (sentinels inclusive)
    const before = existing.slice(0, openIdx);
    const after  = existing.slice(closeIdx + SENTINEL_CLOSE.length);

    // Ensure clean line boundaries
    const updated =
      before.replace(/\n*$/, '\n') +
      sectionContent.trimEnd() +
      '\n' +
      after.replace(/^\n*/, '\n');

    fs.writeFileSync(agentsMdPath, updated, 'utf8');
    return 'replaced';
  }

  // No sentinels — append the section
  const separator = existing.trimEnd().length === 0 ? '' : '\n\n';
  fs.writeFileSync(
    agentsMdPath,
    existing.trimEnd() + separator + sectionContent.trimEnd() + '\n',
    'utf8',
  );
  return 'appended';
}
