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
 *    `beforeunload` + unmount flush attempts that commit immediately if the
 *    tab closes mid-window — but per the IndexedDB/HTML spec, async work
 *    kicked off inside `beforeunload` has NO guarantee of finishing before
 *    the page is torn down, so that flush alone can't be trusted to land.
 *    The actual guarantee comes from a second, durable mechanism: the
 *    instant a note enters its undo window, its id is written to
 *    `pendingDeleteIds` in localStorage — a genuinely *synchronous* write,
 *    unlike IDB — and on the NEXT load any id still listed there is
 *    re-deleted and filtered out of the initial view before the tester ever
 *    sees it, regardless of whether the original IDB transaction ever
 *    completed. (This assumes localStorage itself is reachable; in the rare
 *    environments where it isn't, `createStorage` already degrades to an
 *    in-memory fallback everywhere else in this file, and this
 *    reconciliation degrades along with it.)
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
import { drainSinceLastNote, readRecentSteps, collectEnvSnapshot, redactUrl, onIssue, type QaIssue, type QaNoteContext, type QaTargetForensics } from '../lib/contextBuffer';
import { createStorage } from '../lib/storage';
import { createIdb } from '../lib/idb';
import { translate, pick as pickFn } from '../lib/strings';
import { buildAndDownloadZip, buildZipBlob, exportFileName } from '../lib/exportZip';
import { canShareFiles, shareZipFile, type ShareOutcome } from '../lib/shareZip';
import { captureRegion } from '../lib/capture';
import {
  getExactCaptureStatus,
  isExactCaptureSupported,
  resetExactCaptureDecline,
  startExactCapture,
  stopExactCapture,
  type ExactCaptureStatus,
} from '../lib/screenCapture';
import {
  chooseFsSyncRoot,
  closeFsCampaign,
  defaultCampaignName,
  disconnectFsSync,
  getFsSyncCampaign,
  getFsSyncError,
  getFsSyncPath,
  getFsSyncState,
  isFsSyncSupported,
  onFsSyncChange,
  openFsCampaign,
  reconnectFsSync,
  removeNoteFromDisk,
  restoreFsSync,
  syncAllToDisk,
  syncNoteToDisk,
  type FsCampaign,
  type FsSyncState,
} from '../lib/fsSync';
import {
  EMPTY_STORAGE_HEALTH,
  estimateOwnBytes,
  readStorageHealth,
  requestPersistentStorage,
  type StorageHealth,
} from '../lib/storageHealth';

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
  /**
   * Where this finding is in its life.
   *
   * v0.5 added `fixed`, the missing middle: someone says they've fixed it,
   * but nobody has re-checked. Without that state a tester coming back to a
   * patched build has no idea what to look at — the whole list still reads
   * "open", so re-testing is guesswork and things quietly ship unverified.
   * `fixed` IS the re-test queue.
   */
  status?: 'open' | 'fixed' | 'verified';
  journeyRef?: QaJourneyRef;
  context?: QaNoteContext;
  /**
   * v0.5 — proof of a re-test. When a note in the `fixed` state is re-checked,
   * Qapture re-shoots the same target and stores the new image here, beside
   * the original. "Is it actually fixed?" stops being a memory exercise: the
   * before and after sit next to each other in the note, the export and the
   * folder report.
   */
  afterScreenshot?: Blob;
  afterAt?: string;
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
// v0.4 — note filtering
// ---------------------------------------------------------------------------

export type QaSeverityFilter = 'all' | 'bug' | 'question' | 'polish';
export type QaStatusFilter = 'all' | 'open' | 'fixed' | 'verified';

export type QaNoteFilter = {
  severity: QaSeverityFilter;
  status: QaStatusFilter;
  /** Free-text match over description, route and selector. */
  query: string;
  /** Limit to notes captured on the page the tester is looking at now. */
  thisPageOnly: boolean;
};

export type QaNoteCounts = {
  all: number;
  bug: number;
  question: number;
  polish: number;
  open: number;
  /** Marked fixed, awaiting a re-test. */
  fixed: number;
  verified: number;
  thisPage: number;
};

