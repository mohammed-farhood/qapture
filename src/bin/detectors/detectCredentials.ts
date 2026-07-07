/**
 * detectCredentials — extract dev/test credential hints from .env.example
 * and seeder/seed files ONLY.
 *
 * SECURITY RULES (enforced by secretGuard, and enforced here):
 *   • ONLY reads .env.example and known seeder patterns.
 *   • NEVER reads .env, .env.local, .env.production, or any secrets/** path.
 *   • NEVER require()s or eval()s target files — regex/text analysis only.
 *   • If a value references process.env.VAR, emits a TODO placeholder.
 *   • All output is tagged DEV/TEST/SEED ONLY in the generated banner.
 *
 * Callers must prepend CREDENTIALS_BANNER to any generated output that
 * includes these credential drafts.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { walk, readFileSafe, dirExists } from '../utils/walk.js';
import { assertSafeToRead } from '../utils/secretGuard.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface CredentialDraft {
  role:     string;
  login:    string;
  password: string;
  seeded:   true;
}

/** Prepend this comment to the credentials array in the generated config. */
export const CREDENTIALS_BANNER =
  '// DEV/TEST/SEED ONLY — never production, never commit real passwords.\n' +
  '// Extracted from .env.example and seeder files only.\n' +
  '// Replace any "TODO: set from env …" values with your actual dev/test credentials.';

// ── Seeder file detection ─────────────────────────────────────────────────────

const SEEDER_PATH_PATTERNS: RegExp[] = [
  /[\\/]seeders?[\\/]/i,
  /[\\/]seeds?[\\/]/i,
  /prisma[\\/]seed\.[jt]s/i,
  /db[\\/]seeds?[\\/]/i,
  /[\\/]seed\.[jt]sx?$/i,
  /devseed/i,
  /seed\.(?:js|ts|mjs|cjs)$/i,
];

function isSeederFile(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/');
  return SEEDER_PATH_PATTERNS.some(p => p.test(norm));
}

// ── Match extraction ──────────────────────────────────────────────────────────

interface RawMatch {
  type:    'email' | 'login' | 'username' | 'password' | 'phone' | 'role';
  value:   string;
  lineIdx: number;
  context: string; // surrounding line text for role inference
  file:    string;  // identifies the source file this match came from, so
                     // matches from different files are never clustered together
}

/**
 * Extract field-value pairs from the content of a single file.
 * Understands:
 *   key: 'value'
 *   key: "value"
 *   key = 'value'
 *   key = "value"
 *   key: `value`   (template literals — literal only)
 *   key: process.env.VAR_NAME  → emits TODO placeholder
 *
 * Keys recognised: email, login, username, password, phone.
 */
