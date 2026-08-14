/**
 * QaPanel — the expanding panel (Notes | Logins | Guide). Brand-styled, with
 * enter/exit animations via CSS transitions driven by a useReducer state machine.
 *
 * Ported from QaPanel.jsx:
 *  - framer-motion / AnimatePresence removed → useReducer phase machine
 *    (hidden → entering → visible → exiting), driven by onTransitionEnd
 *  - layoutId tab indicator → absolutely-positioned bar repositioned with
 *    useLayoutEffect (offsetLeft/offsetWidth), guarded by ResizeObserver
 *  - useLanguage / isRTL host import removed → useQa().dir
 *  - BRAND, THEME imports removed → useQa() values
 *  - Tailwind classes → qa-* equivalents
 *  - Tab key changed 'creds' → 'logins' to match QaContext type
 *
 * v0.3 "Graphite" (this file):
 *  - `theme` is gone from QaContextValue — every inline `theme.primary` /
 *    `theme.accent` / `theme.surface` / `theme.cream` colour has been
 *    replaced by a Graphite design token or semantic utility class
 *    (`qa-bg-1`, `qa-bg-0`, `qa-text-hi`, `qa-border-subtle`, `var(--qa-*)`…).
 *  - Header restyled to a flat `qa-bg-1` strip (the old diagonal
 *    primary→accent gradient is gone) with a minimal wordmark: a 6px accent
 *    square + a 13px/600 sans-serif label (the old Cormorant Garamond serif
 *    styling is gone — the whole widget now uses one font stack for every
 *    language, per the design tokens).
 *  - A global capture icon button (Crosshair) sits in the header next to
 *    Export, calling `startCapture()` directly from the panel chrome instead
 *    of only from the Notes tab's primary CTA.
 *  - Export-name dialog: clicking the scrim backdrop dismisses it (the card
 *    itself stops that click from propagating), and a document-level Escape
 *    listener closes it while open — added only while `naming` is true and
 *    removed the moment it closes or the panel unmounts.
 *  - "Clear all" now calls the undo-capable `clearNotes()` (soft-clear with a
 *    5s Undo toast) instead of the old synchronous `clearAll`. The existing
 *    inline "Delete all N? Yes/No" confirm step is unchanged.
 */

import {
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import NoteEditor from './NoteEditor';
import NoteList from './NoteList';
import NoteFilterBar from './NoteFilterBar';
import SettingsSheet from './SettingsSheet';
import WelcomeCard from './WelcomeCard';
import CredentialsSection from './CredentialsSection';
import GuideSection from './GuideSection';
import { computeCoverage } from '../lib/coverage';
import { useCoarsePointer } from '../lib/coarse';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabKey = 'notes' | 'logins' | 'guide';

const TABS: { key: TabKey; labelKey: string; icon: 'StickyNote' | 'KeyRound' | 'Map' }[] = [
  { key: 'notes',  labelKey: 'tab_notes',  icon: 'StickyNote' },
  { key: 'logins', labelKey: 'tab_logins', icon: 'KeyRound'   },
  { key: 'guide',  labelKey: 'tab_guide',  icon: 'Map'        },
];

function todayName(): string {
  return `qa-notes-${new Date().toISOString().slice(0, 10)}`;
}

// ---------------------------------------------------------------------------
// Panel animation state machine
// ---------------------------------------------------------------------------

type PanelPhase = 'hidden' | 'entering' | 'visible' | 'exiting';

function panelReducer(
  state: PanelPhase,
  action: { type: 'open' | 'close' | 'done' },
): PanelPhase {
  switch (action.type) {
    case 'open':
      if (state === 'hidden' || state === 'exiting') return 'entering';
      return state;
    case 'close':
      if (state === 'visible' || state === 'entering') return 'exiting';
      return state;
    case 'done':
      if (state === 'entering') return 'visible';
      if (state === 'exiting')  return 'hidden';
      return state;
  }
}

// ---------------------------------------------------------------------------
// iOS keyboard-avoidance tuning (touch/coarse only — see effect in QaPanel)
// ---------------------------------------------------------------------------

const KEYBOARD_OVERLAP_THRESHOLD = 120; // px — spec: overlap > 120px ⇒ keyboard open
const KEYBOARD_LIFT_GAP = 12;           // px of breathing room above the keyboard
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image',
]);