/** Everything the UI needs to describe the folder-sync feature. */
export type QaSyncInfo = {
  supported: boolean;
  state: FsSyncState;
  /** e.g. "QA/Project X/2026-08-14 smoke" */
  path: string;
  campaign: FsCampaign | null;
  error: string;
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
    status?: 'open' | 'fixed' | 'verified';
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
      status?: 'open' | 'fixed' | 'verified';
    },
  ) => Promise<void>;
  /** Soft-delete: removed from state now, IDB write committed 5s later unless undone. */
  deleteNote: (id: string) => Promise<void>;
  /** Soft-clear: same snapshot + delayed-commit + Undo pattern as deleteNote. */
  clearNotes: () => Promise<void>;

  // Actions — capture mode
  /** @param prefill - seed the annotation box (the error catcher uses this). */
  startCapture: (prefill?: string) => void;
  endCapture: (reopen?: boolean) => void;
  /** Text the annotation box should open with, consumed by CaptureMode. */
  capturePrefill: string;

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

  // ── v0.4: screenshot engine ──────────────────────────────────────────────
  /** Whether pixel-exact (real screen) capture is possible + its live state. */
  exactShots: { supported: boolean; status: ExactCaptureStatus };
  /** Ask for the one-time "share this tab" grant. MUST be called from a click. */
  enableExactShots: () => Promise<boolean>;
  /** Release the stream and go back to DOM rendering. */
  disableExactShots: () => void;

  // ── v0.4: live folder sync ───────────────────────────────────────────────
  sync: QaSyncInfo;
  /** Pick the QA folder. MUST be called from a click. */
  chooseSyncFolder: () => Promise<boolean>;
  /** Re-grant write access to the remembered folder. MUST be called from a click. */
  reconnectSyncFolder: () => Promise<boolean>;
  /** Open (or resume) a project/campaign folder and mirror existing notes into it. */
  startSyncCampaign: (input: { project: string; campaign: string; tester?: string }) => Promise<boolean>;
  /** Stop writing to the current campaign. The folder stays on disk. */
  stopSyncCampaign: () => void;
  /** Forget the folder entirely. Nothing on disk is deleted. */
  forgetSyncFolder: () => Promise<void>;
  /** Suggested campaign name for the setup form. */
  suggestCampaignName: () => string;
  /** Last project/campaign used, for prefilling the setup form. */
  lastCampaign: { project: string; campaign: string; tester: string };

  // ── v0.4: storage health ─────────────────────────────────────────────────
  /** Origin-wide usage, plus the share Qapture itself is responsible for. */
  storageHealth: StorageHealth & { ownBytes: number };
  refreshStorageHealth: () => Promise<void>;
  /** Ask the browser to stop evicting this origin's data. */
  requestPersistentStorage: () => Promise<boolean>;
  /** Recovery: keep every note but drop its screenshot, freeing most of the space. */
  dropAllScreenshots: () => Promise<void>;
  /**
   * Download a backup ZIP automatically every few notes. On by default, and
   * only ever acts when folder saving isn't running — see the effect in the
   * provider for why this exists.
   */
  autoBackup: boolean;
  setAutoBackup: (on: boolean) => void;
  /** How many notes between automatic backups. */
  autoBackupEvery: number;

  // ── v0.5 ─────────────────────────────────────────────────────────────────
  /** Offer to capture crashes and failed requests the tester may not have seen. */
  errorCatcher: boolean;
  setErrorCatcher: (on: boolean) => void;
  /** Whether this browser can hand a file to the OS share sheet. */
  canShare: boolean;
  /** Build the ZIP and offer it to the share sheet. */
  shareExport: (filename?: string) => Promise<ShareOutcome>;
  /**
   * Set when a share was refused because the tap had gone stale — the archive
   * is built and waiting for one fresh tap. See shareZip.ts.
   */
  pendingShare: { blob: Blob; filename: string } | null;
  /** Share the already-built archive. MUST be called straight from a click. */
  sharePending: () => Promise<ShareOutcome>;
  /** Re-shoot a note's target now and store it as the "after" image. */
  retestNote: (id: string) => Promise<boolean>;
  /** True until the tester dismisses the first-run card. */
  showWelcome: boolean;
  dismissWelcome: () => void;

  // ── v0.4: note filtering + view modes ────────────────────────────────────
  filter: QaNoteFilter;
  setFilter: (patch: Partial<QaNoteFilter>) => void;
  /** `notes` after the active filter — what the list should render. */
  visibleNotes: QaNote[];
  noteCounts: QaNoteCounts;
  /** Hide Logins/Guide and the walkthrough — just capture, notes, export. */
  simpleMode: boolean;
  setSimpleMode: (on: boolean) => void;
  /** Capture with a small inline box instead of the full annotation card. */
  compactCapture: boolean;
  setCompactCapture: (on: boolean) => void;

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
const LANG_KEY          = 'lang';
const GUIDE_KEY         = 'guide';
const GUIDE_FAILED_KEY  = 'guideFailed';
const LOGIN_KEY         = 'logins';
// Durable marker for soft-deletes/clears that are mid-undo-window when the
// tab closes — see the "Soft-delete" note in the file header comment above.
const PENDING_DELETE_KEY = 'pendingDeleteIds';
// v0.4 keys
const EXACT_SHOTS_KEY   = 'exactShots';      // '1' once the tester opted in
const SIMPLE_MODE_KEY   = 'simpleMode';
const COMPACT_KEY       = 'compactCapture';
const LAST_CAMPAIGN_KEY = 'lastCampaign';    // {project, campaign, tester}
// v0.5
const AUTO_BACKUP_KEY   = 'autoBackup';      // '0' to opt out
const AUTO_BACKUP_AT_KEY = 'autoBackupAt';   // note count of the last backup
const ERROR_CATCHER_KEY = 'errorCatcher';    // '0' to opt out
const WELCOME_SEEN_KEY  = 'welcomeSeen';

// Notice queue rules (contract §5).
const NOTICE_QUEUE_CAP     = 3;
const NOTICE_DURATION_INFO  = 4000;
const NOTICE_DURATION_ERROR = 6000;
// Soft-delete / soft-clear undo window (deleteNote, clearNotes).
const SOFT_DELETE_MS = 5000;
/** Notes between automatic backup downloads (v0.5). */
const AUTO_BACKUP_EVERY = 5;
/**
 * Quiet period after an error prompt. Long enough that a page throwing in a
 * loop can't turn into a wall of toasts, short enough that a second, genuinely
 * different failure a minute later still gets offered.
 */
