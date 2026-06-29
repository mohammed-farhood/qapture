/**
 * QaFab — the always-visible launcher, fixed bottom-LEFT. Brand-styled with a
 * soft pulse animation and a note-count badge.
 *
 * Ported from QaFab.jsx:
 *  - framer-motion removed → CSS transition (.qa-fab-btn) for hover/active scale
 *  - useLanguage / isRTL removed → dir from useQa()
 *  - THEME import removed → useQa().theme
 *  - Bottom offset is a fixed inline value (no host nav to clear)
 *  - @keyframes qaPulse lives in QA_CSS (qa-animate-pulse-accent uses it)
 *  - lucide-react → Icon
 */

import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';

export default function QaFab() {
  const { isOpen, setIsOpen, notes, captureActive, theme } = useQa();

  // The FAB is hidden while capture mode is active (CaptureMode has its own UI)
  if (captureActive) return null;

  return (
    <button
      type="button"
      data-qa-overlay="true"
      dir="ltr"
      onClick={() => setIsOpen(!isOpen)}
      aria-label="QA Studio — testing notes"
      title="QA Studio"
      className="qa-fixed qa-flex qa-items-center qa-justify-center qa-rounded-full qa-text-white qa-print-hidden qa-fab-btn"
      style={{
        left: '1.25rem',
        bottom: '5rem',
        width: '3.5rem',
        height: '3.5rem',
        backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
        boxShadow:
          '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 2px rgba(255,255,255,0.7)',
        zIndex: 9990,
      }}
    >
      {/* pulse ring — only shown when panel is closed */}
      {!isOpen && (
        <span
          className="qa-absolute qa-inset-0 qa-rounded-full qa-opacity-60 qa-animate-pulse-accent"
          style={{ pointerEvents: 'none' }}
          aria-hidden="true"
        />
      )}

      {/* icon toggles between X (close) and ClipboardList (open) */}
      <Icon name={isOpen ? 'X' : 'ClipboardList'} size={24} />

      {/* note-count badge */}
      {!isOpen && notes.length > 0 && (
        <span
          className="qa-absolute qa-flex qa-items-center qa-justify-center qa-rounded-full qa-text-xs qa-font-bold"
          aria-label={`${notes.length} notes`}
          style={{
            top: '-4px',
            right: '-4px',
            minWidth: '1.5rem',
            height: '1.5rem',
            padding: '0 4px',
            background: '#fff',
            color: theme.primary,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          {notes.length}
        </span>
      )}
    </button>
  );
}
