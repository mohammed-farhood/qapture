/**
 * detectTheme — extract brand colour tokens from tailwind.config.* and/or
 * CSS custom-property declarations.
 *
 * Strategy (regex/text only — NEVER eval / require):
 *   1. Read tailwind.config.{js,ts,cjs,mjs} → extract name:'#hex' pairs inside
 *      the theme.extend.colors block (and the broader config, for safety).
 *   2. Walk common CSS/SCSS files → extract `--color-X: #hex` custom properties.
 *   3. Map detected color names to the 9 ThemeDraft keys via alias table.
 *      Unknown/unmapped colors are left as '#REPLACE_ME'.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { readFileSafe, walk, dirExists } from '../utils/walk.js';
import { assertSafeToRead } from '../utils/secretGuard.js';

// ── Public type (mirrors QaTheme in schema.ts) ────────────────────────────────

export type ThemeDraft = {
  primary:     string;
  primaryDark: string;
  accent:      string;
  accentDark:  string;
  sage:        string;
  cream:       string;
  mauve:       string;
  surface:     string;
  ink:         string;
};

type ThemeKey = keyof ThemeDraft;

export const PLACEHOLDER = '#REPLACE_ME';

// ── Alias table: map color name fragments to ThemeDraft keys ─────────────────
// Ordered from most specific to least specific; first match wins.

const KEY_ALIASES: Array<{ key: ThemeKey; patterns: RegExp[] }> = [
  {
    key: 'primaryDark',
    patterns: [
      /primary[-_]?dark/i,
      /primary[-_]?(?:800|900|700|deep)/i,
      /brand[-_]?dark/i,
    ],
  },
  {
    key: 'primary',
    patterns: [
      /^primary$/i,
      /primary[-_]?(?:base|default|main|500|600)?$/i,
      /^brand$/i,
      /brand[-_]?(?:main|primary|base|default)?$/i,
    ],
  },
  {
    key: 'accentDark',
    patterns: [
      /accent[-_]?dark/i,
      /accent[-_]?(?:700|800|900|deep)/i,
      /secondary[-_]?dark/i,
    ],
  },
  {
    key: 'accent',
    patterns: [
      /^accent$/i,
      /accent[-_]?(?:base|default|main|500|600)?$/i,
      /^secondary$/i,
      /secondary[-_]?(?:main|base|default)?$/i,
      /^highlight$/i,
    ],
  },
  {
    key: 'sage',
    patterns: [
      /^sage$/i,
      /^muted$/i,
      /^neutral$/i,
      /^subdued$/i,
      /gray[-_]?500/i,
    ],
  },
  {
    key: 'cream',
    patterns: [
      /^cream$/i,
      /^background[-_]?light$/i,
      /^bg[-_]?light$/i,
      /^off[-_]?white$/i,
      /^paper$/i,
      /^canvas$/i,
    ],
  },
  {
    key: 'mauve',
    patterns: [
      /^mauve$/i,
      /^lavender$/i,
      /^purple[-_]?light$/i,
      /^lilac$/i,
      /^periwinkle$/i,
    ],
  },
  {
    key: 'surface',
    patterns: [
      /^surface$/i,
      /^card$/i,
      /^panel$/i,
      /^background$/i,
      /^bg$/i,
    ],
  },
  {
    key: 'ink',
    patterns: [
      /^ink$/i,
      /^text[-_]?(?:default|primary|base|main)?$/i,
      /^foreground$/i,
      /^content$/i,
      /^copy$/i,
    ],
  },
];

function resolveThemeKey(name: string): ThemeKey | null {
  for (const { key, patterns } of KEY_ALIASES) {
    for (const pat of patterns) {
      if (pat.test(name)) return key;
    }
  }
  return null;
}

// ── Extraction helpers ────────────────────────────────────────────────────────

const HEX_COLOR = /#[0-9a-fA-F]{3,8}\b/;

/**
 * Extract name → hex pairs from Tailwind config source text.
 * Matches patterns like:  primary: '#4f46e5'  or  "primary-dark": "#3730a3"
 * Does NOT eval/require the file.
 */
