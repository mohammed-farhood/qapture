/**
 * QaContext.tsx — all runtime state for qa-studio.
 *
 * Ported from qa-overlay/QaContext.jsx with ALL host coupling removed:
 *  - No import of qa.config (config comes in via props)
 *  - No import of host safeStorage (replaced by createStorage)
 *  - No import of host LanguageContext (RTL comes from config.rtl)
 *
 * The provider receives a fully-resolved config from the ShadowMount layer.
 * Notes persist in IndexedDB; lang/guide/logins persist in localStorage.
 *
 * RTL / direction notes:
 *   `dir` is derived from lang ('ar' → 'rtl', else 'ltr'), matching the
 *   original. `config.rtl` seeds the initial language to 'ar' when true,
 *   so the panel starts in RTL. The user can still toggle language freely.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type ReactElement,
} from 'react';
import type { ResolvedConfig, QaTheme, QaBilingual, QaCredential, QaJourneyLane, QaPreamble } from '../config/schema';
import { createStorage } from '../lib/storage';
import { createIdb } from '../lib/idb';
import { translate, pick as pickFn } from '../lib/strings';
import { buildAndDownloadZip } from '../lib/exportZip';

// ---------------------------------------------------------------------------
// Data shapes
// ---------------------------------------------------------------------------

/** The rect of a selected element or drawn region (integers after rounding). */
export type QaRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/**
 * The captured target of a capture-mode selection.
 * Matches the EXACT runtime shape written by CaptureMode.save():
 *   kind, selector?, tagName?, text?, rect
 */
export type QaTarget = {
  kind: 'element' | 'region';
  selector?: string;
  tagName?: string;
  text?: string;
  rect: QaRect;
};

/**
 * A single QA note.
 * Matches the EXACT runtime shape created by QaContext.addNote() and stored
 * in IndexedDB:
 *   id, url, route, timestamp, description, screenshot?, target?
 */
export type QaNote = {
  id: string;
  url: string;
  route: string;
  timestamp: string;
  description: string;
  screenshot?: Blob;
  target?: QaTarget;
};

// ---------------------------------------------------------------------------
// Context value shape (CONTRACT for the component agent)
// ---------------------------------------------------------------------------

