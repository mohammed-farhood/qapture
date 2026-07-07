/**
 * secretGuard — hard blocklist that the CLI consults before every file read.
 *
 * CORE RULE: the CLI is a DETERMINISTIC SCAFFOLDER. It MUST NEVER:
 *   • read real secrets (.env, *.pem, *.key, credentials.*, etc.)
 *   • require() / eval() target files — regex/text analysis only
 *   • forward, log, or embed any value that looks like a real secret
 *
 * ALWAYS ALLOWED: .env.example, seeder/seed files (controlled separately
 * in detectCredentials.ts which is the only caller that handles seeder reads).
 */

import * as path from 'node:path';

// ── Exact basenames that are ALWAYS blocked ──────────────────────────────────
const BLOCKED_EXACT_BASENAMES = new Set<string>([
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.production',
  '.env.staging',
  '.env.ci',
  '.env.preview',
  '.env.override',
]);

// ── File extensions that are ALWAYS blocked ──────────────────────────────────
const BLOCKED_EXTENSIONS = new Set<string>([
  '.pem',
  '.key',
  '.pfx',
  '.p12',
  '.crt',
  '.der',
  '.p8',
  '.jks',
  '.keystore',
  '.secret',
]);

// ── Basename patterns that are blocked ───────────────────────────────────────
const BLOCKED_BASENAME_PATTERNS: RegExp[] = [
  /^credentials?\./i,      // credentials.json, credential.yml, …
  /^secrets?\./i,          // secrets.json, secret.yaml, …
  /\.secret$/i,            // foo.secret
  /^private_key/i,         // private_key.json (GCP service account)
  /^service[-_]?account/i, // service-account.json
  /^keyfile/i,             // keyfile.json
  /^\.netrc$/i,
  /^\.pgpass$/i,
  /^id_rsa/i,              // SSH private keys
  /^id_ed25519/i,
  /^id_ecdsa/i,
  /^id_dsa/i,
];

// ── Path-segment patterns that are blocked ───────────────────────────────────
const BLOCKED_PATH_SEGMENTS: RegExp[] = [
  /[\\/]secrets?[\\/]/i,
  /[\\/]\.secrets?[\\/]/i,
  /[^\\/][\\/]private[\\/]/i,
  /[\\/]certs?[\\/]/i,
  /[\\/]certificates?[\\/]/i,
  /[\\/]keys?[\\/]/i,
  /[\\/]credentials?[\\/]/i,
];

/**
 * Returns `true` if it is SAFE to read the file at `filePath`.
 * Returns `false` if the file matches any blocked pattern.
 *
 * `.env.example` is always ALLOWED regardless of other rules.
 *
 * IMPORTANT: this function only inspects the path string — it never opens,
 * requires(), or eval()s the file.
 */
export function assertSafeToRead(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // ── Fast-allow: .env.example (always safe) ────────────────────────────────
  if (basename === '.env.example') return true;
  // Also allow variants like .env.example.local that some projects use
  if (/^\.env\.example(\.\w+)?$/.test(basename)) return true;

  // ── Exact basename block (case-insensitive, matching the rest of this file) ─
  if (BLOCKED_EXACT_BASENAMES.has(basename.toLowerCase())) return false;

  // ── .env.* variants (anything not .env.example) ───────────────────────────
  if (/^\.env\./i.test(basename) && !/^\.env\.example/i.test(basename)) {
    return false;
  }

  // ── Extension block ───────────────────────────────────────────────────────
  if (BLOCKED_EXTENSIONS.has(ext)) return false;

  // ── Basename pattern block ────────────────────────────────────────────────
  for (const pat of BLOCKED_BASENAME_PATTERNS) {
    if (pat.test(basename)) return false;
  }

  // ── Path segment block ────────────────────────────────────────────────────
  for (const pat of BLOCKED_PATH_SEGMENTS) {
    if (pat.test(normalized)) return false;
  }

  return true;
}