function extractTailwindColors(content: string): Map<string, string> {
  const colors = new Map<string, string>();
  // Match: 'key': '#hex' or "key": "#hex" or key: '#hex'
  const RE = /['"]?([\w-]+)['"]?\s*:\s*['"]?(#[0-9a-fA-F]{3,8})['"]?/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(content)) !== null) {
    const [, name, hex] = m;
    if (HEX_COLOR.test(hex)) {
      colors.set(name.toLowerCase(), hex);
    }
  }
  return colors;
}

/**
 * Extract CSS custom property colour declarations.
 * Matches: --color-primary: #4f46e5  or  --clr-accent: #7c3aed
 * Strips common prefixes (color-, clr-, c-, qs-, qa-) from the variable name.
 */
function extractCssCustomProps(content: string): Map<string, string> {
  const colors = new Map<string, string>();
  const RE = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(content)) !== null) {
    const [, varName, hex] = m;
    if (!HEX_COLOR.test(hex)) continue;
    // Strip well-known prefixes
    const stripped = varName
      .replace(/^(?:color|colour|clr|c|qs|qa)[-_]/, '')
      .toLowerCase();
    if (!colors.has(stripped)) colors.set(stripped, hex);
    // Also store the full name as fallback
    if (!colors.has(varName.toLowerCase())) colors.set(varName.toLowerCase(), hex);
  }
  return colors;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/** Directories to scan for CSS/SCSS files. */
const CSS_SEARCH_DIRS = [
  '',              // root
  'src',
  'styles',
  'css',
  'src/styles',
  'src/css',
  'src/app',
  'app',
  'assets',
  'assets/css',
  'assets/styles',
  'public',
];

/**
 * Detect brand theme tokens from tailwind config and/or CSS custom properties.
 * Returns a ThemeDraft where undetected slots are set to '#REPLACE_ME'.
 */
export function detectTheme(targetDir: string): ThemeDraft {
  const draft: ThemeDraft = {
    primary:     PLACEHOLDER,
    primaryDark: PLACEHOLDER,
    accent:      PLACEHOLDER,
    accentDark:  PLACEHOLDER,
    sage:        PLACEHOLDER,
    cream:       PLACEHOLDER,
    mauve:       PLACEHOLDER,
    surface:     PLACEHOLDER,
    ink:         PLACEHOLDER,
  };

  const allColors = new Map<string, string>();

  const mergeColors = (extracted: Map<string, string>): void => {
    for (const [k, v] of extracted) {
      if (!allColors.has(k)) allColors.set(k, v);
    }
  };

  // ── 1. Tailwind config ────────────────────────────────────────────────────
  const tailwindNames = [
    'tailwind.config.ts',
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
  ];

  for (const name of tailwindNames) {
    const filePath = path.join(targetDir, name);
    if (fs.existsSync(filePath) && assertSafeToRead(filePath)) {
      const content = readFileSafe(filePath);
      if (content) mergeColors(extractTailwindColors(content));
      break; // stop after first found
    }
  }

  // ── 2. CSS / SCSS / Less custom properties ────────────────────────────────
  const CSS_EXTS = /\.(css|scss|sass|less|styl)$/i;

  for (const rel of CSS_SEARCH_DIRS) {
    const dirPath = rel ? path.join(targetDir, rel) : targetDir;
    if (!dirExists(dirPath)) continue;

    // Only look one level deep unless it's a dedicated styles dir
    const files =
      rel.includes('style') || rel.includes('css')
        ? walk(dirPath).filter(f => CSS_EXTS.test(f))
        : fs.readdirSync(dirPath)
            .filter(f => CSS_EXTS.test(f))
            .map(f => path.join(dirPath, f));

    for (const filePath of files) {
      if (!assertSafeToRead(filePath)) continue;
      const content = readFileSafe(filePath);
      if (content) mergeColors(extractCssCustomProps(content));
    }
  }

  // ── 3. Map detected names to ThemeDraft keys ──────────────────────────────
  for (const [name, hex] of allColors) {
    const key = resolveThemeKey(name);
    if (key && draft[key] === PLACEHOLDER) {
      draft[key] = hex;
    }
  }

  return draft;
}

/**
 * Return true if the draft has at least one detected (non-placeholder) colour.
 */
export function hasDetectedColors(draft: ThemeDraft): boolean {
  return Object.values(draft).some(v => v !== PLACEHOLDER);
}
