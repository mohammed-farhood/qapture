/**
 * QaContext.tsx — all runtime state for qapture.
 *
 * Ported from qa-overlay/QaContext.jsx with ALL host coupling removed:
 *  - No import of qa.config (config comes in via props)
 *  - No import of host safeStorage (replaced by createStorage)
 *  - No import of host LanguageContext (RTL comes from config.rtl)
 *
 * The provider receives a fully-resolved config from the ShadowMount layer.
 * Notes persist in IndexedDB; lang/guide/guideFailed/logins persist in
 * localStorage.
 *
 * RTL / direction notes:
 *   `dir` is derived from lang ('ar' → 'rtl', else 'ltr'), matching the
 *   original. `config.rtl` seeds the initial language to 'ar' when true,
 *   so the panel starts in RTL. The user can still toggle language freely.
 *
 * v0.3 "Graphite" additions (this file):
 *  - `theme` REMOVED from QaContextValue — the widget ships one fixed design,
 *    components no longer read colours from context.
 *  - Toast notices (`notices`/`notify`/`dismissNotice`), a small queue with
 *    per-id replace-in-place semantics and a hard cap so nothing can spam the
 *    stack.
 *  - `notesLoading` so NoteList can show skeletons instead of a false "empty"
 *    state while IndexedDB is still answering.
 *  - Soft-delete: `deleteNote`/`clearNotes` remove from state immediately but
 *    only commit the IDB write 5s later, giving the tester a real Undo. A
 *    `beforeunload` + unmount flush guarantees a closed tab never silently
 *    resurrects a note the tester believed was gone.
 *  - Test-along: a guided step-by-step mode over `config.journey`, with its
 *    own pass/fail grading (`guideFailed`, mirroring `guideChecked`'s
 *    persistence) and an evidence index so each step can show which notes
 *    were captured against it.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
  type ReactElement,
} from 'react';
import type { ResolvedConfig, QaBilingual, QaCredential, QaJourneyLane, QaPreamble } from '../config/schema';
import { matchRouteToSteps, type QaJourneyRef } from '../lib/journeyMatch';
import { drainSinceLastNote, collectEnvSnapshot, type QaNoteContext, type QaTargetForensics } from '../lib/contextBuffer';
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
  /**
   * Page scroll position (window.scrollX/scrollY) at the moment this target
   * was captured. For kind:'region' targets (no CSS selector, so "Locate on
   * page" can only fall back to the raw rect), this lets the locate-time
   * highlight correct for any scrolling that happened since capture.
   */
  scroll?: { x: number; y: number };
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
  /**
   * v0.3 additions — ALL optional, so notes written by 0.2.x read back
   * unchanged and no IndexedDB migration is required.
   */
  severity?: 'bug' | 'question' | 'polish';
  status?: 'open' | 'verified';
  journeyRef?: QaJourneyRef;
  context?: QaNoteContext;
};

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export type QaNoticeTone = 'info' | 'success' | 'error';

export type QaNotice = {
  id: string;
  message: string;
  tone: QaNoticeTone;
  action?: { label: string; onAction: () => void };
  duration: number;
};

type QaNotifyOpts = {
  tone?: QaNoticeTone;
  action?: { label: string; onAction: () => void };
  duration?: number;
  id?: string;
};

// ---------------------------------------------------------------------------
// Test-along
// ---------------------------------------------------------------------------

export type QaTestAlongStep = {
  key: string;
  laneId: string;
  laneRole: string;
  color: string;
  path: string;
  what: QaBilingual;
  expect?: QaBilingual;
  risk: 'red' | 'amber' | 'green';
};

// ---------------------------------------------------------------------------
// Context value shape (CONTRACT for the component agent)
// ---------------------------------------------------------------------------