export type QaContextValue = {
  // Data
  notes: QaNote[];
  guideChecked: Set<string>;
  loginsUsed: Set<string>;

  // UI state
  isOpen: boolean;
  activeTab: 'notes' | 'logins' | 'guide';
  captureActive: boolean;
  isExporting: boolean;

  // i18n
  lang: string;
  dir: 'ltr' | 'rtl';

  // Config passthrough (from ResolvedConfig)
  theme: QaTheme;
  brand: { label: string };
  loginField: { en: string; ar?: string };
  credentials: QaCredential[];
  journey: QaJourneyLane[];
  preamble: QaPreamble | null;

  // i18n helpers
  t: (key: string, vars?: Record<string, string | number>) => string;
  pick: (value: QaBilingual | null | undefined) => string;

  // Actions — UI
  setIsOpen: (open: boolean) => void;
  setActiveTab: (tab: 'notes' | 'logins' | 'guide') => void;
  setLang: (lang: string) => void;

  // Actions — notes
  addNote: (input: { description: string; screenshot?: Blob; target?: QaTarget }) => Promise<QaNote>;
  /**
   * Patch a note. `screenshot: null` removes the screenshot (sets to undefined).
   * `screenshot: Blob` replaces it. `screenshot: undefined` (or omitted) leaves it unchanged.
   */
  updateNote: (id: string, patch: { description?: string; screenshot?: Blob | null }) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;

  // Actions — capture mode
  startCapture: () => void;
  endCapture: (reopen?: boolean) => void;

  // Actions — guide + logins
  toggleGuide: (key: string) => void;
  toggleLogin: (key: string) => void;

  // Export
  exportZip: (filename?: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a collision-resistant ID. SSR-safe: falls back to timestamp+random. */
function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const nowIso = (): string => new Date().toISOString();

/**
 * Safe window.location read — returns empty strings on SSR.
 */
function safeLocation(): { href: string; pathname: string; search: string } {
  if (typeof window === 'undefined') return { href: '', pathname: '', search: '' };
  return {
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const QaContext = createContext<QaContextValue | null>(null);

// localStorage keys (relative to the namespace, no full prefix needed here
// since createStorage prepends `${namespace}:` automatically)
const LANG_KEY  = 'lang';
const GUIDE_KEY = 'guide';
const LOGIN_KEY = 'logins';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function QaProvider({
  config,
  children,
}: {
  config: ResolvedConfig;
  children: ReactNode;
}): ReactElement {
  // Create per-namespace storage and IDB adapters.
  // These are stable references for the lifetime of the provider because
  // config.namespace should not change at runtime.
  const [storage] = useState(() => createStorage(config.namespace));
  const [idb]     = useState(() => createIdb(config.namespace));

  // ── Notes ────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<QaNote[]>([]);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [isOpen,         setIsOpen]         = useState(false);
  const [activeTab,      setActiveTab]      = useState<'notes' | 'logins' | 'guide'>('notes');
  const [captureActive,  setCaptureActive]  = useState(false);
  const [isExporting,    setIsExporting]    = useState(false);

  // ── i18n ─────────────────────────────────────────────────────────────────
  // If config.rtl is true, seed lang as 'ar' so the tool starts in RTL.
  // Otherwise read from localStorage, falling back to 'en'.
  const [lang, setLangState] = useState<string>(() => {
    const saved = storage.getItem(LANG_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
    return config.rtl ? 'ar' : 'en';
  });

  // ── Guide checklist ───────────────────────────────────────────────────────
  const [guideChecked, setGuideChecked] = useState<Set<string>>(
    () => new Set<string>(storage.getJSON<string[]>(GUIDE_KEY, [])),
  );

  // ── Logins used ───────────────────────────────────────────────────────────
  const [loginsUsed, setLoginsUsed] = useState<Set<string>>(
    () => new Set<string>(storage.getJSON<string[]>(LOGIN_KEY, [])),
  );

  // ── Load notes from IDB on mount ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    idb.getAll()
      .then((rows) => {
        if (!alive) return;
        const sorted = (rows as QaNote[]).slice().sort((a, b) =>
          a.timestamp < b.timestamp ? 1 : -1,
        );
        setNotes(sorted);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [idb]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setLang = useCallback((l: string) => {
    setLangState(l);
    storage.setItem(LANG_KEY, l);
  }, [storage]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const pick = useCallback(
    (value: QaBilingual | null | undefined) => pickFn(value, lang),
    [lang],
  );

  const addNote = useCallback(
    async ({
      description,
      screenshot,
      target,
    }: {
      description: string;
      screenshot?: Blob;
      target?: QaTarget;
    }): Promise<QaNote> => {
      const loc = safeLocation();
      const note: QaNote = {
        id: uid(),
        url: loc.href,
        route: loc.pathname + loc.search,
        timestamp: nowIso(),
        description: (description || '').trim(),
        screenshot: screenshot ?? undefined,
        target: target ?? undefined,
      };
      setNotes((prev) => [note, ...prev]);
      await idb.put(note);
      return note;
    },
    [idb],
  );

  const updateNote = useCallback(
    async (
      id: string,
      patch: { description?: string; screenshot?: Blob | null },
    ): Promise<void> => {
      let updated: QaNote | null = null;
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const next: QaNote = { ...n };
          // Normalize description trim.
          if (patch.description != null) next.description = patch.description.trim();
          // screenshot: Blob → replace; null → remove; undefined → leave unchanged.
          if (patch.screenshot === null) {
            next.screenshot = undefined;
          } else if (patch.screenshot !== undefined) {
            next.screenshot = patch.screenshot;
          }
          updated = next;
          return next;
        }),
      );
      if (updated) {
        await idb.put(updated);
      }
    },
    [idb],
  );

  const deleteNote = useCallback(
    async (id: string): Promise<void> => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      await idb.delete(id);
    },
    [idb],
  );

  const clearAll = useCallback(async (): Promise<void> => {
    setNotes([]);
    await idb.clear();
  }, [idb]);

  const startCapture = useCallback(() => {
    setIsOpen(false);
    setCaptureActive(true);
  }, []);

  const endCapture = useCallback((reopen = true) => {
    setCaptureActive(false);
    if (reopen) setIsOpen(true);
  }, []);

  /**
   * Guide checked key scheme (matches GuideSection.jsx):
   *   key = `${laneId}::${step.path}`
   * e.g. 'public::/browse'
   */
  const toggleGuide = useCallback((key: string) => {
    setGuideChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      storage.setJSON(GUIDE_KEY, [...next]);
      return next;
    });
  }, [storage]);

  /**
   * Logins used key scheme (matches CredentialsSection.jsx):
   *   key = credential.role  (e.g. 'Admin', 'Buyer', 'Seller · Baghdad Yarn')
   */
  const toggleLogin = useCallback((key: string) => {
    setLoginsUsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      storage.setJSON(LOGIN_KEY, [...next]);
      return next;
    });
  }, [storage]);

  const exportZipFn = useCallback(
    async (filename?: string): Promise<void> => {
      if (!notes.length || isExporting) return;
      setIsExporting(true);
      try {
        // Pass the resolved config + current guideChecked so the export preamble
        // can render theme tokens, credentials, journey coverage, and preamble fields.
        await buildAndDownloadZip(notes, nowIso(), filename, config, guideChecked);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[QA] export failed', err);
      } finally {
        setIsExporting(false);
      }
    },
    [notes, isExporting, config, guideChecked],
  );

  // ── Context value ─────────────────────────────────────────────────────────

  const value: QaContextValue = {
    // Data
    notes,
    guideChecked,
    loginsUsed,

    // UI state
    isOpen,
    activeTab,
    captureActive,
    isExporting,

    // i18n
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',

    // Config passthrough
    theme:       config.theme,
    brand:       config.brand,
    loginField:  config.loginField,
    credentials: config.credentials,
    journey:     config.journey,
    preamble:    config.preamble,

    // i18n helpers
    t,
    pick,

    // Actions
    setIsOpen,
    setActiveTab,
    setLang,
    addNote,
    updateNote,
    deleteNote,
    clearAll,
    startCapture,
    endCapture,
    toggleGuide,
    toggleLogin,
    exportZip: exportZipFn,
  };

  return <QaContext.Provider value={value}>{children}</QaContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQa(): QaContextValue {
  const ctx = useContext(QaContext);
  if (!ctx) throw new Error('useQa must be used inside <QaProvider>');
  return ctx;
}
