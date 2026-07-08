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
    notes, exportZip, isExporting, clearAll,
    t, lang, setLang, dir,
    brand, theme,
    journey, guideChecked,
  } = useQa();

  const [confirmClear, setConfirmClear] = useState(false);
  const [naming, setNaming]             = useState(false);
  const [filename, setFilename]         = useState('');

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
      className={`qa-fixed qa-flex qa-flex-col qa-overflow-hidden qa-rounded-2xl qa-border qa-shadow-2xl qa-print-hidden qa-w-panel qa-max-h-74vh qa-panel-anim${showIn ? ' qa-panel-in' : ''}`}
      style={{
        // Floating popover position (default). Fully overridden below when
        // docked as an iPad-landscape side-sheet.
        left: isIpadLandscape ? 'auto' : 'calc(1rem + env(safe-area-inset-left))',
        right: isIpadLandscape ? '0' : undefined,
        top: isIpadLandscape ? '0' : undefined,
        bottom: panelBottom,
        height: isIpadLandscape ? '100dvh' : undefined,
        width: isIpadLandscape ? 'min(92vw, 420px)' : undefined,
        // qa-max-h-74vh (class) would otherwise cap the sheet well short of
        // full height — neutralize it only in the docked sheet variant.
        maxHeight: isIpadLandscape ? 'none' : undefined,
        borderRadius: isIpadLandscape ? 0 : undefined,
        background: theme.surface,
        borderColor: `${theme.primary}22`,
        fontFamily:
          lang === 'ar'
            ? "'Tajawal', sans-serif"
            : "'Nunito', system-ui, sans-serif",
        zIndex: 9990,
        // Keyboard-avoidance lift (coarse/touch only — see effect above).
        // undefined ⇒ !keyboardLiftActive, so desktop and the iPad-landscape
        // side-sheet render this property exactly as before (the class's own
        // opacity/transform transition applies, untouched).
        transition: keyboardLiftActive ? PANEL_TRANSITION_WITH_LIFT : undefined,
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="qa-flex qa-items-center qa-gap-2 qa-px-4 qa-py-3 qa-text-white"
        style={{ backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
      >
        {/* brand label */}
        <span
          className="qa-text-sm qa-font-bold qa-dir-ltr"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.02em' }}
          dir="ltr"
        >
          {brand.label}
        </span>
        {/* note count badge */}
        <span className="qa-rounded-full qa-bg-white-25 qa-px-2 qa-text-xs qa-font-medium">
          {notes.length}
        </span>

        {/* EN / ع language toggle */}
        <div
          className="qa-ms-auto qa-flex qa-items-center qa-overflow-hidden qa-rounded-lg qa-text-11 qa-font-semibold"
          dir="ltr"
          style={{ background: 'rgba(255,255,255,0.15)' }}
        >
          {(['en', 'ar'] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className="qa-px-2 qa-py-1 qa-transition qa-tap"
              style={{
                background: lang === l ? '#ffffff' : 'transparent',
                color: lang === l ? theme.primary : '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {l === 'en' ? 'EN' : 'ع'}
            </button>
          ))}
        </div>

        {/* export button */}
        <button
          onClick={openNaming}
          disabled={!notes.length || isExporting}
          title={t('export')}
          className="qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-px-2.5 qa-py-1.5 qa-text-xs qa-font-medium qa-hover-bg-white-15 qa-tap"
          style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Icon
            name={isExporting ? 'Loader2' : 'Download'}
            size={14}
            className={isExporting ? 'qa-animate-spin' : undefined}
          />
          {t('export')}
        </button>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <TabsBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        t={t}
        theme={theme}
        lang={lang}
      />

      {/* separator */}
      <div className="qa-h-px" style={{ background: `${theme.primary}14` }} />

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div
        className="qa-flex-1 qa-space-y-3 qa-overflow-y-auto qa-p-3"
        style={{ background: `${theme.cream}80` }}
      >
        {activeTab === 'notes' && (
          <>
            <NoteEditor />
            <NoteList />
            {notes.length > 0 && (
              <div className="qa-pt-1 qa-text-center">
                {confirmClear ? (
                  <span className="qa-text-xs qa-text-slate-500">
                    {t('delete_all_q', { n: notes.length })}{' '}
                    <button
                      onClick={() => { void clearAll(); setConfirmClear(false); }}
                      className="qa-font-semibold qa-text-red-600 qa-tap"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('yes')}
                    </button>
                    {' / '}
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="qa-tap"
                      style={{ color: theme.primary, background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('no')}
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="qa-inline-flex qa-items-center qa-gap-1 qa-text-xs qa-text-slate-400 qa-hover-text-red"
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
        {activeTab === 'logins' && <CredentialsSection />}
        {activeTab === 'guide'  && <GuideSection />}
      </div>

      {/* ── Export-name dialog ───────────────────────────────────────────── */}
      {naming && (
        <div
          className="qa-absolute qa-inset-0 qa-z-50 qa-flex qa-items-center qa-justify-center qa-p-5"
          style={{ background: 'rgba(58,42,46,0.45)' }}
        >
          <div
            className="qa-w-full qa-rounded-xl qa-border qa-bg-white qa-p-4 qa-shadow-2xl"
            style={{ borderColor: `${theme.primary}22` }}
          >
            <p
              className="qa-mb-2 qa-text-sm qa-font-semibold"
              style={{ color: theme.ink }}
            >
              {t('export_name_title')}
            </p>
            <div
              className="qa-flex qa-items-center qa-rounded-lg qa-border qa-dir-ltr"
              style={{ borderColor: `${theme.primary}33` }}
            >
              <input
                autoFocus
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') doExport();
                  if (e.key === 'Escape') setNaming(false);
                }}
                placeholder={t('export_name_placeholder')}
                className="qa-min-w-0 qa-flex-1 qa-rounded-lg qa-px-2 qa-py-1.5 qa-text-sm qa-border-0"
                style={{ outline: 'none', background: 'transparent', color: 'inherit' }}
              />
              <span className="qa-px-2 qa-text-xs qa-text-slate-400">.zip</span>
            </div>

            {/* soft gate: warn when red zones remain uncovered — export is not blocked */}
            {namingCoverage && namingCoverage.uncoveredReds.length > 0 && (
              <p
                className="qa-mt-2 qa-text-11"
                style={{ color: '#F59E0B' }}
              >
                {lang === 'ar'
                  ? `⚠ ${namingCoverage.uncoveredReds.length} منطقة/مناطق حمراء لم يتم التحقق منها — تصدير على أي حال؟`
                  : `⚠ ${namingCoverage.uncoveredReds.length} red zone(s) not yet verified — export anyway?`}
              </p>
            )}

            <div className="qa-mt-3 qa-flex qa-gap-2">
              <button
                onClick={doExport}
                className="qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-text-white qa-tap"
                style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
              >
                <Icon name="Check" size={16} />
                {t('export')}
              </button>
              <button
                onClick={() => setNaming(false)}
                className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-px-3 qa-py-2 qa-text-sm qa-tap"
                style={{
                  borderColor: `${theme.primary}33`,
                  color: theme.primary,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
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
  theme,
  lang,
}: {
  activeTab: 'notes' | 'logins' | 'guide';
  setActiveTab: (tab: 'notes' | 'logins' | 'guide') => void;
  t: (key: string) => string;
  theme: { primary: string; accent: string };
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
    <div ref={containerRef} className="qa-flex qa-px-2 qa-pt-2 qa-relative">
      {TABS.map((tab, i) => {
        const on = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            ref={(el) => { tabRefs.current[i] = el; }}
            onClick={() => setActiveTab(tab.key)}
            className="qa-relative qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-py-2 qa-text-sm qa-font-medium qa-transition qa-tap"
            style={{
              color: on ? theme.primary : '#94a3b8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
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
        style={{ background: theme.accent }}
        aria-hidden="true"
      />
    </div>
  );
}
