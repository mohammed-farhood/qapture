/**
 * Idempotent file-write helpers.
 * Uses node:fs only — no third-party dependencies.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Write `content` to `filePath` only if the file does not already exist,
 * UNLESS `force` is true (in which case, always overwrite).
 *
 * Automatically creates missing parent directories.
 *
 * Returns:
 *  - `'written'`  — file was created or overwritten
 *  - `'skipped'`  — file already existed and force was false
 */
export function writeIfAbsent(
  filePath: string,
  content: string,
  force: boolean,
): 'written' | 'skipped' {
  if (!force && fs.existsSync(filePath)) {
    return 'skipped';
  }
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
  return 'written';
}

/**
 * Always write `content` to `filePath`, creating parent directories as needed.
 * Used for static artifacts (e.g. SKILL.md) that should always be kept current
 * regardless of whether the file already exists.
 */
export function writeAlways(filePath: string, content: string): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, content, 'utf8');
}

// ── Internal ──────────────────────────────────────────────────────────────────

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
