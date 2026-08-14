/**
 * storageHealth.ts — answer "why does it say storage is almost full?".
 *
 * WHAT THAT MESSAGE ACTUALLY MEANS
 * --------------------------------
 * Qapture keeps notes and screenshots in the TESTER'S OWN BROWSER
 * (IndexedDB), never on the server the app was deployed from. Every browser
 * caps how much a single origin may store — typically a percentage of free
 * disk, but as little as a few hundred MB on a busy phone, and Safari evicts
 * data from sites the user hasn't visited in a week regardless of size. So
 * when a tester on a shared beta link saw "Storage full — this note may not
 * survive a reload", it meant: this browser refused the write, and the note
 * only exists in the open tab.
 *
 * v0.4 attacks that from four sides:
 *   1. screenshots are WebP and size-capped (see capture.ts), so a session
 *      costs roughly an order of magnitude less than in 0.3.x;
 *   2. requestPersistentStorage() asks the browser to stop evicting us;
 *   3. this module reports real numbers, so the panel can warn EARLY with a
 *      meter rather than only at the moment of failure;
 *   4. the honest fix for "I can't lose this": folder sync (fsSync.ts) writes
 *      every note straight to disk, where no browser quota applies.
 */

export type StorageLevel = 'ok' | 'warn' | 'critical';

export type StorageHealth = {
  /** Whether navigator.storage.estimate() answered at all. */
  supported: boolean;
  /** Bytes this ORIGIN is using (the host app's caches included). */
  usageBytes: number;
  /** Bytes this origin is allowed. 0 when unknown. */
  quotaBytes: number;
  /** usage / quota, 0 when unknown. */
  ratio: number;
  /** True once the browser has granted persistent (non-evictable) storage. */
  persisted: boolean;
  level: StorageLevel;
};

/** Warn the tester here — well before writes actually start failing. */
const WARN_RATIO = 0.7;
const CRITICAL_RATIO = 0.9;

function levelFor(ratio: number): StorageLevel {
  if (ratio >= CRITICAL_RATIO) return 'critical';
  if (ratio >= WARN_RATIO) return 'warn';
  return 'ok';
}

export const EMPTY_STORAGE_HEALTH: StorageHealth = {
  supported: false,
  usageBytes: 0,
  quotaBytes: 0,
  ratio: 0,
  persisted: false,
  level: 'ok',
};

/** Read the origin's current storage usage. Never throws. */
export async function readStorageHealth(): Promise<StorageHealth> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return EMPTY_STORAGE_HEALTH;
  }
  try {
    const est = await navigator.storage.estimate();
    const usageBytes = est.usage ?? 0;
    const quotaBytes = est.quota ?? 0;
    const ratio = quotaBytes > 0 ? usageBytes / quotaBytes : 0;
    let persisted = false;
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted().catch(() => false);
    }
    return {
      supported: true,
      usageBytes,
      quotaBytes,
      ratio,
      persisted,
      level: levelFor(ratio),
    };
  } catch {
    return EMPTY_STORAGE_HEALTH;
  }
}

/**
 * Ask the browser to keep this origin's data even under disk pressure.
 *
 * Chromium grants this silently for sites with engagement; Firefox prompts;
 * Safari ignores it. A `false` here is not an error — it just means eviction
 * remains possible, which is exactly the case folder sync exists for.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
    return false;
  }
  try {
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Human-readable byte size, e.g. "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  const decimals = value < 10 && i > 1 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

/**
 * Bytes Qapture itself is responsible for — the sum of stored screenshots
 * plus a rough allowance for each note's text/context.
 *
 * Deliberately separate from `usageBytes`: navigator.storage.estimate()
 * reports the WHOLE origin, so on a real app most of it is the host's own
 * caches and service worker. Blaming Qapture for that would send the tester
 * deleting notes that were never the problem.
 */
export function estimateOwnBytes(
  notes: { screenshot?: Blob; description?: string; context?: unknown }[],
): number {
  let total = 0;
  for (const n of notes) {
    total += n.screenshot?.size ?? 0;
    total += (n.description?.length ?? 0) * 2;
    // Context (console/network ring + env + forensics) serialises to a few KB.
    if (n.context) total += 3000;
  }
  return total;
}
