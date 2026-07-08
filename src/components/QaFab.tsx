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
 *
 * Draggable position — TOUCH ONLY (added):
 *  - Entirely gated behind useCoarsePointer(). When the pointer is NOT
 *    coarse, no pointer handlers are attached, no drag class is applied, and
 *    the FAB always sits at the original fixed spot — the desktop/mouse
 *    experience is unchanged.
 *  - On a coarse (touch) pointer, pressing and moving more than ~8px picks
 *    the FAB up; it can be dropped anywhere on-screen (clamped so it always
 *    stays fully visible, with a small edge margin standing in for
 *    safe-area insets). The dropped spot is remembered (localStorage) and
 *    restored next time.
 *  - A drag never toggles the panel — only a plain tap (movement under the
 *    threshold) does, exactly as before. This is enforced by a didDrag ref
 *    that onClick checks first.
 */

import { useEffect, useRef, useState } from 'react';
import { useQa } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import { useCoarsePointer } from '../lib/coarse';

// The original, non-draggable fixed position. Rendered whenever there's no
// saved touch position yet, or the pointer isn't coarse — kept as CONSTANTS
// (not recomputed strings) so the desktop path is byte-identical to before.
const DEFAULT_LEFT = 'calc(1.25rem + env(safe-area-inset-left))';
const DEFAULT_BOTTOM = 'calc(5rem + env(safe-area-inset-bottom))';

const FAB_SIZE_PX = 56; // 3.5rem @ 16px root — matches the width/height below
const EDGE_MARGIN = 12; // keep-out gap from the viewport edge; also stands in for safe-area insets
const DRAG_THRESHOLD = 8; // px of pointer movement before a touch press becomes a drag

// QaContext's namespaced `createStorage` (see lib/storage.ts) isn't exposed
// through useQa()'s context value, so this component keeps its own tiny,
// SSR/private-mode-safe adapter — same try/catch-guarded shape — under a
// fixed key instead of `${namespace}:fabpos`.
const FAB_POS_KEY = 'qapture:fabpos';

type FabPos = { left: number; bottom: number };

function isFabPos(v: unknown): v is FabPos {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.left === 'number' && Number.isFinite(o.left) &&
    typeof o.bottom === 'number' && Number.isFinite(o.bottom)
  );
}

function loadFabPos(): FabPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FAB_POS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFabPos(parsed) ? parsed : null;
  } catch {
    return null; // SSR / private-mode / corrupt JSON
  }
}

function saveFabPos(pos: FabPos): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FAB_POS_KEY, JSON.stringify(pos));
  } catch {
    // private-mode / quota exceeded — position just won't persist
  }
}

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Clamp so the FAB always stays fully inside the viewport. */
function clampFabPos(p: FabPos, w = FAB_SIZE_PX, h = FAB_SIZE_PX): FabPos {
  if (typeof window === 'undefined') return p;
  const maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
  const maxBottom = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
  return {
    left: clampNum(p.left, EDGE_MARGIN, maxLeft),
    bottom: clampNum(p.bottom, EDGE_MARGIN, maxBottom),
  };
}

/** In-flight drag bookkeeping — a ref so pointermove doesn't re-render more than needed. */
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startBottom: number;
  width: number;
  height: number;
  dragging: boolean;
};

export default function QaFab() {
  const { isOpen, setIsOpen, notes, captureActive, theme } = useQa();
  const coarse = useCoarsePointer();

  // Persisted drag position (touch-only). Loaded once on mount; null means
  // "use the default fixed spot" (byte-identical to the pre-drag CSS).
  const [pos, setPos] = useState<FabPos | null>(() => loadFabPos());

  const dragRef = useRef<DragState | null>(null);
  // True for the brief window between a completed drag and the click event
  // that follows it, so release doesn't also toggle the panel. Reset at the
  // start of every new pointerdown too, since some browsers never fire a
  // trailing click after a touch drag (so onClick alone can't be relied on
  // to consume it).
  const didDragRef = useRef(false);

  // clampFabPos() only recomputes against the CURRENT viewport size, but it's
  // only ever called at render time — a resize/orientation change (e.g.
  // rotating a tablet) wouldn't otherwise trigger a re-render, so a
  // drag-repositioned FAB could sit clamped to stale pre-rotation bounds.
  // This dummy counter just forces a re-render so the clamp recomputes.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onViewportChange = () => setViewportTick((n) => n + 1);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
    };
  }, []);

  // The FAB is hidden while capture mode is active (CaptureMode has its own UI)
  if (captureActive) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current) return; // ignore a second simultaneous pointer
    didDragRef.current = false;
    const target = e.currentTarget as Element;
    const rect = target.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startBottom: window.innerHeight - rect.bottom,
      width: rect.width,
      height: rect.height,
      dragging: false,
    };
    try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.dragging = true;
    }
    setPos(clampFabPos({ left: d.startLeft + dx, bottom: d.startBottom - dy }, d.width, d.height));
  };

  // Shared pointerup/pointercancel teardown: release capture + clear the ref.
  // Returns the drag state that was active (or null if this pointer wasn't it).
  const endDrag = (e: React.PointerEvent): DragState | null => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return null;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    dragRef.current = null;
    return d;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = endDrag(e);
    if (!d) return;
    if (d.dragging) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const next = clampFabPos({ left: d.startLeft + dx, bottom: d.startBottom - dy }, d.width, d.height);
      setPos(next);
      saveFabPos(next);
      didDragRef.current = true;
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    endDrag(e);
    // A cancelled gesture just drops the in-progress drag — no position
    // change, no didDrag flag (so it can't suppress some later unrelated tap).
  };

  const handleClick = () => {
    // A drag never opens/closes the panel — only a plain tap does.
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    setIsOpen(!isOpen);
  };

  // Only ever non-null on a coarse pointer with a saved position — desktop
  // (or a coarse pointer with nothing saved yet) always renders the default.
  const applied = coarse && pos ? clampFabPos(pos) : null;

  const fabStyle: React.CSSProperties = {
    left: applied ? `${applied.left}px` : DEFAULT_LEFT,
    bottom: applied ? `${applied.bottom}px` : DEFAULT_BOTTOM,
    width: '3.5rem',
    height: '3.5rem',
    backgroundImage: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
    boxShadow:
      '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04), 0 0 0 2px rgba(255,255,255,0.7)',
    zIndex: 9990,
  };

  return (
    <button
      type="button"
      data-qa-overlay="true"
      dir="ltr"
      onClick={handleClick}
      onPointerDown={coarse ? onPointerDown : undefined}
      onPointerMove={coarse ? onPointerMove : undefined}
      onPointerUp={coarse ? onPointerUp : undefined}
      onPointerCancel={coarse ? onPointerCancel : undefined}
      aria-label="Qapture — testing notes"
      title="Qapture"
      className={`qa-fixed qa-flex qa-items-center qa-justify-center qa-rounded-full qa-text-white qa-print-hidden qa-fab-btn${coarse ? ' qa-touch-none' : ''}`}
      style={fabStyle}
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
