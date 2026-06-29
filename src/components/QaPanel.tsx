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

  return (
    <div
      data-qa-overlay="true"
      dir={dir}
      onTransitionEnd={handleTransitionEnd}
      className={`qa-fixed qa-flex qa-flex-col qa-overflow-hidden qa-rounded-2xl qa-border qa-shadow-2xl qa-print-hidden qa-w-panel qa-max-h-74vh qa-panel-anim${showIn ? ' qa-panel-in' : ''}`}
      style={{
        left: '1rem',
        bottom: dir === 'rtl' ? '9rem' : '8.75rem',
        background: theme.surface,
        borderColor: `${theme.primary}22`,
        fontFamily:
          lang === 'ar'
            ? "'Tajawal', sans-serif"
            : "'Nunito', system-ui, sans-serif",
        zIndex: 9990,
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
              className="qa-px-2 qa-py-1 qa-transition"
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
          className="qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-lg qa-px-2.5 qa-py-1.5 qa-text-xs qa-font-medium qa-hover-bg-white-15"
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
                      className="qa-font-semibold qa-text-red-600"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {t('yes')}
                    </button>
                    {' / '}
                    <button
                      onClick={() => setConfirmClear(false)}
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
                className="qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-text-white"
                style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
              >
                <Icon name="Check" size={16} />
                {t('export')}
              </button>
              <button
                onClick={() => setNaming(false)}
                className="qa-inline-flex qa-items-center qa-gap-1 qa-rounded-lg qa-border qa-px-3 qa-py-2 qa-text-sm"
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
}: {
  activeTab: 'notes' | 'logins' | 'guide';
  setActiveTab: (tab: 'notes' | 'logins' | 'guide') => void;
  t: (key: string) => string;
  theme: { primary: string; accent: string };
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
  }, [activeTab]);

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
            className="qa-relative qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-py-2 qa-text-sm qa-font-medium qa-transition"
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
