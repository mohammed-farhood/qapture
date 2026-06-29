/**
 * Dependency-free recursive directory walker + safe file reader.
 * Uses Node built-ins only (node:fs, node:path).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Directories that are always skipped during traversal. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.nyc_output',
  '.parcel-cache',
  '__pycache__',
  '.venv',
  'vendor',
]);

/**
 * Recursively list all file paths under `dir`.
 * Skips node_modules, .git, dist, build, .next, and other noise dirs.
 * Returns [] if `dir` doesn't exist or can't be read.
 */
export function walk(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      results.push(...walk(path.join(dir, entry.name)));
    } else if (entry.isFile()) {
      results.push(path.join(dir, entry.name));
    }
  }

  return results;
}

/**
 * Walk only the files directly inside `dir` (non-recursive).
 * Returns [] if `dir` doesn't exist.
 */
export function walkShallow(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isFile())
      .map(e => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Read a file and return its content as a UTF-8 string.
 * Returns '' on any error (missing file, permission denied, binary, etc.).
 * NEVER throws.
 */
export function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Return true if `dirPath` exists and is a directory.
 */
export function dirExists(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Return true if `filePath` exists and is a regular file.
 */
export function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
