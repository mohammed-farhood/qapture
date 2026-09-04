/**
 * versionCheck.ts — is this copy out of date?
 *
 * WHY THIS EARNS ITS PLACE
 * ------------------------
 * Three apps sat on 0.7.x for months while every screenshot on an image-heavy
 * page failed, and the fix had been published the whole time. Nobody knew,
 * because nothing said so. `^0.7.2` will never move to 0.8 on its own — npm
 * refuses to cross a minor below 1.0 — so an out-of-date install stays out of
 * date silently, forever, no matter how often anyone runs `npm update`.
 *
 * A version number nobody reads is not a release. This makes the answer
 * visible in the one place someone looks when something seems wrong.
 *
 * WHERE IT APPEARS, AND WHERE IT DOES NOT
 * ---------------------------------------
 * In Settings. Not a toast, not a banner, not a dot on the button. A client
 * testing a checkout has no ability to upgrade an npm package and no business
 * being interrupted about one; the person who can act on it is the one who
 * opens Settings.
 *
 * Checked at most once a day, cached in localStorage, and any failure is
 * silent — a registry that is unreachable is not the tester's problem, and a
 * QA widget that complains about its own update check has lost the plot.
 */

const CACHE_KEY = 'qa.versionCheck';
const A_DAY = 24 * 60 * 60 * 1000;
const REGISTRY = 'https://registry.npmjs.org/qapture2/latest';

interface Cached { at: number; latest: string }

/** Compare two dotted versions. Returns true when `latest` is newer. */
export function isNewer(latest: string, current: string): boolean {
  const norm = (v: string) => v.replace(/^[^\d]*/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const a = norm(latest);
  const b = norm(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * The newest published version, or null if we do not know.
 *
 * Never throws, and never blocks anything: the caller renders fine without it.
 */
export async function latestVersion(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as Cached;
      if (Date.now() - cached.at < A_DAY && cached.latest) return cached.latest;
    }
  } catch { /* a broken cache entry is not worth a failure */ }

  try {
    const res = await fetch(REGISTRY, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    const latest = body.version;
    if (!latest) return null;
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), latest } satisfies Cached));
    } catch { /* private mode; the check simply repeats next time */ }
    return latest;
  } catch {
    // Offline, blocked by CSP, behind a corporate proxy. All fine, all silent.
    return null;
  }
}

/**
 * The upgrade instruction, spelled out.
 *
 * `npm update` is the obvious guess and it is the wrong one below 1.0: a
 * caret range will not cross a minor there, so `npm update` reports success
 * and changes nothing. Saying the exact command saves the hour that costs.
 */
export function upgradeHint(latest: string): string {
  return `npm i qapture2@${latest}`;
}
