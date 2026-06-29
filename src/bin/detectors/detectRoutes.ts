/**
 * detectRoutes — grep the target repo for route definitions and produce a
 * JOURNEY draft grouped into role-based lanes.
 *
 * Sources scanned (regex / text only — NEVER eval / require):
 *   • React Router v6: <Route path="..." and path: '...' in route config objects
 *   • Next.js pages-router: file-path → route mapping under pages/ or src/pages/
 *   • Next.js app-router: app-dir page files -> route mapping
 *   • Vue Router: { path: '...' } patterns
 *
 * Every step emits risk:'green' as a placeholder — the developer grades them.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { walk, readFileSafe, dirExists } from '../utils/walk.js';
import { assertSafeToRead } from '../utils/secretGuard.js';

// ── Public types (mirrors QaConfig schema) ────────────────────────────────────

export interface JourneyStep {
  path: string;
  /** Always 'green' in generated draft — developer grades to red/amber/green. */
  risk: 'green';
  what: { en: string; ar: string };
}

export interface JourneyLane {
  id: string;
  color: string;
  role: { en: string; ar: string };
  steps: JourneyStep[];
}

export type JourneyDraft = JourneyLane[];

// ── Lane colours ──────────────────────────────────────────────────────────────

const LANE_COLORS: Record<string, string> = {
  buyer:  '#4f46e5', // indigo
  seller: '#7c3aed', // violet
  admin:  '#dc2626', // red
};

const LANE_META: Array<{ id: string; en: string; ar: string }> = [
  { id: 'buyer',  en: 'Buyer / Public', ar: 'المشتري / عام' },
  { id: 'seller', en: 'Seller',         ar: 'البائع'        },
  { id: 'admin',  en: 'Admin',          ar: 'المسؤول'       },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStep(routePath: string): JourneyStep {
  return {
    path: routePath,
    risk: 'green',
    what: { en: 'TODO: describe what to test here', ar: '' },
  };
}

/**
 * Classify a route path into a lane id.
 * Auth paths are returned as 'auth' so callers can exclude them.
 */
function classifyPath(routePath: string): 'seller' | 'admin' | 'auth' | 'buyer' {
  const p = routePath.toLowerCase();

  if (/^\/(seller|store-owner|vendor)/.test(p)) return 'seller';

  if (/^\/(admin|dashboard|control-panel|backoffice|back-office|management|cms)/.test(p)) {
    return 'admin';
  }

  if (
    /^\/(login|signin|sign-in|signup|sign-up|register|auth|forgot-password|reset-password|verify|email-verification|oauth)/.test(p)
  ) {
    return 'auth';
  }

  return 'buyer';
}

// ── Next.js pages-router: file path → route ───────────────────────────────────

function fileToNextPagesRoute(filePath: string, pagesDir: string): string {
  let rel = filePath.slice(pagesDir.length).replace(/\\/g, '/');
  if (rel.startsWith('/')) rel = rel.slice(1);

  // Drop extension
  rel = rel.replace(/\.(tsx?|jsx?|mdx?)$/, '');

  // Normalise index
  if (rel === 'index') return '/';
  rel = rel.replace(/\/index$/, '');

  // Skip internal Next.js files and API routes
  if (/^_/.test(rel) || /^api(\/|$)/.test(rel)) return '';

  // Dynamic segments: [id] → :id, [...slug] → *
  rel = rel.replace(/\[\.\.\.([^\]]+)\]/g, '*').replace(/\[([^\]]+)\]/g, ':$1');

  return '/' + rel;
}

// ── Next.js app-router: page.* file → route ───────────────────────────────────

const APP_PAGE_BASENAME = /^page\.(tsx?|jsx?)$/;

function fileToAppRoute(filePath: string, appDir: string): string {
  if (!APP_PAGE_BASENAME.test(path.basename(filePath))) return '';

  let rel = path.dirname(filePath).slice(appDir.length).replace(/\\/g, '/');
  if (rel.startsWith('/')) rel = rel.slice(1);

  // Strip route groups: (groupName)/
  rel = rel.replace(/\([^)]*\)\//g, '').replace(/\([^)]*\)$/, '');

  // Dynamic segments
  rel = rel.replace(/\[\.\.\.([^\]]+)\]/g, '*').replace(/\[([^\]]+)\]/g, ':$1');

  return '/' + (rel || '');
}

// ── Source-file grep for React Router v6 and Vue Router ───────────────────────

const SOURCE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.mjs', '.cjs']);

