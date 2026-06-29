/**
 * storage.ts — namespaced, SSR-safe localStorage wrapper.
 *
 * Replaces the host app's safeStorage utility.
 * All keys are prefixed as `${namespace}:${key}`.
 * If localStorage throws (private-mode browsers, SSR), falls back to an
 * in-memory Map so the tool stays functional.
 */

export type QaStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  getJSON<T>(key: string, fallback: T): T;
  setJSON<T>(key: string, value: T): void;
};

function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const probe = '__qa_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a namespaced storage adapter.
 *
 * @param namespace - prefix for all stored keys (e.g. 'qapture')
 */
export function createStorage(namespace: string): QaStorage {
  const prefix = `${namespace}:`;
  const fallback = new Map<string, string>();
  const available = isStorageAvailable();

  function fullKey(key: string): string {
    return `${prefix}${key}`;
  }

  function getItem(key: string): string | null {
    if (available) {
      try {
        return window.localStorage.getItem(fullKey(key));
      } catch {
        // fall through to in-memory
      }
    }
    return fallback.get(fullKey(key)) ?? null;
  }

  function setItem(key: string, value: string): void {
    if (available) {
      try {
        window.localStorage.setItem(fullKey(key), value);
        return;
      } catch {
        // fall through to in-memory
      }
    }
    fallback.set(fullKey(key), value);
  }

  function getJSON<T>(key: string, fb: T): T {
    const raw = getItem(key);
    if (raw === null) return fb;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fb;
    }
  }

  function setJSON<T>(key: string, value: T): void {
    try {
      setItem(key, JSON.stringify(value));
    } catch {
      // ignore serialization errors
    }
  }

  return { getItem, setItem, getJSON, setJSON };
}