function extractMatches(content: string, file: string): RawMatch[] {
  const out: RawMatch[] = [];
  const lines = content.split('\n');

  // Matches:
  //   (email|login|username|password|phone)  : or =  'value' or "value" or `value`
  //   OR   process.env.VARNAME
  const FIELD_RE =
    /\b(email|login|username|password|phone|role)\s*[:=]\s*(?:["'`]([^"'`\r\n]+)["'`]|(process\.env\.(\w+)))/gi;

  // Same field detection, but for field names embedded inside a larger
  // camelCase or SCREAMING_SNAKE_CASE identifier (e.g. `adminPassword =`,
  // `ADMIN_PASSWORD =`), where no \b word-boundary exists immediately before
  // the field name because both sides are \w characters. Requires at least
  // one identifier character before the field name (so it never re-matches
  // the plain-field case already handled by FIELD_RE), anchored to the start
  // of an identifier (start of line or a non-identifier character before it).
  const FIELD_RE_EMBEDDED =
    /(?:^|[^A-Za-z0-9_])[A-Za-z][A-Za-z0-9_]*?(email|login|username|password|phone|role)\s*[:=]\s*(?:["'`]([^"'`\r\n]+)["'`]|(process\.env\.(\w+)))/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    FIELD_RE.lastIndex = 0;

    const claimedRanges: Array<[number, number]> = [];

    while ((m = FIELD_RE.exec(line)) !== null) {
      claimedRanges.push([m.index, m.index + m[0].length]);
      const type = m[1].toLowerCase() as RawMatch['type'];

      let value: string;
      if (m[3] !== undefined) {
        // process.env.VAR_NAME
        value = `TODO: set from env ${m[4]} (use .env.example)`;
      } else {
        value = m[2].trim();
        // Skip obviously non-literal placeholders like <EMAIL>, CHANGE_ME etc.
        if (/^[<{]/.test(value) || /^(change[_-]?me|your[_-])/i.test(value)) continue;
      }

      out.push({ type, value, lineIdx: i, context: line, file });
    }

    FIELD_RE_EMBEDDED.lastIndex = 0;
    while ((m = FIELD_RE_EMBEDDED.exec(line)) !== null) {
      const start = m.index;
      const end   = m.index + m[0].length;
      // Skip if this overlaps a match already found by FIELD_RE above.
      if (claimedRanges.some(([s, e]) => start < e && end > s)) continue;

      const type = m[1].toLowerCase() as RawMatch['type'];

      let value: string;
      if (m[3] !== undefined) {
        // process.env.VAR_NAME
        value = `TODO: set from env ${m[4]} (use .env.example)`;
      } else {
        value = m[2].trim();
        // Skip obviously non-literal placeholders like <EMAIL>, CHANGE_ME etc.
        if (/^[<{]/.test(value) || /^(change[_-]?me|your[_-])/i.test(value)) continue;
      }

      out.push({ type, value, lineIdx: i, context: line, file });
    }
  }

  return out;
}

// ── Role inference ────────────────────────────────────────────────────────────

const ROLE_HINTS: Array<{ role: string; patterns: RegExp[] }> = [
  { role: 'admin',    patterns: [/admin/i, /superuser/i, /root/i, /operator/i] },
  { role: 'seller',   patterns: [/seller/i, /vendor/i, /merchant/i, /store[_-]?owner/i] },
  { role: 'buyer',    patterns: [/buyer/i, /customer/i, /client/i, /shopper/i] },
  { role: 'manager',  patterns: [/manager/i, /supervisor/i] },
  { role: 'user',     patterns: [/\buser\b/i, /\btest\b/i, /\bdemo\b/i] },
  { role: 'guest',    patterns: [/guest/i, /anon/i, /public/i] },
];

function inferRole(context: string, login: string): string {
  const haystack = (context + ' ' + login).toLowerCase();
  for (const { role, patterns } of ROLE_HINTS) {
    if (patterns.some(p => p.test(haystack))) return role;
  }
  return 'user';
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/**
 * Group raw field matches into credential objects by line proximity
 * (matches within 20 lines of each other are considered part of the same
 * credential block). Matches from different source files are NEVER
 * clustered together, regardless of their lineIdx values, since lineIdx is
 * only meaningful relative to the single file it was extracted from.
 */
function groupMatches(matches: RawMatch[]): CredentialDraft[] {
  if (matches.length === 0) return [];

  // Cluster by proximity
  const clusters: RawMatch[][] = [];
  let current: RawMatch[] = [matches[0]];

  for (let i = 1; i < matches.length; i++) {
    const m    = matches[i];
    const prev = current[current.length - 1];

    // A new email/login signals the start of a new credential object even if it
    // falls within the 20-line proximity window (e.g. two consecutive User.create
    // calls in a seeder).
    const isIdentifier =
      m.type === 'email' || m.type === 'login' || m.type === 'username';
    const clusterHasIdentifier = current.some(
      x => x.type === 'email' || x.type === 'login' || x.type === 'username',
    );

    const sameFile = m.file === prev.file;

    if (!sameFile || m.lineIdx - prev.lineIdx > 20 || (isIdentifier && clusterHasIdentifier)) {
      clusters.push(current);
      current = [m];
    } else {
      current.push(m);
    }
  }
  clusters.push(current);

  const creds: CredentialDraft[] = [];

  for (const cluster of clusters) {
    const emailMatch  = cluster.find(m => m.type === 'email');
    const loginMatch  = cluster.find(m => m.type === 'login' || m.type === 'username');
    const passMatch   = cluster.find(m => m.type === 'password');
    const roleMatch   = cluster.find(m => m.type === 'role');

    const login    = (emailMatch ?? loginMatch)?.value;
    const password = passMatch?.value;

    // Need at least one identifying value to emit a row
    if (!login && !password) continue;

    const contextStr = cluster.map(m => m.context).join(' ');
    // Prefer an explicit role: field value; fall back to keyword inference.
    const role       = roleMatch?.value ?? inferRole(contextStr, login ?? '');

    creds.push({
      role,
      login:    login    ?? 'TODO: set login',
      password: password ?? 'TODO: set password',
      seeded:   true,
    });
  }

  // Deduplicate by login value
  const seen = new Set<string>();
  return creds.filter(c => {
    const key = c.login + '|' + c.role;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

/** Directories to search for seeder files. */
const SEEDER_SEARCH_DIRS = [
  'seeders',
  'seeds',
  'prisma',
  'db',
  'database',
  'src/database',
  'src/db',
  'scripts',
  'src/scripts',
  'src',
];

/**
 * Detect dev/test credential hints from `.env.example` and seeder files ONLY.
 * All reads are gated through `assertSafeToRead`.
 *
 * Returns an array of credential drafts (may be empty if nothing detected).
 * The caller is responsible for prepending CREDENTIALS_BANNER in the output.
 */
export function detectCredentials(targetDir: string): CredentialDraft[] {
  const allMatches: RawMatch[] = [];

  // ── 1. .env.example ──────────────────────────────────────────────────────
  const envExample = path.join(targetDir, '.env.example');
  if (fs.existsSync(envExample) && assertSafeToRead(envExample)) {
    const content = readFileSafe(envExample);
    if (content) allMatches.push(...extractMatches(content, envExample));
  }

  // ── 2. Seeder files ───────────────────────────────────────────────────────
  for (const rel of SEEDER_SEARCH_DIRS) {
    const dirPath = path.join(targetDir, rel);
    if (!dirExists(dirPath)) continue;

    const files = walk(dirPath).filter(f => {
      const ext = path.extname(f);
      return (
        ['.js', '.ts', '.mjs', '.cjs', '.json'].includes(ext) &&
        isSeederFile(f) &&
        assertSafeToRead(f)
      );
    });

    for (const f of files) {
      const content = readFileSafe(f);
      if (content) allMatches.push(...extractMatches(content, f));
    }
  }

  return groupMatches(allMatches);
}
