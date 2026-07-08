/**
 * idb.ts — namespaced, versioned IndexedDB wrapper.
 *
 * Ported from qa-overlay/idb.js with:
 *  - Namespaced DB name: `${namespace}-db`
 *  - DB_VERSION = 2 migration ladder:
 *      v1 → creates `notes` store (keyPath: 'id')
 *      v2 → creates `meta` store  (keyPath: 'key')
 *  - SSR-safe: guards `typeof indexedDB === 'undefined'` separately from window
 *  - All ops wrapped in try/catch; on failure resolve to empty/no-op so notes
 *    simply won't persist rather than crashing.
 */

/** The current DB schema version. */
export const DB_VERSION = 2;

const NOTES_STORE = 'notes';
const META_STORE  = 'meta';

export type QaIdb = {
  getAll(): Promise<unknown[]>;
  put(record: object): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
};

// Each namespace gets its own db-promise cache.
const dbCache = new Map<string, Promise<IDBDatabase>>();

function isIdbAvailable(): boolean {
  // jsdom defines window but NOT indexedDB — check indexedDB directly.
  return typeof indexedDB !== 'undefined';
}

function openDB(dbName: string): Promise<IDBDatabase> {
  const cached = dbCache.get(dbName);
  if (cached) return cached;

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(dbName, DB_VERSION);
    } catch (err) {
      dbCache.delete(dbName);
      reject(err);
      return;
    }

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const oldVersion = e.oldVersion;

      // Migration ladder — switch falls through intentionally.
      switch (true) {
        case oldVersion < 1:
          if (!db.objectStoreNames.contains(NOTES_STORE)) {
            db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
          }
        // falls through
        case oldVersion < 2:
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: 'key' });
          }
          break;
        default:
          break;
      }
    };

    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);

    req.onerror = (e) => {
      dbCache.delete(dbName); // allow retry after a failed open
      reject((e.target as IDBOpenDBRequest).error);
    };

    req.onblocked = () => {
      // Another tab is holding an older-version connection open, blocking
      // the version upgrade indefinitely. Fail fast instead of hanging.
      dbCache.delete(dbName); // allow retry after the blocking tab closes
      reject(new Error(`IndexedDB open blocked for "${dbName}" — another tab has an older connection open`));
    };
  });

  dbCache.set(dbName, promise);
  return promise;
}

function run<T>(
  dbName: string,
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest | null,
): Promise<T | undefined> {
  return openDB(dbName).then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const s = tx.objectStore(store);
        let result: T | undefined;
        const req = fn(s);
        if (req) {
          req.onsuccess = () => {
            result = req.result as T;
          };
        }
        tx.oncomplete = () => resolve(result);
        tx.onerror   = () => reject(tx.error);
        tx.onabort   = () => reject(tx.error);
      }),
  );
}

/**
 * Create a namespaced IDB adapter over the `notes` store.
 *
 * @param namespace - used to form the DB name as `${namespace}-db`
 */
export function createIdb(namespace: string): QaIdb {
  const dbName = `${namespace}-db`;

  if (!isIdbAvailable()) {
    // SSR / jsdom — return a no-op adapter.
    return {
      getAll: () => Promise.resolve([]),
      put:    () => Promise.resolve(),
      delete: () => Promise.resolve(),
      clear:  () => Promise.resolve(),
    };
  }

  return {
    getAll: async () => {
      try {
        const rows = await run<unknown[]>(dbName, NOTES_STORE, 'readonly', (s) => s.getAll());
        return rows ?? [];
      } catch {
        return [];
      }
    },

    put: async (record) => {
      try {
        await run(dbName, NOTES_STORE, 'readwrite', (s) => s.put(record));
      } catch {
        // ignore
      }
    },

    delete: async (id) => {
      try {
        await run(dbName, NOTES_STORE, 'readwrite', (s) => s.delete(id));
      } catch {
        // ignore
      }
    },

    clear: async () => {
      try {
        await run(dbName, NOTES_STORE, 'readwrite', (s) => s.clear());
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Full uninstall helper — wipes the entire DB for the given namespace.
 * Call from the browser console: `import('qapture2').then(m => m.deleteQaDatabase('qapture'))`.
 */
export function deleteQaDatabase(namespace: string): Promise<void> {
  const dbName = `${namespace}-db`;
  if (!isIdbAvailable()) return Promise.resolve();

  // Close any live cached connection first — deleteDatabase() blocks forever
  // while a connection to the database remains open.
  const cached = dbCache.get(dbName);
  dbCache.delete(dbName); // so a later open() creates a fresh connection

  const closed = cached ? cached.then((db) => db.close()).catch(() => {}) : Promise.resolve();

  return closed.then(
    () =>
      new Promise<void>((resolve, reject) => {
        let req: IDBOpenDBRequest;
        try {
          req = indexedDB.deleteDatabase(dbName);
        } catch (err) {
          reject(err);
          return;
        }

        req.onsuccess = () => resolve();
        req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
        req.onblocked = () =>
          reject(new Error(`IndexedDB deleteDatabase blocked for "${dbName}" — another connection is still open`));
      }),
  );
}