// Mirrors `.qa-panel-anim`'s own transition (styles.ts) so that adding a
// `bottom` transition inline (for the keyboard-avoidance lift, below) doesn't
// clobber the existing opacity/transform enter/exit animation: an inline
// `transition` style fully *replaces* the class-based one for whichever
// properties it lists — it does not merge with it — so all three must be
// spelled out together here. Only ever applied on coarse pointers; desktop
// keeps the class-driven transition untouched (see keyboardLiftActive).
const PANEL_TRANSITION_WITH_LIFT =
  'opacity 200ms cubic-bezier(0.4,0,0.2,1), transform 200ms cubic-bezier(0.4,0,0.2,1), bottom 200ms cubic-bezier(0.4,0,0.2,1)';

// ---------------------------------------------------------------------------
// QaPanel
// ---------------------------------------------------------------------------

export default function QaPanel() {
  const {
    isOpen, activeTab, setActiveTab,
    notes, exportZip, isExporting, clearNotes,
    startCapture,
    t, lang, setLang, dir,
    brand,
    journey, guideChecked,
    simpleMode, sync, storageHealth, noteCounts, setFilter,
    showWelcome, canShare, shareExport, pendingShare, sharePending, notify,
    panelSide, setPanelSide, panelCollapsed, setPanelCollapsed,
  } = useQa();

  const [confirmClear, setConfirmClear] = useState(false);
  const [naming, setNaming]             = useState(false);
  const [filename, setFilename]         = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Panel animation ──────────────────────────────────────────────────────
  const [phase, dispatch] = useReducer(panelReducer, 'hidden');
  // `showIn` controls the qa-panel-in CSS class (triggers the transition)
  const [showIn, setShowIn] = useState(false);

  // Sync isOpen → phase
  useEffect(() => {
    if (isOpen) dispatch({ type: 'open' });
    else        dispatch({ type: 'close' });
  }, [isOpen]);

  // Drive the CSS transition class from phase
  useEffect(() => {
    if (phase === 'entering') {
      // Next frame: apply "in" class so the browser sees the transition from
      // opacity:0/translate(16px) → opacity:1/translate(0).
      const id = requestAnimationFrame(() => setShowIn(true));
      return () => cancelAnimationFrame(id);
    }
    if (phase === 'exiting') {
      setShowIn(false); // remove "in" class → transition fires → transitionEnd → hidden
    }
    if (phase === 'hidden') {
      setShowIn(false);
      // QaPanel never unmounts (it just renders null while hidden), so
      // ephemeral dialog state would otherwise survive a close/reopen cycle
      // and resurface a stale dialog instead of the expected tab content.
      setNaming(false);
      setConfirmClear(false);
      setSettingsOpen(false);
    }
    if (phase === 'visible') {
      setShowIn(true); // keep it showing
    }
    return undefined;
  }, [phase]);

  const handleTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    // Ignore transitionEnd bubbling up from child elements (e.g. progress bars,
    // tab indicator). We only care about the panel's own opacity transition.
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== 'opacity') return; // only need one of the two transitions
    dispatch({ type: 'done' });
  }, []);

  // ── iPad-landscape side-sheet detection (gated, defensive) ───────────────
  // Coarse pointer + wide viewport + landscape ⇒ dock as a full-height right
  // sheet instead of the floating bottom-left popover. SSR-safe: guards
  // typeof window / matchMedia and defaults to "not matching" (normal
  // popover) whenever detection is unavailable or uncertain.
  const [isIpadLandscape, setIsIpadLandscape] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(
      '(pointer: coarse) and (min-width: 768px) and (orientation: landscape)',
    );
    setIsIpadLandscape(mql.matches);

    const handleChange = (e: MediaQueryListEvent) => setIsIpadLandscape(e.matches);
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handleChange);
      return () => mql.removeEventListener('change', handleChange);
    }
    // Older Safari fallback
    mql.addListener(handleChange);
    return () => mql.removeListener(handleChange);
  }, []);

  // ── iOS on-screen-keyboard avoidance (coarse/touch only, defensive) ──────
  // iOS Safari shrinks `window.visualViewport` (not window.innerHeight) when
  // the on-screen keyboard opens. When a text input/textarea *inside this
  // panel* is focused and the keyboard overlaps it, lift the panel's bottom
  // offset just enough to clear the keyboard; revert the moment the keyboard
  // closes or focus leaves the panel. No-op on desktop (gated by
  // useCoarsePointer), no-op whenever visualViewport is unavailable, and
  // no-op in the iPad-landscape side-sheet (already full-height — there's
  // nothing to clear).
  const coarse = useCoarsePointer();
  const panelRef = useRef<HTMLDivElement>(null);
  const [keyboardLift, setKeyboardLift] = useState(0);

  const computeKeyboardLift = useCallback((): number => {
    try {
      if (!coarse || isIpadLandscape) return 0;
      if (typeof window === 'undefined') return 0;
      const vv = window.visualViewport;
      if (!vv) return 0;

      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      if (overlap <= KEYBOARD_OVERLAP_THRESHOLD) return 0;

      const panel = panelRef.current;
      if (!panel) return 0;

      // Shadow-DOM-safe focus check: document.activeElement only reports the
      // shadow HOST when focus is inside a shadow tree, so ask the panel's
      // own root (the ShadowRoot in production) which of its descendants —
      // if any — is actually focused.
      const root = panel.getRootNode() as Document | ShadowRoot;
      const active = root.activeElement;
      if (!active || !panel.contains(active)) return 0;

      const tag = active.tagName;
      if (tag === 'TEXTAREA') return Math.round(overlap) + KEYBOARD_LIFT_GAP;
      if (tag === 'INPUT' && !NON_TEXT_INPUT_TYPES.has((active as HTMLInputElement).type)) {
        return Math.round(overlap) + KEYBOARD_LIFT_GAP;
      }
      return 0;
    } catch {
      return 0; // defensive: any unexpected DOM error ⇒ no lift, never a mispositioned panel
    }
  }, [coarse, isIpadLandscape]);

  useEffect(() => {
    if (!coarse) return undefined;
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const vv = window.visualViewport;
    if (!vv) return undefined;

    // Debounce only the "focus left" path: hopping focus between two fields
    // inside this same panel briefly has no active element in between, and
    // that blip shouldn't animate the panel down and back up.
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    const recompute = () => setKeyboardLift(computeKeyboardLift());
    const recomputeSoon = () => {
      if (closeTimer !== undefined) clearTimeout(closeTimer);
      closeTimer = setTimeout(recompute, 80);
    };

    recompute(); // sync immediately (e.g. re-mount while a field is already focused)
    vv.addEventListener('resize', recompute);
    vv.addEventListener('scroll', recompute);
    document.addEventListener('focusin', recompute);
    document.addEventListener('focusout', recomputeSoon);

    return () => {
      if (closeTimer !== undefined) clearTimeout(closeTimer);
      vv.removeEventListener('resize', recompute);
      vv.removeEventListener('scroll', recompute);
      document.removeEventListener('focusin', recompute);
      document.removeEventListener('focusout', recomputeSoon);
    };
  }, [coarse, computeKeyboardLift]);

  // Defensive belt-and-suspenders: collapse the instant the panel itself
  // closes, so a stray keyboard-open state can never linger and permanently
  // offset the panel the next time it opens.
  useEffect(() => {
    if (!isOpen) setKeyboardLift(0);
  }, [isOpen]);

  // ── Export-name dialog: Escape closes it while open ─────────────────────
  // Document-level (rather than an onKeyDown on the filename input alone) so
  // Escape works no matter what's focused inside the dialog. Attached only
  // while `naming` is true and removed the moment it closes (including via
  // the phase==='hidden' reset above) or this component unmounts.
  useEffect(() => {
    if (!naming) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNaming(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [naming]);

  // Re-derived at render time (rather than trusted straight from state) so a
  // lift can never apply on a non-coarse pointer or in the side-sheet even
  // for one stale frame (e.g. right after a mouse is attached).
  const keyboardLiftActive = coarse && !isIpadLandscape;
  const appliedKeyboardLift = keyboardLiftActive ? keyboardLift : 0;

  // Don't render at all when hidden
  if (phase === 'hidden') return null;

  // ── Naming dialog helpers ────────────────────────────────────────────────
  const openNaming = () => { setFilename(todayName()); setNaming(true); };
  const doExport   = () => { setNaming(false); void exportZip(filename); };

  /**
   * Share, with the two-tap fallback the Web Share API forces on us: if
   * building the ZIP outlives the browser's idea of "this came from a tap",
   * the archive is kept and a "Share now" button appears (see shareZip.ts).
   */
  const doShare = () => {
    setNaming(false);
    void shareExport(filename).then((outcome) => {
      if (outcome.status === 'needs-gesture') notify(t('share_ready'), { id: 'share' });
      else if (outcome.status === 'unsupported') notify(t('share_failed'), { tone: 'error', id: 'share' });
    });
  };

  // Soft gate: compute coverage only while the naming dialog is open.
  // computeCoverage is a pure, fast function so calling it on each render is fine.
  const namingCoverage = naming ? computeCoverage(journey, guideChecked) : null;

  // ── Tab indicator (rendered as a child of the tabs bar) ─────────────────
  // (handled by TabIndicator component below for cleaner ref management)

  // ── Bottom offset (RTL + safe-area, unchanged) with an additive keyboard
  // lift folded in. When appliedKeyboardLift is 0 (always true off-coarse,
  // keyboard closed, or focus elsewhere) this produces the exact original
  // calc() string byte-for-byte.
  const restBottomRem = dir === 'rtl' ? '9rem' : '8.75rem';
  const panelBottom = isIpadLandscape
    ? '0'
    : appliedKeyboardLift > 0
      ? `calc(${restBottomRem} + env(safe-area-inset-bottom) + ${appliedKeyboardLift}px)`
      : `calc(${restBottomRem} + env(safe-area-inset-bottom))`;

  return (
    <div
      ref={panelRef}
      data-qa-overlay="true"
      dir={dir}
      onTransitionEnd={handleTransitionEnd}
      className={`qa-fixed qa-flex qa-flex-col qa-overflow-hidden qa-rounded-2xl qa-border qa-border-subtle qa-elev-3 qa-print-hidden qa-w-panel qa-max-h-74vh qa-bg-1 qa-panel-anim${showIn ? ' qa-panel-in' : ''}`}
      style={{
        // Floating popover position (default). Fully overridden below when
        // docked as an iPad-landscape side-sheet. `panelSide` picks the edge
        // via logical properties, so "start" is the left in English and the
        // right in Arabic — the side nearest the tester's reading hand.
        insetInlineStart: isIpadLandscape
          ? 'auto'
          : panelSide === 'start' ? 'calc(1rem + env(safe-area-inset-left))' : 'auto',
        insetInlineEnd: isIpadLandscape
          ? '0'
          : panelSide === 'end' ? 'calc(1rem + env(safe-area-inset-right))' : 'auto',
        top: isIpadLandscape ? '0' : undefined,
        bottom: panelBottom,
        height: isIpadLandscape && !panelCollapsed ? '100dvh' : undefined,
        width: isIpadLandscape ? 'min(92vw, 420px)' : undefined,
        // qa-max-h-74vh (class) would otherwise cap the sheet well short of
        // full height — neutralize it only in the docked sheet variant.
        maxHeight: isIpadLandscape ? 'none' : undefined,
        borderRadius: isIpadLandscape ? 0 : undefined,
        zIndex: 'var(--qa-z-panel)',
        // Keyboard-avoidance lift (coarse/touch only — see effect above).
        // undefined ⇒ !keyboardLiftActive, so desktop and the iPad-landscape
        // side-sheet render this property exactly as before (the class's own
        // opacity/transform transition applies, untouched).
        transition: keyboardLiftActive ? PANEL_TRANSITION_WITH_LIFT : undefined,
      }}
    >
      {/* ── Header — flat qa-bg-1 strip, no gradient ────────────────────── */}
      <div className="qa-flex qa-items-center qa-gap-2 qa-px-4 qa-py-3 qa-bg-1">
        {/* wordmark: accent 6px square + 13px/600 label (no serif) */}
        <span className="qa-flex qa-items-center qa-gap-1.5 qa-dir-ltr" dir="ltr">
          <span
            aria-hidden="true"
            className="qa-shrink-0"
            style={{ width: 6, height: 6, background: 'var(--qa-accent)' }}
          />
          <span className="qa-text-hi" style={{ fontSize: 13, fontWeight: 600 }}>
            {brand.label}
          </span>
        </span>

        {/* note count badge */}
        <span className="qa-rounded-full qa-bg-3 qa-text-mid qa-px-2 qa-text-xs qa-font-medium">
          {notes.length}
        </span>

        {/* Re-test queue (v0.5): notes someone has marked fixed but nobody
            has re-checked. Shown in the header rather than only as a filter
            chip, because the whole point is that a tester coming back to a
            patched build should SEE that there is something waiting. */}
        {noteCounts.fixed > 0 && (
          <button
            onClick={() => { setActiveTab('notes'); setFilter({ status: 'fixed', severity: 'all', thisPageOnly: false }); }}
            title={t('retest_queue', { n: noteCounts.fixed })}
            aria-label={t('retest_queue', { n: noteCounts.fixed })}
            className="qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-bg-warn-tint qa-text-warn qa-px-2 qa-text-xs qa-font-medium"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <Icon name="RotateCcw" size={11} />
            {noteCounts.fixed}
          </button>
        )}

        {/* EN / ع language toggle */}
        <div
          className="qa-ms-auto qa-flex qa-items-center qa-overflow-hidden qa-rounded-lg qa-text-11 qa-font-semibold qa-bg-2"
          dir="ltr"
        >
          {(['en', 'ar'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`qa-px-2 qa-py-1 qa-transition qa-tap ${
                lang === l ? 'qa-bg-accent' : 'qa-bg-transparent qa-text-mid'
              }`}
              style={{ border: 'none', cursor: 'pointer' }}
            >
              {l === 'en' ? 'EN' : 'ع'}
            </button>
          ))}
        </div>

        {/* Move the panel to the other edge. It sits over the app being
            tested, and which side is in the way depends entirely on the app —
            so this is one tap rather than a preference buried in Settings. */}
        <button
          onClick={() => setPanelSide(panelSide === 'start' ? 'end' : 'start')}
          title={t('dock_move')}
          aria-label={t('dock_move')}
          className="qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-bg-transparent qa-text-hi qa-hover-bg-2 qa-transition"
          style={{ cursor: 'pointer' }}
        >
          <Icon name={panelSide === 'start' ? 'ChevronRight' : 'ChevronLeft'} size={16} />
        </button>

        {/* Collapse to the header strip: keeps the widget reachable while
            uncovering whatever it was sitting on. */}
        <button
          onClick={() => setPanelCollapsed(!panelCollapsed)}
          title={panelCollapsed ? t('panel_expand') : t('panel_collapse')}
          aria-label={panelCollapsed ? t('panel_expand') : t('panel_collapse')}
          className="qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-bg-transparent qa-text-hi qa-hover-bg-2 qa-transition"
          style={{ cursor: 'pointer' }}
        >
          <Icon name={panelCollapsed ? 'Maximize2' : 'Minimize2'} size={16} />
        </button>

        {/* settings: folder saving, storage, screenshots, view modes */}
        <button
          onClick={() => setSettingsOpen(true)}
          title={t('settings')}
          aria-label={t('settings')}
          className="qa-tap-icon qa-relative qa-rounded-lg qa-border qa-border-subtle qa-bg-transparent qa-text-hi qa-hover-bg-2 qa-transition"
          style={{ cursor: 'pointer' }}
        >
          <Icon name="Settings" size={16} />
          {/* A dot when something in there wants attention: the folder link
              broke, or the browser is running out of room. */}
          {(sync.state === 'needs-permission' || storageHealth.level !== 'ok') && (
            <span
              aria-hidden="true"
              className="qa-absolute qa-rounded-full"
              style={{
                top: 2,
                insetInlineEnd: 2,
                width: 6,
                height: 6,
                background: storageHealth.level === 'critical'
                  ? 'var(--qa-danger)'
                  : 'var(--qa-warn)',
              }}
            />
          )}
        </button>

        {/* global capture button */}
        <button
          onClick={() => startCapture()}
          title={t('capture_cta')}
          aria-label={t('capture_cta')}
          className="qa-tap-icon qa-rounded-lg qa-border qa-border-subtle qa-bg-transparent qa-text-hi qa-hover-bg-2 qa-transition"
          style={{ cursor: 'pointer' }}
        >
          <Icon name="Crosshair" size={16} />
        </button>

        {/* export button */}
        <button
          onClick={openNaming}
          disabled={!notes.length || isExporting}
          title={t('export')}
          className="qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-border qa-border-subtle qa-bg-transparent qa-px-2.5 qa-py-1.5 qa-text-xs qa-font-medium qa-text-hi qa-hover-bg-2 qa-transition qa-tap"
          style={{ cursor: 'pointer' }}
        >
          <Icon
            name={isExporting ? 'Loader2' : 'Download'}
            size={14}
            className={isExporting ? 'qa-animate-spin' : undefined}
          />
          {t('export')}
        </button>
      </div>

      {/* Everything below the header is hidden while collapsed. */}
      {!panelCollapsed && (
      <>
      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      {/* Simple mode drops Logins/Guide entirely: a tester handed a beta link
          needs to capture, review and export, and the other two tabs are
          setup surfaces for whoever configured the project. */}
      {!simpleMode && (
        <TabsBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          t={t}
          lang={lang}
        />
      )}

      {/* live folder-sync strip — the tester's proof their notes are on disk */}
      {sync.state === 'syncing' && (
        <div className="qa-flex qa-items-center qa-gap-1.5 qa-px-3 qa-py-1 qa-bg-1 qa-text-10 qa-text-success">
          <Icon name="FolderCheck" size={11} className="qa-shrink-0" />
          <span className="qa-truncate qa-dir-ltr" dir="ltr" title={sync.path}>{sync.path}</span>
        </div>
      )}

      {/* A built-and-waiting archive: one fresh tap sends it. */}
      {pendingShare && (
        <button
          onClick={() => { void sharePending(); }}
          className="qa-tap qa-flex qa-items-center qa-justify-center qa-gap-1.5 qa-px-3 qa-py-2 qa-text-xs qa-font-semibold qa-bg-accent"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <Icon name="Send" size={14} />
          {t('share_now')}
        </button>
      )}

      {/* separator */}
      <div className="qa-h-px qa-bg-3" />

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="qa-flex-1 qa-space-y-3 qa-overflow-y-auto qa-p-3 qa-bg-0">
        {(simpleMode || activeTab === 'notes') && (
          <>
            {showWelcome && <WelcomeCard />}
            <NoteEditor />
            <NoteFilterBar />
            <NoteList />
            {notes.length > 0 && (
              <div className="qa-pt-1 qa-text-center">
                {confirmClear ? (
                  <span className="qa-text-xs qa-text-mid">
                    {t('delete_all_q', { n: notes.length })}{' '}
                    <button
                      onClick={() => { void clearNotes(); setConfirmClear(false); }}
                      className="qa-font-semibold qa-text-danger qa-tap"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('yes')}
                    </button>
                    {' / '}
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="qa-text-accent qa-tap"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('no')}
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="qa-inline-flex qa-items-center qa-gap-1 qa-text-xs qa-text-lo qa-hover-text-red"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <Icon name="Trash" size={12} />
                    {t('clear_all')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        {!simpleMode && activeTab === 'logins' && <CredentialsSection />}
        {!simpleMode && activeTab === 'guide'  && <GuideSection />}
      </div>

      </>
      )}

      {/* ── Settings sheet ───────────────────────────────────────────────── */}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}

      {/* ── Export-name dialog ───────────────────────────────────────────── */}
      {naming && (
        <div
          className="qa-absolute qa-inset-0 qa-z-50 qa-flex qa-items-center qa-justify-center qa-p-5"
          style={{ background: 'var(--qa-scrim-dialog)' }}
          onClick={() => setNaming(false)}
        >
          <div
            className="qa-w-full qa-rounded-xl qa-border qa-border-subtle qa-bg-2 qa-p-4 qa-elev-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="qa-mb-2 qa-text-sm qa-font-semibold qa-text-hi">
              {t('export_name_title')}
            </p>
            <div
              className="qa-flex qa-items-center qa-rounded-lg qa-border qa-border-subtle qa-dir-ltr"
            >
              <input
                autoFocus
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doExport();
                }}
                placeholder={t('export_name_placeholder')}
                className="qa-min-w-0 qa-flex-1 qa-rounded-lg qa-px-2 qa-py-1.5 qa-text-sm qa-border-0"
                style={{ outline: 'none', background: 'transparent', color: 'inherit' }}
              />
              <span className="qa-px-2 qa-text-xs qa-text-lo">.zip</span>
            </div>

            {/* soft gate: warn when red zones remain uncovered — export is not blocked */}
            {namingCoverage && namingCoverage.uncoveredReds.length > 0 && (
              <p className="qa-mt-2 qa-text-11 qa-text-warn">
                {lang === 'ar'
                  ? `⚠ ${namingCoverage.uncoveredReds.length} منطقة/مناطق حمراء لم يتم التحقق منها — تصدير على أي حال؟`
                  : `⚠ ${namingCoverage.uncoveredReds.length} red zone(s) not yet verified — export anyway?`}
              </p>
            )}

            <div className="qa-mt-3 qa-flex qa-gap-2">
              <button
                onClick={doExport}
                className="qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-bg-accent qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-tap"
                style={{ border: 'none', cursor: 'pointer' }}
              >
                <Icon name="Check" size={16} />
                {t('export')}
              </button>
              {/* On a phone a "download" lands somewhere the tester will never
                  find. Share hands the archive to the OS sheet — WhatsApp,
                  Mail, Files — which is how a phone actually sends anything. */}
              {canShare && (
                <button
                  onClick={doShare}
                  className="qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-py-2 qa-text-sm qa-text-hi qa-tap"
                  style={{ background: 'transparent', cursor: 'pointer' }}
                >
                  <Icon name="Send" size={16} />
                  {t('share')}
                </button>
              )}
              <button
                onClick={() => setNaming(false)}
                className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-py-2 qa-text-sm qa-text-hi qa-tap"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                <Icon name="X" size={16} />
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TabsBar — separated so it can hold refs cleanly
// ---------------------------------------------------------------------------

function TabsBar({
  activeTab,
  setActiveTab,
  t,
  lang,
}: {
  activeTab: 'notes' | 'logins' | 'guide';
  setActiveTab: (tab: 'notes' | 'logins' | 'guide') => void;
  t: (key: string) => string;
  lang: string;
}) {
  const tabRefs   = useRef<(HTMLButtonElement | null)[]>([]);
  const barRef    = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const idx = TABS.findIndex((tab) => tab.key === activeTab);
    const btn = tabRefs.current[idx];
    const bar = barRef.current;
    if (!btn || !bar) return;
    // Padding compensation: the indicator is inset by 8px (0.5rem) on each side
    bar.style.left  = `${btn.offsetLeft + 8}px`;
    bar.style.width = `${Math.max(0, btn.offsetWidth - 16)}px`;
    // `lang` isn't read above, but toggling it changes each tab button's label
    // text/font (hence rendered width) without necessarily resizing the tabs
    // container itself — include it here so this callback's identity changes
    // on language switch, which reruns the positioning effect below.
  }, [activeTab, lang]);

  // Reposition on active tab change
  useLayoutEffect(() => {
    reposition();
  }, [reposition]);

  // Reposition on container resize (e.g. RTL / font changes)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(reposition);
    ro.observe(container);
    return () => ro.disconnect();
  }, [reposition]);

  return (
    <div ref={containerRef} className="qa-flex qa-px-2 qa-pt-2 qa-relative qa-bg-1">
      {TABS.map((tab, i) => {
        const on = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => setActiveTab(tab.key)}
            className={`qa-relative qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-py-2 qa-text-sm qa-font-medium qa-transition qa-tap ${
              on ? 'qa-text-accent' : 'qa-text-mid'
            }`}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <Icon name={tab.icon} size={16} />
            {t(tab.labelKey)}
          </button>
        );
      })}
      {/* absolutely-positioned active tab indicator bar */}
      <span
        ref={barRef}
        className="qa-tab-indicator"
        style={{ background: 'var(--qa-accent)' }}
        aria-hidden="true"
      />
    </div>
  );
}