// React Router JSX: <Route path="..." or <Route … path='...'
const RE_REACT_JSX  = /<Route\b[^>]*\bpath=["']([^"']+)["']/g;
// React Router object: path: '/foo' (filter: value must start with /)
const RE_REACT_OBJ  = /\bpath:\s*["'](\/?[^"']+)["']/g;
// Vue Router:  { path: '/foo' }
const RE_VUE_ROUTE  = /\{\s*path:\s*["']([^"']+)["']/g;
// Hono/Express: app.get('/foo', ...) — bonus detection
const RE_HTTP_ROUTE = /\bapp\.(?:get|post|put|patch|delete|all)\(["']([/][^"']+)["']/g;

function grepSourceFile(filePath: string, addRoute: (r: string) => void): void {
  if (!SOURCE_EXTS.has(path.extname(filePath).toLowerCase())) return;
  if (!assertSafeToRead(filePath)) return;

  const content = readFileSafe(filePath);
  if (!content) return;

  let m: RegExpExecArray | null;

  RE_REACT_JSX.lastIndex = 0;
  while ((m = RE_REACT_JSX.exec(content)) !== null) addRoute(m[1]);

  RE_REACT_OBJ.lastIndex = 0;
  while ((m = RE_REACT_OBJ.exec(content)) !== null) {
    if (m[1].startsWith('/') || m[1] === '*') addRoute(m[1]);
  }

  RE_VUE_ROUTE.lastIndex = 0;
  while ((m = RE_VUE_ROUTE.exec(content)) !== null) addRoute(m[1]);

  RE_HTTP_ROUTE.lastIndex = 0;
  while ((m = RE_HTTP_ROUTE.exec(content)) !== null) addRoute(m[1]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Detect all routes in `targetDir` and return a typed journey draft.
 * Deterministic: routes are sorted before assignment.
 */
export function detectRoutes(targetDir: string): JourneyDraft {
  const routes = new Set<string>();

  const addRoute = (r: string): void => {
    const trimmed = r.trim();
    if (trimmed && trimmed !== '*') routes.add(trimmed);
  };

  // ── 1. Next.js pages router ───────────────────────────────────────────────
  for (const dir of [
    path.join(targetDir, 'pages'),
    path.join(targetDir, 'src', 'pages'),
  ]) {
    if (!dirExists(dir)) continue;
    for (const f of walk(dir)) {
      if (assertSafeToRead(f)) {
        const r = fileToNextPagesRoute(f, dir);
        if (r) addRoute(r);
      }
    }
  }

  // ── 2. Next.js app router ─────────────────────────────────────────────────
  for (const dir of [
    path.join(targetDir, 'app'),
    path.join(targetDir, 'src', 'app'),
  ]) {
    if (!dirExists(dir)) continue;
    for (const f of walk(dir)) {
      if (assertSafeToRead(f)) {
        const r = fileToAppRoute(f, dir);
        if (r) addRoute(r);
      }
    }
  }

  // ── 3. React Router / Vue Router / HTTP routes (grep src/) ────────────────
  const srcDir = path.join(targetDir, 'src');
  if (dirExists(srcDir)) {
    for (const f of walk(srcDir)) {
      grepSourceFile(f, addRoute);
    }
  }

  // Also grep root-level files like routes.ts, router.ts, app.ts
  const rootCandidates = ['routes.ts', 'routes.js', 'router.ts', 'router.js', 'app.ts', 'app.js'];
  for (const name of rootCandidates) {
    const f = path.join(targetDir, name);
    if (fs.existsSync(f)) grepSourceFile(f, addRoute);
  }

  // ── 4. Group into lanes ───────────────────────────────────────────────────
  const buckets: Record<string, string[]> = { buyer: [], seller: [], admin: [] };

  for (const route of Array.from(routes).sort()) {
    const lane = classifyPath(route);
    if (lane === 'auth') continue; // excluded from journey (login flows are implicit)
    buckets[lane].push(route);
  }

  // Build lane objects — skip empty lanes
  const lanes: JourneyLane[] = [];
  for (const { id, en, ar } of LANE_META) {
    const paths = buckets[id];
    if (!paths || paths.length === 0) continue;
    lanes.push({
      id,
      color: LANE_COLORS[id] ?? '#4f46e5',
      role:  { en, ar },
      steps: paths.map(makeStep),
    });
  }

  // ── 5. Fallback: no routes detected ──────────────────────────────────────
  if (lanes.length === 0) {
    lanes.push({
      id:    'buyer',
      color: LANE_COLORS['buyer'],
      role:  { en: 'Buyer / Public', ar: 'المشتري / عام' },
      steps: [makeStep('/')],
    });
  }

  return lanes;
}