export type QaContextValue = {
  // Data
  notes: QaNote[];
  guideChecked: Set<string>;
  guideFailed: Set<string>;
  loginsUsed: Set<string>;

  // UI state
  isOpen: boolean;
  activeTab: 'notes' | 'logins' | 'guide';
  captureActive: boolean;
  isExporting: boolean;
  notesLoading: boolean;

  // i18n
  lang: string;
  dir: 'ltr' | 'rtl';

  // Config passthrough (from ResolvedConfig) — NOTE: `theme` intentionally
  // absent. Graphite ships one fixed design; components must not read colour
  // tokens from context.
  namespace: string;
  brand: { label: string };
  loginField: { en: string; ar?: string };
  credentials: QaCredential[];
  journey: QaJourneyLane[];
  preamble: QaPreamble | null;

  // i18n helpers
  t: (key: string, vars?: Record<string, string | number>) => string;
  pick: (value: QaBilingual | null | undefined) => string;

  // Notices
  notices: QaNotice[];
  notify: (message: string, opts?: QaNotifyOpts) => string;
  dismissNotice: (id: string) => void;

  // Actions — UI
  setIsOpen: (open: boolean) => void;
  setActiveTab: (tab: 'notes' | 'logins' | 'guide') => void;
  setLang: (lang: string) => void;

  // Actions — notes
  addNote: (input: {
    description: string;
    screenshot?: Blob;
    target?: QaTarget;
    severity?: 'bug' | 'question' | 'polish';
    status?: 'open' | 'verified';
    forensics?: QaTargetForensics;
  }) => Promise<void>;
  /**
   * Patch a note. `screenshot: null` removes the screenshot (sets to undefined).
   * `screenshot: Blob` replaces it. `screenshot: undefined` (or omitted) leaves it unchanged.
   */
  updateNote: (
    id: string,
    patch: {
      description?: string;
      screenshot?: Blob | null;
      severity?: 'bug' | 'question' | 'polish';
      status?: 'open' | 'verified';
    },
  ) => Promise<void>;
  /** Soft-delete: removed from state now, IDB write committed 5s later unless undone. */
  deleteNote: (id: string) => Promise<void>;
  /** Soft-clear: same snapshot + delayed-commit + Undo pattern as deleteNote. */
  clearNotes: () => Promise<void>;

  // Actions — capture mode
  startCapture: () => void;
  endCapture: (reopen?: boolean) => void;

  // Actions — guide + logins
  toggleGuide: (key: string) => void;
  toggleLogin: (key: string) => void;

  // Test-along
  testAlong: { active: boolean; index: number };
  testAlongSteps: QaTestAlongStep[];
  startTestAlong: () => void;
  exitTestAlong: () => void;
  gotoStep: (index: number) => void;
  gradeStep: (key: string, grade: 'pass' | 'fail') => void;
  evidenceByStep: Map<string, QaNote[]>;

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
const LANG_KEY         = 'lang';
const GUIDE_KEY        = 'guide';
const GUIDE_FAILED_KEY = 'guideFailed';
const LOGIN_KEY        = 'logins';

// Notice queue rules (contract §5).
const NOTICE_QUEUE_CAP     = 3;
const NOTICE_DURATION_INFO  = 4000;
const NOTICE_DURATION_ERROR = 6000;
// Soft-delete / soft-clear undo window (deleteNote, clearNotes).
const SOFT_DELETE_MS = 5000;

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
  const [notesLoading, setNotesLoading] = useState(true);

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

  // ── Test-along fail flags (mirrors guideChecked's persistence exactly) ───
  const [guideFailed, setGuideFailed] = useState<Set<string>>(
    () => new Set<string>(storage.getJSON<string[]>(GUIDE_FAILED_KEY, [])),
  );

  // ── Logins used ───────────────────────────────────────────────────────────
  const [loginsUsed, setLoginsUsed] = useState<Set<string>>(
    () => new Set<string>(storage.getJSON<string[]>(LOGIN_KEY, [])),
  );

  // ── Notices ──────────────────────────────────────────────────────────────
  const [notices, setNotices] = useState<QaNotice[]>([]);
  // Timers keyed by notice id, so an explicit id can clear + replace both the
  // visible notice AND its pending auto-dismiss.
  const noticeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Test-along state ─────────────────────────────────────────────────────
  const [testAlong, setTestAlong] = useState<{ active: boolean; index: number }>({
    active: false,
    index: 0,
  });

  // ── Pending soft-delete / soft-clear (undo window) ──────────────────────
  const pendingDeletes = useRef<Map<string, { note: QaNote; index: number; timer: ReturnType<typeof setTimeout> }>>(
    new Map(),
  );
  const pendingClear = useRef<{ notes: QaNote[]; timer: ReturnType<typeof setTimeout> } | null>(null);

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
      .catch(() => {})
      .finally(() => {
        // Settle notesLoading on BOTH success and failure — otherwise a
        // broken IDB open leaves NoteList showing skeletons forever.
        if (alive) setNotesLoading(false);
      });
    return () => { alive = false; };
  }, [idb]);

  // ── Actions — i18n ───────────────────────────────────────────────────────

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

  // ── Actions — notices ────────────────────────────────────────────────────

  const dismissNotice = useCallback((id: string) => {
    const timer = noticeTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      noticeTimers.current.delete(id);
    }
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback((message: string, opts?: QaNotifyOpts): string => {
    const tone = opts?.tone ?? 'info';
    const id = opts?.id ?? uid();
    const duration = opts?.duration ?? (tone === 'error' ? NOTICE_DURATION_ERROR : NOTICE_DURATION_INFO);

    // An explicit id REPLACES any existing notice + timer with that id, so a
    // repeated action (e.g. double-clicking "Copy") can't stack duplicates.
    const existingTimer = noticeTimers.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);

    const notice: QaNotice = { id, message, tone, action: opts?.action, duration };

    setNotices((prev) => {
      const deduped = prev.filter((n) => n.id !== id);
      const next = [...deduped, notice];
      if (next.length <= NOTICE_QUEUE_CAP) return next;
      // Queue cap: drop the oldest entries (front of the array) first, and
      // clear their timers so they don't fire against a notice no longer shown.
      const overflow = next.length - NOTICE_QUEUE_CAP;
      for (const dropped of next.slice(0, overflow)) {
        const droppedTimer = noticeTimers.current.get(dropped.id);
        if (droppedTimer) {
          clearTimeout(droppedTimer);
          noticeTimers.current.delete(dropped.id);
        }
      }
      return next.slice(overflow);
    });

    const timer = setTimeout(() => {
      noticeTimers.current.delete(id);
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, duration);
    noticeTimers.current.set(id, timer);

    return id;
  }, []);

  // ── Actions — test-along (declared early: addNote's journeyRef resolution
  // needs `testAlong` + `testAlongSteps`) ──────────────────────────────────

  const testAlongSteps = useMemo<QaTestAlongStep[]>(() => {
    const out: QaTestAlongStep[] = [];
    for (const lane of journeyOrEmpty(config.journey)) {
      const laneRole = pick(lane.role);
      const color = lane.color ?? 'var(--qa-accent)';
      for (const step of lane.steps ?? []) {
        out.push({
          key: `${lane.id}::${step.path}`,
          laneId: lane.id,
          laneRole,
          color,
          path: step.path,
          what: step.what,
          expect: step.expect,
          risk: step.risk ?? 'green',
        });
      }
    }
    return out;
  }, [config.journey, pick]);

  const startTestAlong = useCallback(() => {
    setTestAlong({ active: true, index: 0 });
    setIsOpen(false);
  }, []);

  const exitTestAlong = useCallback(() => {
    setTestAlong({ active: false, index: 0 });
  }, []);

  const gotoStep = useCallback((index: number) => {
    setTestAlong((prev) => {
      if (!prev.active) return prev;
      const maxIndex = Math.max(0, testAlongSteps.length - 1);
      const clamped = Math.max(0, Math.min(index, maxIndex));
      if (clamped === prev.index) return prev;
      return { ...prev, index: clamped };
    });
  }, [testAlongSteps.length]);

  const gradeStep = useCallback((key: string, grade: 'pass' | 'fail') => {
    if (grade === 'pass') {
      setGuideChecked((prev) => {
        const next = new Set(prev);
        next.add(key);
        storage.setJSON(GUIDE_KEY, [...next]);
        return next;
      });
      setGuideFailed((prev) => {
        const next = new Set(prev);
        next.delete(key);
        storage.setJSON(GUIDE_FAILED_KEY, [...next]);
        return next;
      });
    } else {
      setGuideFailed((prev) => {
        const next = new Set(prev);
        next.add(key);
        storage.setJSON(GUIDE_FAILED_KEY, [...next]);
        return next;
      });
      setGuideChecked((prev) => {
        const next = new Set(prev);
        next.delete(key);
        storage.setJSON(GUIDE_KEY, [...next]);
        return next;
      });
    }
  }, [storage]);

  const evidenceByStep = useMemo<Map<string, QaNote[]>>(() => {
    const map = new Map<string, QaNote[]>();
    // `notes` is stored newest-first; walk it back-to-front so each step's
    // array comes out oldest→newest, per contract.
    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];
      const ref = note.journeyRef;
      if (!ref) continue;
      const key = `${ref.laneId}::${ref.path}`;
      const arr = map.get(key);
      if (arr) arr.push(note); else map.set(key, [note]);
    }
    return map;
  }, [notes]);

  // ── Actions — notes ──────────────────────────────────────────────────────

  const addNote = useCallback(
    async (input: {
      description: string;
      screenshot?: Blob;
      target?: QaTarget;
      severity?: 'bug' | 'question' | 'polish';
      status?: 'open' | 'verified';
      forensics?: QaTargetForensics;
    }): Promise<void> => {
      const loc = safeLocation();
      const route = loc.pathname + loc.search;

      // journeyRef: current test-along step, else the first matching journey
      // step for this route, else undefined.
      let journeyRef: QaJourneyRef | undefined;
      if (testAlong.active) {
        const step = testAlongSteps[testAlong.index];
        if (step) journeyRef = { laneId: step.laneId, path: step.path };
      } else {
        const hits = matchRouteToSteps(config.journey, route);
        if (hits.length) journeyRef = hits[0];
      }

      // context: runtime evidence (console/network/error ring + env snapshot
      // + whatever forensics CaptureMode already collected for the target).
      let context: QaNoteContext | undefined;
      if (config.captureContext !== false) {
        context = {
          events: drainSinceLastNote(),
          env: collectEnvSnapshot(route),
          forensics: input.forensics,
        };
      }

      const note: QaNote = {
        id: uid(),
        url: loc.href,
        route,
        timestamp: nowIso(),
        description: (input.description || '').trim(),
        screenshot: input.screenshot ?? undefined,
        target: input.target ?? undefined,
        severity: input.severity,
        status: input.status,
        journeyRef,
        context,
      };

      setNotes((prev) => [note, ...prev]);
      const persisted = await idb.put(note);
      if (!persisted) {
        notify(t('persist_failed'), { tone: 'error', id: 'persist_failed' });
      }
    },
    [idb, config.journey, config.captureContext, testAlong, testAlongSteps, notify, t],
  );

  const updateNote = useCallback(
    async (
      id: string,
      patch: {
        description?: string;
        screenshot?: Blob | null;
        severity?: 'bug' | 'question' | 'polish';
        status?: 'open' | 'verified';
      },
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
          if (patch.severity !== undefined) next.severity = patch.severity;
          if (patch.status !== undefined) next.status = patch.status;
          updated = next;
          return next;
        }),
      );
      if (updated) {
        const persisted = await idb.put(updated);
        if (!persisted) {
          notify(t('persist_failed'), { tone: 'error', id: 'persist_failed' });
        }
      }
    },
    [idb, notify, t],
  );

  /**
   * Soft-delete: the note disappears from state (and thus the UI) right away,
   * but the real idb.delete() is deferred SOFT_DELETE_MS so the Undo action on
   * the toast can restore it at its original index. A tab closed mid-window
   * is handled by the beforeunload/unmount flush effect below.
   */
  const deleteNote = useCallback(async (id: string): Promise<void> => {
    let removedNote: QaNote | null = null;
    let removedIndex = -1;
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.id === id);
      if (idx === -1) return prev;
      removedIndex = idx;
      removedNote = prev[idx];
      return prev.filter((n) => n.id !== id);
    });
    if (!removedNote || removedIndex === -1) return;

    const noteToRestore = removedNote;
    const indexToRestore = removedIndex;

    const existingPending = pendingDeletes.current.get(id);
    if (existingPending) clearTimeout(existingPending.timer);

    const timer = setTimeout(() => {
      pendingDeletes.current.delete(id);
      void idb.delete(id);
    }, SOFT_DELETE_MS);
    pendingDeletes.current.set(id, { note: noteToRestore, index: indexToRestore, timer });

    notify(t('note_deleted'), {
      duration: SOFT_DELETE_MS,
      id: `delete-${id}`,
      action: {
        label: t('undo'),
        onAction: () => {
          const pending = pendingDeletes.current.get(id);
          if (!pending) return; // window already elapsed, or already flushed
          clearTimeout(pending.timer);
          pendingDeletes.current.delete(id);
          setNotes((prev) => {
            if (prev.some((n) => n.id === id)) return prev; // already back
            const next = prev.slice();
            next.splice(Math.min(pending.index, next.length), 0, pending.note);
            return next;
          });
        },
      },
    });
  }, [idb, notify, t]);

  /** Soft-clear: same snapshot + delayed-commit + Undo pattern as deleteNote. */
  const clearNotes = useCallback(async (): Promise<void> => {
    let snapshot: QaNote[] = [];
    setNotes((prev) => {
      snapshot = prev;
      return [];
    });

    // A full clear supersedes any in-flight single-note soft-deletes: cancel
    // their timers and dismiss their Undo toasts (their notes are already
    // gone from `notes`, so they're included in `snapshot` above).
    if (pendingClear.current) clearTimeout(pendingClear.current.timer);
    for (const [pendingId, pending] of pendingDeletes.current) {
      clearTimeout(pending.timer);
      dismissNotice(`delete-${pendingId}`);
    }
    pendingDeletes.current.clear();

    const timer = setTimeout(() => {
      pendingClear.current = null;
      void idb.clear();
    }, SOFT_DELETE_MS);
    pendingClear.current = { notes: snapshot, timer };

    notify(t('notes_cleared'), {
      duration: SOFT_DELETE_MS,
      id: 'clear-all',
      action: {
        label: t('undo'),
        onAction: () => {
          const pending = pendingClear.current;
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingClear.current = null;
          setNotes(pending.notes);
        },
      },
    });
  }, [idb, notify, dismissNotice, t]);

  /**
   * Commit every pending soft-delete/clear for real, right now. Called on
   * beforeunload AND provider-unmount so closing the tab (or the host
   * unmounting the widget) mid-undo-window can't silently resurrect a note
   * the tester believed was gone.
   */
  const flushPendingDeletes = useCallback(() => {
    for (const [pendingId, pending] of pendingDeletes.current) {
      clearTimeout(pending.timer);
      void idb.delete(pendingId);
    }
    pendingDeletes.current.clear();
    if (pendingClear.current) {
      clearTimeout(pendingClear.current.timer);
      pendingClear.current = null;
      void idb.clear();
    }
  }, [idb]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onBeforeUnload = () => flushPendingDeletes();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      flushPendingDeletes();
      // Belt-and-suspenders: also stop any still-pending notice auto-dismiss
      // timers so they never fire a setState after unmount.
      for (const timer of noticeTimers.current.values()) clearTimeout(timer);
      noticeTimers.current.clear();
    };
  }, [flushPendingDeletes]);

  // ── Actions — capture mode ───────────────────────────────────────────────

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
        // can render credentials, journey coverage, and preamble fields.
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
    guideFailed,
    loginsUsed,

    // UI state
    isOpen,
    activeTab,
    captureActive,
    isExporting,
    notesLoading,

    // i18n
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',

    // Config passthrough
    namespace:   config.namespace,
    brand:       config.brand,
    loginField:  config.loginField,
    credentials: config.credentials,
    journey:     config.journey,
    preamble:    config.preamble,

    // i18n helpers
    t,
    pick,

    // Notices
    notices,
    notify,
    dismissNotice,

    // Actions
    setIsOpen,
    setActiveTab,
    setLang,
    addNote,
    updateNote,
    deleteNote,
    clearNotes,
    startCapture,
    endCapture,
    toggleGuide,
    toggleLogin,

    // Test-along
    testAlong,
    testAlongSteps,
    startTestAlong,
    exitTestAlong,
    gotoStep,
    gradeStep,
    evidenceByStep,

    exportZip: exportZipFn,
  };

  return <QaContext.Provider value={value}>{children}</QaContext.Provider>;
}

/** Defensive normalizer — never trust an external config array is non-null. */
function journeyOrEmpty(journey: QaJourneyLane[] | null | undefined): QaJourneyLane[] {
  return Array.isArray(journey) ? journey : [];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useQa(): QaContextValue {
  const ctx = useContext(QaContext);
  if (!ctx) throw new Error('useQa must be used inside <QaProvider>');
  return ctx;
}