const ISSUE_PROMPT_COOLDOWN_MS = 45000;

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

  /**
   * A ref mirror of `notes`, and the single source of truth for every note
   * mutation below.
   *
   * WHY (v0.4, and a real bug fix): the 0.3.x actions read the pre-mutation
   * list by assigning to a local from INSIDE a `setNotes(prev => …)` updater
   * and then using that local on the very next line:
   *
   *     let removed = null;
   *     setNotes(prev => { removed = prev[idx]; return … });
   *     if (!removed) return;          // ← only works if the updater ran
   *
   * That only works because React sometimes *eagerly* evaluates an updater
   * inside `dispatchSetState` as a bail-out optimisation — and it only does
   * so when the fiber has no other pending update. Add any other state
   * update to the same provider in the same tick (v0.4 has several: storage
   * health, sync status) and React defers the updater instead, the local
   * stays null, and the action silently returns having done nothing. That is
   * exactly how a deleted note stopped being committed to IndexedDB: the
   * whole soft-delete — durable marker, timer, undo toast — was skipped.
   *
   * `applyNotes` removes the guesswork: it computes the next list from the
   * ref synchronously, stores it, and hands the same value to React. Callers
   * get the before/after lists as plain values with no ordering assumptions.
   */
  const notesRef = useRef<QaNote[]>([]);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  const applyNotes = useCallback((updater: (prev: QaNote[]) => QaNote[]): QaNote[] => {
    const next = updater(notesRef.current);
    notesRef.current = next;
    setNotes(next);
    return next;
  }, []);

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

  // ── v0.4: screenshot engine ──────────────────────────────────────────────
  // `exactStatus` is a mirror of screenCapture.ts's module state, bumped
  // whenever we touch it so React re-renders the toggle.
  const [exactStatus, setExactStatus] = useState<ExactCaptureStatus>(() => getExactCaptureStatus());
  const exactSupported = isExactCaptureSupported();

  // ── v0.4: folder sync ────────────────────────────────────────────────────
  const [syncState, setSyncState] = useState<FsSyncState>(() => getFsSyncState());
  const [syncTick, setSyncTick] = useState(0); // forces path/campaign re-read
  const [lastCampaign, setLastCampaign] = useState<{ project: string; campaign: string; tester: string }>(
    () => {
      const saved = storage.getJSON<{ project?: string; campaign?: string; tester?: string }>(
        LAST_CAMPAIGN_KEY, {},
      );
      return {
        project: saved.project ?? '',
        campaign: saved.campaign ?? '',
        tester: saved.tester ?? '',
      };
    },
  );
  // One notice per sync outage, not one per note.
  const syncErrorAnnounced = useRef(false);

  // ── v0.4: storage health ─────────────────────────────────────────────────
  const [storageStats, setStorageStats] = useState<StorageHealth>(EMPTY_STORAGE_HEALTH);
  // So the "storage is filling up" warning fires once per session, not on
  // every recalculation.
  const storageWarned = useRef(false);

  // ── v0.4: view modes + filtering ─────────────────────────────────────────
  const [simpleMode, setSimpleModeState] = useState<boolean>(
    () => storage.getItem(SIMPLE_MODE_KEY) === '1',
  );
  const [compactCapture, setCompactCaptureState] = useState<boolean>(
    () => storage.getItem(COMPACT_KEY) === '1',
  );
  // v0.5
  const [capturePrefill, setCapturePrefill] = useState('');
  const [errorCatcher, setErrorCatcherState] = useState<boolean>(
    () => storage.getItem(ERROR_CATCHER_KEY) !== '0',
  );
  const [pendingShare, setPendingShare] = useState<{ blob: Blob; filename: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(
    () => storage.getItem(WELCOME_SEEN_KEY) !== '1',
  );
  // One prompt per outage, not one per thrown error.
  const lastIssuePromptAt = useRef(0);
  const promptedIssues = useRef<Set<string>>(new Set());

  // v0.5: automatic backup for everyone who can't use folder saving.
  const [autoBackup, setAutoBackupState] = useState<boolean>(
    () => storage.getItem(AUTO_BACKUP_KEY) !== '0',
  );

  const [filter, setFilterState] = useState<QaNoteFilter>({
    severity: 'all',
    status: 'all',
    query: '',
    thisPageOnly: false,
  });

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
  // `afterId` anchors the restore to the note that sat immediately after the
  // deleted one (in newest-first order) at delete-time, rather than a raw
  // numeric index — an index captured at delete-time goes stale the moment
  // any other note is added/removed during the undo window, which can splice
  // the restored note into the wrong relative position. `afterId` is looked
  // up fresh (via findIndex) at undo-time; null means the deleted note was
  // the oldest (last in the array), so it restores back to the end.
  const pendingDeletes = useRef<Map<string, { note: QaNote; afterId: string | null; timer: ReturnType<typeof setTimeout> }>>(
    new Map(),
  );
  const pendingClear = useRef<{ notes: QaNote[]; timer: ReturnType<typeof setTimeout> } | null>(null);

  // ── Durable pending-delete marker (localStorage) ─────────────────────────
  // IndexedDB writes started from 'beforeunload' have no platform guarantee
  // of completing before the tab is torn down, so `flushPendingDeletes`
  // below cannot, by itself, promise a soft-deleted note stays gone. These
  // three helpers back that promise with a plain, SYNCHRONOUS localStorage
  // write instead: the moment a note enters its undo window its id lands
  // here, and it's only cleared once the real IDB delete is confirmed to
  // have completed. Anything still listed on the next load gets reconciled
  // (see the mount effect below) regardless of what happened to the
  // original transaction.
  const readPendingDeleteIds = useCallback((): Set<string> => {
    return new Set(storage.getJSON<string[]>(PENDING_DELETE_KEY, []));
  }, [storage]);

  const addPendingDeleteIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const current = readPendingDeleteIds();
    for (const id of ids) current.add(id);
    storage.setJSON(PENDING_DELETE_KEY, [...current]);
  }, [storage, readPendingDeleteIds]);

  const removePendingDeleteIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const current = readPendingDeleteIds();
    let changed = false;
    for (const id of ids) {
      if (current.delete(id)) changed = true;
    }
    if (changed) storage.setJSON(PENDING_DELETE_KEY, [...current]);
  }, [storage, readPendingDeleteIds]);

  // ── Load notes from IDB on mount ─────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    idb.getAll()
      .then((rows) => {
        if (!alive) return;
        let live = rows as QaNote[];

        // Reconcile deletes that were mid-undo-window when the tab last
        // closed. `pendingDeleteIds` was written synchronously the instant
        // each delete/clear started, so — unlike the beforeunload IDB
        // flush — it's guaranteed to have survived even if the tab was
        // torn down before the actual IDB transaction finished. Anything
        // still listed here means "the tester already dismissed this note
        // last session"; finish the delete now (a no-op if it already
        // landed) and strip it from the very first render so it never
        // flashes back into view.
        const pendingIds = storage.getJSON<string[]>(PENDING_DELETE_KEY, []);
        if (pendingIds.length > 0) {
          const pendingSet = new Set(pendingIds);
          live = live.filter((n) => !pendingSet.has(n.id));
          for (const id of pendingIds) void idb.delete(id);
          storage.setJSON(PENDING_DELETE_KEY, []);
        }

        const sorted = live.slice().sort((a, b) =>
          a.timestamp < b.timestamp ? 1 : -1,
        );
        applyNotes(() => sorted);
      })
      .catch(() => {})
      .finally(() => {
        // Settle notesLoading on BOTH success and failure — otherwise a
        // broken IDB open leaves NoteList showing skeletons forever.
        if (alive) setNotesLoading(false);
      });
    return () => { alive = false; };
  }, [idb, storage, applyNotes]);

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

  // ── v0.4: folder sync plumbing (declared early — addNote/updateNote below
  // write through it) ──────────────────────────────────────────────────────

  // Mirror fsSync's module state into React.
  useEffect(() => {
    const sync = () => {
      setSyncState(getFsSyncState());
      setSyncTick((n) => n + 1);
    };
    sync();
    return onFsSyncChange(sync);
  }, []);

  // Re-attach to a previously chosen folder, and resume the last campaign if
  // the browser still trusts us with it. This is what makes "close the laptop,
  // come back tomorrow" keep writing to the same campaign folder instead of
  // silently going back to browser-only storage.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const restored = await restoreFsSync(idb);
      if (!alive || restored !== 'connected') return;
      const saved = storage.getJSON<{ project?: string; campaign?: string; tester?: string }>(
        LAST_CAMPAIGN_KEY, {},
      );
      if (!saved.project || !saved.campaign) return;
      await openFsCampaign({
        project: saved.project,
        campaign: saved.campaign,
        tester: saved.tester,
      });
    })();
    return () => { alive = false; };
  }, [idb, storage]);

  /**
   * Write one note through to disk when a campaign is open.
   *
   * Failures are surfaced ONCE per outage (a broken permission would
   * otherwise fire a toast on every keystroke-triggered save) and never block
   * the note itself — IndexedDB has already accepted it by the time we get
   * here.
   */
  const syncNoteThrough = useCallback(async (note: QaNote): Promise<void> => {
    if (getFsSyncState() !== 'syncing') return;
    const ok = await syncNoteToDisk(note, notesRef.current);
    if (ok) {
      syncErrorAnnounced.current = false;
      return;
    }
    if (!syncErrorAnnounced.current) {
      syncErrorAnnounced.current = true;
      const reason = getFsSyncError();
      notify(
        reason === 'permission' ? t('sync_lost_permission') : t('sync_write_failed'),
        { tone: 'error', id: 'sync-failed' },
      );
    }
  }, [notify, t]);

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
      status?: 'open' | 'fixed' | 'verified';
      forensics?: QaTargetForensics;
    }): Promise<void> => {
      const loc = safeLocation();
      // Query strings routinely carry tokens/session ids (see redactUrl()'s
      // doc comment in contextBuffer.ts) and every note ships in an exported
      // ZIP handed to a third-party agent — so `route`/`url` get the exact
      // same redaction contextBuffer.ts already applies to every recorded
      // network/env URL, never the raw `location` value.
      const route = loc.pathname + (loc.search ? '?…' : '');

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
          // v0.5: the run-up. Not drained — two notes filed back to back are
          // usually about the same sequence, and both deserve it.
          steps: readRecentSteps(),
        };
      }

      const note: QaNote = {
        id: uid(),
        url: redactUrl(loc.href),
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

      applyNotes((prev) => [note, ...prev]);
      const persisted = await idb.put(note);
      if (!persisted) {
        // v0.4: say what actually happened and give a way out, instead of a
        // dead-end "storage full". See storageHealth.ts for what the browser
        // is really complaining about.
        notify(t('persist_failed'), {
          tone: 'error',
          id: 'persist_failed',
          duration: 10000,
          action: { label: t('export'), onAction: () => { void exportZipRef.current(); } },
        });
      }
      // Disk copy (when a campaign folder is open) — the note survives even
      // if this browser's storage is full or gets cleared.
      await syncNoteThrough(note);
    },
    [idb, config.journey, config.captureContext, testAlong, testAlongSteps, notify, t, syncNoteThrough, applyNotes],
  );

  const updateNote = useCallback(
    async (
      id: string,
      patch: {
        description?: string;
        screenshot?: Blob | null;
        severity?: 'bug' | 'question' | 'polish';
        status?: 'open' | 'fixed' | 'verified';
      },
    ): Promise<void> => {
      // Build the patched note from the ref (see applyNotes' doc comment) so
      // `updated` is a real value here rather than whatever a possibly-
      // deferred state updater happened to have assigned.
      const current = notesRef.current.find((n) => n.id === id);
      if (!current) return;

      const updated: QaNote = { ...current };
      // Normalize description trim.
      if (patch.description != null) updated.description = patch.description.trim();
      // screenshot: Blob → replace; null → remove; undefined → leave unchanged.
      if (patch.screenshot === null) {
        updated.screenshot = undefined;
      } else if (patch.screenshot !== undefined) {
        updated.screenshot = patch.screenshot;
      }
      if (patch.severity !== undefined) updated.severity = patch.severity;
      if (patch.status !== undefined) updated.status = patch.status;

      applyNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));

      const persisted = await idb.put(updated);
      if (!persisted) {
        notify(t('persist_failed'), { tone: 'error', id: 'persist_failed' });
      }
      await syncNoteThrough(updated);
    },
    [idb, notify, t, syncNoteThrough, applyNotes],
  );

  /**
   * Soft-delete: the note disappears from state (and thus the UI) right away,
   * but the real idb.delete() is deferred SOFT_DELETE_MS so the Undo action on
   * the toast can restore it. Restore position is anchored to the id of the
   * note that sat immediately after it (not a numeric index, which would go
   * stale if another note is added/removed during the undo window). The
   * beforeunload/unmount flush effect below makes a best-effort attempt to
   * commit early if the tab closes mid-window, but the actual guarantee that
   * the note stays gone comes from `pendingDeleteIds` (written synchronously
   * just below) plus the reconciliation pass in the mount effect above.
   */
  const deleteNote = useCallback(async (id: string): Promise<void> => {
    // Read the pre-delete list from the ref, not from inside a state updater
    // — see applyNotes' doc comment for why that was silently skipping the
    // entire soft-delete (marker, timer and undo toast) whenever any other
    // state update was already pending on this provider.
    const before = notesRef.current;
    const idx = before.findIndex((n) => n.id === id);
    if (idx === -1) return;

    const noteToRestore = before[idx];
    const afterIdToRestore = before[idx + 1]?.id ?? null;
    applyNotes((prev) => prev.filter((n) => n.id !== id));

    const existingPending = pendingDeletes.current.get(id);
    if (existingPending) clearTimeout(existingPending.timer);

    // Durable marker FIRST (synchronous), so it lands even if the tab closes
    // in the instant between this line and the setTimeout below.
    addPendingDeleteIds([id]);

    const timer = setTimeout(() => {
      pendingDeletes.current.delete(id);
      void idb.delete(id).then(() => removePendingDeleteIds([id]));
      // Mirror the delete to disk only once the undo window has really
      // elapsed — deleting the file up front and re-writing it on Undo would
      // churn the folder and briefly lose the tester's only durable copy.
      if (getFsSyncState() === 'syncing') void removeNoteFromDisk(id, notesRef.current);
    }, SOFT_DELETE_MS);
    pendingDeletes.current.set(id, { note: noteToRestore, afterId: afterIdToRestore, timer });

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
          removePendingDeleteIds([id]); // undone — no longer pending a delete
          applyNotes((prev) => {
            if (prev.some((n) => n.id === id)) return prev; // already back
            const next = prev.slice();
            // Re-resolve the anchor's CURRENT index at undo-time: if it's
            // still around, restore right before it; if it's gone (itself
            // deleted, or there was no "after" note to begin with), fall
            // back to the end of the list.
            const anchorIndex = pending.afterId != null
              ? next.findIndex((n) => n.id === pending.afterId)
              : -1;
            const insertAt = anchorIndex === -1 ? next.length : anchorIndex;
            next.splice(insertAt, 0, pending.note);
            return next;
          });
        },
      },
    });
  }, [idb, notify, t, addPendingDeleteIds, removePendingDeleteIds, applyNotes]);

  /** Soft-clear: same snapshot + delayed-commit + Undo pattern as deleteNote. */
  const clearNotes = useCallback(async (): Promise<void> => {
    // Same reason as deleteNote: the snapshot must be a real value here, not
    // one assigned by a state updater that may not have run yet.
    const snapshot: QaNote[] = notesRef.current;
    applyNotes(() => []);

    // A full clear supersedes any in-flight single-note soft-deletes: their
    // notes are already gone from `notes` (removed by their own deleteNote
    // call), so they're NOT in `snapshot` above and the clear's own
    // idb.delete-per-snapshot-id commit (below) will never touch them.
    // Cancelling their timer without acting would orphan them in IDB
    // (deleted from no in-memory tracking structure, but never actually
    // removed from the store) until a reload resurrects them. Since their
    // note is already invisible in the view and their individual Undo
    // affordance is being replaced by the clear's own Undo, commit their
    // real delete right now instead of leaving it to a timer that's being
    // cancelled.
    if (pendingClear.current) clearTimeout(pendingClear.current.timer);
    for (const [pendingId, pending] of pendingDeletes.current) {
      clearTimeout(pending.timer);
      dismissNotice(`delete-${pendingId}`);
      void idb.delete(pendingId).then(() => removePendingDeleteIds([pendingId]));
    }
    pendingDeletes.current.clear();

    // Durable marker FIRST (synchronous) — see deleteNote for why.
    const snapshotIds = snapshot.map((n) => n.id);
    addPendingDeleteIds(snapshotIds);

    const timer = setTimeout(() => {
      pendingClear.current = null;
      // Delete only the ids that were in THIS clear's snapshot — a blanket
      // idb.clear() would also wipe any note added to the store during the
      // undo window (e.g. via addNote()), which is unrelated data the
      // tester never asked to delete.
      void Promise.all(snapshot.map((n) => idb.delete(n.id))).then(() =>
        removePendingDeleteIds(snapshotIds),
      );
      if (getFsSyncState() === 'syncing') {
        void (async () => {
          for (const n of snapshot) await removeNoteFromDisk(n.id, notesRef.current);
        })();
      }
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
          removePendingDeleteIds(pending.notes.map((n) => n.id)); // undone
          applyNotes(() => pending.notes);
        },
      },
    });
  }, [idb, notify, dismissNotice, t, addPendingDeleteIds, removePendingDeleteIds, applyNotes]);

  /**
   * Commit every pending soft-delete/clear for real, right now. Called on
   * beforeunload AND provider-unmount as a best-effort attempt to land the
   * IDB write early. This is NOT itself the guarantee that a closed tab
   * can't resurrect a note — per spec, async work started inside
   * 'beforeunload' has no guarantee of completing before teardown. The
   * actual guarantee is `pendingDeleteIds` (see deleteNote/clearNotes)
   * plus the reconciliation pass in the mount effect above, which cleans up
   * anything this flush didn't manage to finish in time.
   */
  const flushPendingDeletes = useCallback(() => {
    for (const [pendingId, pending] of pendingDeletes.current) {
      clearTimeout(pending.timer);
      void idb.delete(pendingId).then(() => removePendingDeleteIds([pendingId]));
    }
    pendingDeletes.current.clear();
    if (pendingClear.current) {
      const { notes: clearedNotes } = pendingClear.current;
      clearTimeout(pendingClear.current.timer);
      pendingClear.current = null;
      // Same rationale as the deferred-commit branch in clearNotes(): only
      // delete the ids from this clear's snapshot, never the whole store.
      const clearedIds = clearedNotes.map((n) => n.id);
      void Promise.all(clearedNotes.map((n) => idb.delete(n.id))).then(() =>
        removePendingDeleteIds(clearedIds),
      );
    }
  }, [idb, removePendingDeleteIds]);

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
      // Release the tab-capture stream so the browser's "sharing" indicator
      // doesn't outlive the widget.
      stopExactCapture();
    };
  }, [flushPendingDeletes]);

  // ── Actions — capture mode ───────────────────────────────────────────────

  const startCapture = useCallback((prefill?: string) => {
    setIsOpen(false);
    setCapturePrefill(prefill ?? '');
    setCaptureActive(true);
    // Re-acquire the tab stream for a tester who already opted into exact
    // screenshots. This runs inside the click that started capture, which is
    // the transient activation getDisplayMedia requires — asking later, when
    // the selection is made, would be rejected.
    if (
      storage.getItem(EXACT_SHOTS_KEY) === '1' &&
      isExactCaptureSupported() &&
      getExactCaptureStatus() !== 'live'
    ) {
      resetExactCaptureDecline();
      void startExactCapture().then(() => setExactStatus(getExactCaptureStatus()));
    }
  }, [storage]);

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

  // Late-bound so addNote's "storage full → Export" toast can call the export
  // that is only defined above it.
  const exportZipRef = useRef<(filename?: string) => Promise<void>>(async () => {});
  useEffect(() => { exportZipRef.current = exportZipFn; }, [exportZipFn]);

  // ── v0.4: screenshot engine actions ──────────────────────────────────────

  const enableExactShots = useCallback(async (): Promise<boolean> => {
    resetExactCaptureDecline();
    const ok = await startExactCapture();
    setExactStatus(getExactCaptureStatus());
    storage.setItem(EXACT_SHOTS_KEY, ok ? '1' : '0');
    notify(ok ? t('exact_on') : t('exact_declined'), { tone: ok ? 'success' : 'info', id: 'exact-shots' });
    return ok;
  }, [storage, notify, t]);

  const disableExactShots = useCallback(() => {
    stopExactCapture();
    storage.setItem(EXACT_SHOTS_KEY, '0');
    setExactStatus(getExactCaptureStatus());
  }, [storage]);

  // ── v0.4: folder sync actions ────────────────────────────────────────────

  const rememberCampaign = useCallback((next: { project: string; campaign: string; tester: string }) => {
    setLastCampaign(next);
    storage.setJSON(LAST_CAMPAIGN_KEY, next);
  }, [storage]);

  const chooseSyncFolder = useCallback(async (): Promise<boolean> => {
    const ok = await chooseFsSyncRoot(idb);
    if (!ok && getFsSyncState() === 'error') {
      notify(t('sync_write_failed'), { tone: 'error', id: 'sync-failed' });
    }
    return ok;
  }, [idb, notify, t]);

  const reconnectSyncFolder = useCallback(async (): Promise<boolean> => {
    const ok = await reconnectFsSync();
    if (ok) {
      syncErrorAnnounced.current = false;
      const saved = lastCampaign;
      if (saved.project && saved.campaign) {
        await openFsCampaign({ project: saved.project, campaign: saved.campaign, tester: saved.tester });
      }
    }
    return ok;
  }, [lastCampaign]);

  const startSyncCampaign = useCallback(
    async (input: { project: string; campaign: string; tester?: string }): Promise<boolean> => {
      const opened = await openFsCampaign(input);
      if (!opened) {
        notify(
          getFsSyncState() === 'needs-permission' ? t('sync_lost_permission') : t('sync_write_failed'),
          { tone: 'error', id: 'sync-failed' },
        );
        return false;
      }
      rememberCampaign({
        project: input.project,
        campaign: input.campaign,
        tester: input.tester ?? '',
      });
      syncErrorAnnounced.current = false;
      // Mirror whatever is already in the browser so the folder is complete,
      // not just "everything from now on".
      const mirrored = await syncAllToDisk(notesRef.current);
      notify(mirrored ? t('sync_on', { path: getFsSyncPath() }) : t('sync_write_failed'), {
        tone: mirrored ? 'success' : 'error',
        id: 'sync-state',
      });
      return mirrored;
    },
    [notify, t, rememberCampaign],
  );

  const stopSyncCampaign = useCallback(() => {
    closeFsCampaign();
    notify(t('sync_paused'), { id: 'sync-state' });
  }, [notify, t]);

  const forgetSyncFolder = useCallback(async (): Promise<void> => {
    await disconnectFsSync(idb);
    storage.setJSON(LAST_CAMPAIGN_KEY, {});
    setLastCampaign({ project: '', campaign: '', tester: '' });
  }, [idb, storage]);

  const suggestCampaignName = useCallback(() => defaultCampaignName(), []);

  // ── v0.4: storage health ─────────────────────────────────────────────────

  const refreshStorageHealth = useCallback(async (): Promise<void> => {
    const health = await readStorageHealth();
    setStorageStats(health);
    if (health.level !== 'ok' && !storageWarned.current) {
      storageWarned.current = true;
      notify(t(health.level === 'critical' ? 'storage_critical' : 'storage_warn'), {
        tone: health.level === 'critical' ? 'error' : 'info',
        id: 'storage-health',
        duration: 8000,
        action: { label: t('export'), onAction: () => { void exportZipRef.current(); } },
      });
    }
  }, [notify, t]);

  // Recheck on mount and whenever the note count changes — cheap, and it's the
  // only moment the number could have moved.
  useEffect(() => {
    void refreshStorageHealth();
  }, [refreshStorageHealth, notes.length]);

  const requestPersist = useCallback(async (): Promise<boolean> => {
    const ok = await requestPersistentStorage();
    await refreshStorageHealth();
    notify(ok ? t('persist_granted') : t('persist_denied'), {
      tone: ok ? 'success' : 'info',
      id: 'persist-request',
    });
    return ok;
  }, [notify, t, refreshStorageHealth]);

  /**
   * Recovery valve for a tester who is out of space mid-session: keep every
   * note, drop every screenshot. Screenshots are ~99% of the footprint, so
   * this reliably buys room without losing a single finding — and when folder
   * sync is on, the images are already safe on disk.
   */
  const dropAllScreenshots = useCallback(async (): Promise<void> => {
    const stripped = notesRef.current
      .filter((n) => n.screenshot)
      .map((n) => ({ ...n, screenshot: undefined }));
    if (!stripped.length) return;
    applyNotes((prev) => prev.map((n) => (n.screenshot ? { ...n, screenshot: undefined } : n)));
    for (const note of stripped) await idb.put(note);
    await refreshStorageHealth();
    notify(t('screenshots_dropped', { n: stripped.length }), { id: 'drop-shots' });
  }, [idb, notify, t, refreshStorageHealth, applyNotes]);

  // ── v0.5: automatic backup ───────────────────────────────────

  const setAutoBackup = useCallback((on: boolean) => {
    setAutoBackupState(on);
    storage.setItem(AUTO_BACKUP_KEY, on ? '1' : '0');
  }, [storage]);

  /**
   * Drop a backup ZIP into the tester's Downloads folder every few notes.
   *
   * Folder saving (v0.4) solves "don't lose my session" properly, but it only
   * exists on Chromium desktop. A tester on Safari, Firefox or a phone was
   * still one closed tab away from losing everything, with "remember to hit
   * Export" as the only defence — and someone testing another person's beta
   * does not remember. This is the fallback that needs no permission and no
   * setup: a download every AUTO_BACKUP_EVERY notes, which browsers write
   * without prompting.
   *
   * Deliberately does NOT run while a campaign folder is live: that would be
   * two copies of the same session and a Downloads folder full of
   * near-identical ZIPs for no benefit.
   */
  useEffect(() => {
    if (!autoBackup) return;
    if (notes.length === 0 || isExporting) return;
    if (getFsSyncState() === 'syncing') return; // already on disk, continuously

    const lastAt = Number(storage.getItem(AUTO_BACKUP_AT_KEY) ?? '0') || 0;
    if (notes.length < lastAt + AUTO_BACKUP_EVERY) return;

    // Record the milestone BEFORE the async export, so a slow or failing
    // export can't retrigger this effect into a download loop.
    storage.setItem(AUTO_BACKUP_AT_KEY, String(notes.length));
    const stamp = nowIso().slice(0, 16).replace(/[:T]/g, '-');
    void exportZipRef.current(`qa-autosave-${stamp}-${notes.length}`).then(() => {
      notify(t('autosave_done', { n: notes.length }), { id: 'autosave', duration: 3000 });
    });
  }, [notes.length, autoBackup, isExporting, storage, notify, t]);

  // ── v0.4: view modes + filtering ─────────────────────────────────────────

  const setSimpleMode = useCallback((on: boolean) => {
    setSimpleModeState(on);
    storage.setItem(SIMPLE_MODE_KEY, on ? '1' : '0');
    // Simple mode hides the Logins/Guide tabs — don't strand the tester on a
    // tab that no longer exists.
    if (on) setActiveTab('notes');
  }, [storage]);

  const setCompactCapture = useCallback((on: boolean) => {
    setCompactCaptureState(on);
    storage.setItem(COMPACT_KEY, on ? '1' : '0');
  }, [storage]);

  const setFilter = useCallback((patch: Partial<QaNoteFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
  }, []);

  const currentRoute = safeLocation().pathname;

  const noteCounts = useMemo<QaNoteCounts>(() => {
    const counts: QaNoteCounts = {
      all: notes.length, bug: 0, question: 0, polish: 0, open: 0, fixed: 0, verified: 0, thisPage: 0,
    };
    for (const n of notes) {
      const sev = n.severity ?? 'bug';
      if (sev === 'bug') counts.bug++;
      else if (sev === 'question') counts.question++;
      else counts.polish++;
      const status = n.status ?? 'open';
      if (status === 'verified') counts.verified++;
      else if (status === 'fixed') counts.fixed++;
      else counts.open++;
      if (n.route.split('?')[0] === currentRoute) counts.thisPage++;
    }
    return counts;
  }, [notes, currentRoute]);

  const visibleNotes = useMemo<QaNote[]>(() => {
    const q = filter.query.trim().toLowerCase();
    return notes.filter((n) => {
      if (filter.severity !== 'all' && (n.severity ?? 'bug') !== filter.severity) return false;
      if (filter.status !== 'all' && (n.status ?? 'open') !== filter.status) return false;
      if (filter.thisPageOnly && n.route.split('?')[0] !== currentRoute) return false;
      if (!q) return true;
      const haystack = `${n.description} ${n.route} ${n.target?.selector ?? ''} ${n.target?.text ?? ''}`;
      return haystack.toLowerCase().includes(q);
    });
  }, [notes, filter, currentRoute]);

  // ── v0.5: error catcher ──────────────────────────────────────────────────

  const setErrorCatcher = useCallback((on: boolean) => {
    setErrorCatcherState(on);
    storage.setItem(ERROR_CATCHER_KEY, on ? '1' : '0');
  }, [storage]);

  /**
   * Offer to capture things that broke without the tester noticing.
   *
   * The context buffer has always seen every uncaught error and failed
   * request; until now it only attached them to notes the tester thought to
   * file. The most valuable bug is the one nobody reported because nobody
   * saw it — a crash behind a spinner, a 500 on a background save — so when
   * one happens we offer a one-tap capture with the error already written
   * into the note.
   *
   * Restraint is the whole design here. A prompt that fires on every console
   * line, or three times for one broken page, gets dismissed reflexively and
   * then ignored forever, so: only real breakage (see announce() in
   * contextBuffer.ts), never while the tester is already capturing, never the
   * same message twice, and at most one per cooldown.
   */
  useEffect(() => {
    if (!errorCatcher) return undefined;
    return onIssue((issue: QaIssue) => {
      if (captureActive) return;
      const now = Date.now();
      if (now - lastIssuePromptAt.current < ISSUE_PROMPT_COOLDOWN_MS) return;
      const key = issue.summary.slice(0, 120);
      if (promptedIssues.current.has(key)) return;

      lastIssuePromptAt.current = now;
      promptedIssues.current.add(key);

      const headline = issue.summary.length > 90 ? `${issue.summary.slice(0, 90)}…` : issue.summary;
      notify(t('issue_spotted'), {
        tone: 'error',
        id: 'issue-spotted',
        duration: 9000,
        action: {
          label: t('issue_capture'),
          // Seed the note with what actually broke, so the tester adds
          // context instead of transcribing an error message.
          onAction: () => startCapture(`${t('issue_prefill')}: ${headline}`),
        },
      });
    });
  }, [errorCatcher, captureActive, notify, t, startCapture]);

  // ── v0.5: sharing ────────────────────────────────────────────────────────

  const canShare = canShareFiles();

  const shareExport = useCallback(async (filename?: string): Promise<ShareOutcome> => {
    if (!notes.length) return { status: 'unsupported' };
    const stamp = nowIso();
    const name = exportFileName(filename, stamp);
    setIsExporting(true);
    try {
      const blob = await buildZipBlob(notes, stamp, config, guideChecked);
      if (!blob) return { status: 'unsupported' };
      const outcome = await shareZipFile(blob, name, config.brand.label);
      if (outcome.status === 'needs-gesture') {
        // Keep the built archive so one more tap can send it — see shareZip.ts.
        setPendingShare({ blob, filename: name });
      } else if (outcome.status === 'unsupported') {
        // Nothing to share with: fall back to the path that always works.
        await buildAndDownloadZip(notes, stamp, filename, config, guideChecked);
      }
      return outcome;
    } catch {
      return { status: 'unsupported' };
    } finally {
      setIsExporting(false);
    }
  }, [notes, config, guideChecked]);

  const sharePending = useCallback(async (): Promise<ShareOutcome> => {
    const pending = pendingShare;
    if (!pending) return { status: 'unsupported' };
    const outcome = await shareZipFile(pending.blob, pending.filename, config.brand.label);
    if (outcome.status !== 'needs-gesture') setPendingShare(null);
    return outcome;
  }, [pendingShare, config.brand.label]);

  // ── v0.5: re-test (before/after) ─────────────────────────────────────────

  /**
   * Re-shoot a note's target as it looks right now.
   *
   * The re-test queue tells a tester WHAT to check; this answers "is it
   * actually fixed?" with evidence instead of memory. The target is found the
   * same way "Locate on page" finds it — the stored CSS selector first, its
   * captured rectangle as a fallback — then captured and stored beside the
   * original.
   */
  const retestNote = useCallback(async (id: string): Promise<boolean> => {
    const note = notesRef.current.find((n) => n.id === id);
    if (!note || typeof document === 'undefined') return false;

    let rect: QaRect | null = null;
    const selector = note.target?.selector;
    if (selector) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          el.scrollIntoView({ block: 'center', inline: 'center' });
          // Let the scroll settle before measuring, or the shot lands where
          // the element WAS.
          await new Promise((r) => setTimeout(r, 350));
          const r = el.getBoundingClientRect();
          if (r.width >= 2 && r.height >= 2) {
            rect = { top: r.top, left: r.left, width: r.width, height: r.height };
          }
        }
      } catch {
        // An exotic/stale selector just falls through to the rect below.
      }
    }
    if (!rect && note.target?.rect) {
      // A region has no selector. Its rect was viewport-relative at capture
      // time, so re-anchor it against the scroll position we recorded then.
      const scroll = note.target.scroll ?? { x: 0, y: 0 };
      rect = {
        top: note.target.rect.top + scroll.y - window.scrollY,
        left: note.target.rect.left + scroll.x - window.scrollX,
        width: note.target.rect.width,
        height: note.target.rect.height,
      };
    }
    if (!rect) {
      notify(t('retest_not_found'), { tone: 'error', id: 'retest' });
      return false;
    }

    const outcome = await captureRegion(rect);
    if (outcome.status !== 'ok') {
      notify(t('retest_failed'), { tone: 'error', id: 'retest' });
      return false;
    }

    const updated: QaNote = {
      ...note,
      afterScreenshot: outcome.blob,
      afterAt: nowIso(),
    };
    applyNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
    const persisted = await idb.put(updated);
    if (!persisted) notify(t('persist_failed'), { tone: 'error', id: 'persist_failed' });
    await syncNoteThrough(updated);
    notify(t('retest_done'), { tone: 'success', id: 'retest' });
    return true;
  }, [idb, notify, t, applyNotes, syncNoteThrough]);

  // ── v0.5: first-run card ─────────────────────────────────────────────────

  const dismissWelcome = useCallback(() => {
    setShowWelcome(false);
    storage.setItem(WELCOME_SEEN_KEY, '1');
  }, [storage]);

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
    capturePrefill,
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

    // v0.4 — screenshots
    exactShots: { supported: exactSupported, status: exactStatus },
    enableExactShots,
    disableExactShots,

    // v0.4 — folder sync. syncTick is read here purely so this object is
    // rebuilt when fsSync's module state changes (path/campaign live outside
    // React).
    sync: {
      supported: isFsSyncSupported(),
      state: syncState,
      path: syncTick >= 0 ? getFsSyncPath() : '',
      campaign: getFsSyncCampaign(),
      error: getFsSyncError(),
    },
    chooseSyncFolder,
    reconnectSyncFolder,
    startSyncCampaign,
    stopSyncCampaign,
    forgetSyncFolder,
    suggestCampaignName,
    lastCampaign,

    // v0.4 — storage
    storageHealth: { ...storageStats, ownBytes: estimateOwnBytes(notes) },
    refreshStorageHealth,
    requestPersistentStorage: requestPersist,
    dropAllScreenshots,
    autoBackup,
    setAutoBackup,
    autoBackupEvery: AUTO_BACKUP_EVERY,

    // v0.5
    errorCatcher,
    setErrorCatcher,
    canShare,
    shareExport,
    pendingShare,
    sharePending,
    retestNote,
    showWelcome,
    dismissWelcome,

    // v0.4 — filtering + view modes
    filter,
    setFilter,
    visibleNotes,
    noteCounts,
    simpleMode,
    setSimpleMode,
    compactCapture,
    setCompactCapture,

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
