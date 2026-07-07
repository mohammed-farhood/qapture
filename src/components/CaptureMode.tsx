/**
 * CaptureMode — the on-page selection + inline annotation flow.
 *
 *  • Move the mouse  → the element under the cursor is highlighted (snap).
 *  • Click           → select that precise element.
 *  • Press & drag    → draw a freeform region over ANY area.
 *  • On select       → auto-crop a screenshot (html2canvas) AND record its
 *                      location, then an inline card appears right there to
 *                      write what to do. Save → becomes a note.
 *  • ⌘/Ctrl+Enter   → save from textarea.
 *  • Esc             → cancel (capture-phase keydown on document).
 *
 *  Touch (coarse pointer) flow — entirely gated behind useCoarsePointer(),
 *  desktop mouse behaviour above is unchanged:
 *  • Tap an element   → becomes a CANDIDATE (no hover preview — there's no
 *                      hover on touch). A confirm toolbar appears with
 *                      "Use this" / "Adjust".
 *  • "Draw region" toggle → the next drag on the page draws a freeform
 *                      region candidate instead of picking an element.
 *  • Region candidate → 8 resize handles + a draggable body let you fine-tune
 *                      the rect before confirming.
 *  • "Use this"       → same beginAnnotation() flow as desktop, wrapped in a
 *                      page-scroll lock (avoids iOS rubber-banding while
 *                      html2canvas runs) and passed a scroll snapshot taken
 *                      at pointer-up so momentum scrolling can't shift crop.
 *
 * Everything here carries data-qa-overlay so it is excluded from html2canvas.
 *
 * Ported from CaptureMode.jsx:
 *  - framer-motion removed → CSS card-anim / card-in classes for fade-in
 *  - THEME import removed → useQa().theme
 *  - lucide-react → Icon
 *  - Tailwind classes → qa-* equivalents
 *
 * Shadow-DOM / elementFromPoint note:
 *   The interceptor div lives inside the shadow root. Temporarily setting its
 *   pointer-events to 'none' lets document.elementFromPoint() return host
 *   light-DOM elements underneath — exactly the intended behaviour. The shadow
 *   host itself carries data-qa-overlay, so if it is returned we discard it.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useQa } from '../context/QaContext';
import type { QaTarget, QaRect } from '../context/QaContext';
import { Icon } from '../icons/Icon';
import { captureRegion } from '../lib/capture';
import { getStableSelector } from '../lib/selector';
import { useCoarsePointer } from '../lib/coarse';
import { lockPageScroll, unlockPageScroll } from '../lib/scrollLock';
import LocationReveal from './LocationReveal';

const DRAG_THRESHOLD = 6; // px before a mouse press becomes a region drag
const TOUCH_DRAG_THRESHOLD = 12; // px before a touch press becomes a region drag
const MIN_REGION_SIZE = 8; // px floor when resizing a region candidate

interface Hover { rect: QaRect; selector: string }
interface DragState { x0: number; y0: number; rect: QaRect | null }
interface Selection {
  kind: 'element' | 'region';
  rect: QaRect;
  selector?: string;
  text?: string;
  tagName?: string;
}

/** Which edge(s) of a region candidate a resize handle controls; 'move' translates the whole rect. */
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

interface HandleDrag {
  edge: ResizeEdge;
  pointerId: number;
  startRect: QaRect;
  startX: number;
  startY: number;
}

// Position (percent of the candidate box) for each of the 8 resize handles.
const REGION_HANDLES: { edge: ResizeEdge; top: string; left: string; cursor: string }[] = [
  { edge: 'nw', top: '0%',   left: '0%',   cursor: 'nwse-resize' },
  { edge: 'n',  top: '0%',   left: '50%',  cursor: 'ns-resize' },
  { edge: 'ne', top: '0%',   left: '100%', cursor: 'nesw-resize' },
  { edge: 'w',  top: '50%',  left: '0%',   cursor: 'ew-resize' },
  { edge: 'e',  top: '50%',  left: '100%', cursor: 'ew-resize' },
  { edge: 'sw', top: '100%', left: '0%',   cursor: 'nesw-resize' },
  { edge: 's',  top: '100%', left: '50%',  cursor: 'ns-resize' },
  { edge: 'se', top: '100%', left: '100%', cursor: 'nwse-resize' },
];

export default function CaptureMode() {
  const { addNote, endCapture, t, dir, theme } = useQa();
  const coarse = useCoarsePointer();
  const layerRef = useRef<HTMLDivElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<'selecting' | 'confirming' | 'annotating'>('selecting');
  const [hover, setHover] = useState<Hover | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [candidate, setCandidate] = useState<Selection | null>(null); // pending selection awaiting touch confirm
  const [regionMode, setRegionMode] = useState(false); // touch draw-region toggle
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [description, setDescription] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const activePointerId = useRef<number | null>(null);
  const pointerKind = useRef<'mouse' | 'touch' | 'pen'>('mouse');
  const scrollSnap = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const handleDragRef = useRef<HandleDrag | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Card fade-in state: true once the annotating card is in the DOM and we
  // want to trigger the CSS transition from opacity-0 → 1.
  const [cardIn, setCardIn] = useState(false);

  // ── See through our own shadow interceptor ──────────────────────────────
  // Temporarily sets pointer-events:none on the interceptor so that
  // document.elementFromPoint() sees the host app's light-DOM elements.
  const elementUnder = useCallback((x: number, y: number): Element | null => {
    const layer = layerRef.current;
    if (!layer) return null;
    const prev = layer.style.pointerEvents;
    layer.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    layer.style.pointerEvents = prev;
    // Discard if the element is (or is inside) our own overlay UI.
    if (!el || el.closest?.('[data-qa-overlay]')) return null;
    return el;
  }, []);

  // ── Begin annotation phase ───────────────────────────────────────────────
  const beginAnnotation = useCallback(async (sel: Selection) => {
    setSelection(sel);
    setCandidate(null);
    setHover(null);
    setRegionMode(false);
    setPhase('annotating');
    setCardIn(false); // reset: card will fade in on next frame
    setCapturing(true);
    lockPageScroll();
    try {
      const blob = await captureRegion(sel.rect, scrollSnap.current);
      if (!mountedRef.current) {
        // Component is gone — don't setState; revoke immediately so we
        // don't leave an orphaned blob URL behind.
        if (blob) URL.revokeObjectURL(URL.createObjectURL(blob));
        return;
      }
      setShot(blob);
      setShotUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return blob ? URL.createObjectURL(blob) : null;
      });
    } finally {
      unlockPageScroll();
      if (mountedRef.current) setCapturing(false);
    }
  }, []);

  // Trigger card fade-in one frame after phase switches to annotating
  useEffect(() => {
    if (phase !== 'annotating') { setCardIn(false); return; }
    const id = requestAnimationFrame(() => setCardIn(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // ── Selecting-phase pointer handlers ────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'selecting') return;
    pointerKind.current = e.pointerType as 'mouse' | 'touch' | 'pen';
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (activePointerId.current !== null) return;
    activePointerId.current = e.pointerId;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // A mouse press always begins a potential drag (unchanged desktop
    // behaviour). A touch press only begins one while "draw region" is on —
    // otherwise a tap is resolved as a plain element pick on pointer-up.
    if (e.pointerType === 'mouse' || (coarse && regionMode)) {
      dragRef.current = { x0: e.clientX, y0: e.clientY, rect: null };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (phase !== 'selecting') return;
    if (dragRef.current && activePointerId.current === e.pointerId) {
      const d = dragRef.current;
      const rect: QaRect = {
        left: Math.min(d.x0, e.clientX),
        top: Math.min(d.y0, e.clientY),
        width: Math.abs(e.clientX - d.x0),
        height: Math.abs(e.clientY - d.y0),
      };
      setDrag({ ...d, rect });
      return;
    }
    if (!coarse) {
      const el = elementUnder(e.clientX, e.clientY);
      if (!el) { setHover(null); return; }
      const r = el.getBoundingClientRect();
      setHover({
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        selector: getStableSelector(el),
      });
    }
    // coarse & not dragging: do nothing — no hover preview on touch.
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (phase !== 'selecting') return;
    if (activePointerId.current !== e.pointerId) return;
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    activePointerId.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    const threshold = pointerKind.current === 'mouse' ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
    const moved = d !== null && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > threshold;
    scrollSnap.current = { x: window.scrollX, y: window.scrollY };

    if (moved && d) {
      const rect: QaRect = {
        left: Math.min(d.x0, e.clientX),
        top: Math.min(d.y0, e.clientY),
        width: Math.abs(e.clientX - d.x0),
        height: Math.abs(e.clientY - d.y0),
      };
      setDrag(null);
      const sel: Selection = { kind: 'region', rect };
      if (coarse) {
        setCandidate(sel);
        setPhase('confirming');
      } else {
        void beginAnnotation(sel);
      }
    } else {
      const el = elementUnder(e.clientX, e.clientY);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sel: Selection = {
        kind: 'element',
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        selector: getStableSelector(el),
        text: ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().slice(0, 120),
        tagName: el.tagName.toLowerCase(),
      };
      if (coarse) {
        setCandidate(sel);
        setHover({ rect: sel.rect, selector: sel.selector || '' });
        setPhase('confirming');
      } else {
        void beginAnnotation(sel);
      }
    }
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (activePointerId.current === e.pointerId) {
      activePointerId.current = null;
      dragRef.current = null;
      setDrag(null);
    }
    // Do NOT change phase — a cancelled pointer just drops the in-progress drag.
  };

  // ── Region-candidate resize handles + body drag (touch confirm step) ────
  const onHandlePointerDown = useCallback(
    (edge: ResizeEdge) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!candidate) return;
      try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      handleDragRef.current = {
        edge,
        pointerId: e.pointerId,
        startRect: { ...candidate.rect },
        startX: e.clientX,
        startY: e.clientY,
      };
    },
    [candidate],
  );

  const onHandlePointerMove = useCallback((e: React.PointerEvent) => {
    const hd = handleDragRef.current;
    if (!hd || hd.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - hd.startX;
    const dy = e.clientY - hd.startY;
    const { startRect, edge } = hd;
    let { top, left, width, height } = startRect;

    if (edge === 'move') {
      left = startRect.left + dx;
      top = startRect.top + dy;
    } else {
      if (edge.includes('e')) width = Math.max(MIN_REGION_SIZE, startRect.width + dx);
      if (edge.includes('w')) {
        width = Math.max(MIN_REGION_SIZE, startRect.width - dx);
        left = startRect.left + (startRect.width - width);
      }
      if (edge.includes('s')) height = Math.max(MIN_REGION_SIZE, startRect.height + dy);
      if (edge.includes('n')) {
        height = Math.max(MIN_REGION_SIZE, startRect.height - dy);
        top = startRect.top + (startRect.height - height);
      }
    }

    setCandidate((prev) => (prev ? { ...prev, rect: { top, left, width, height } } : prev));
  }, []);

  const onHandlePointerUp = useCallback((e: React.PointerEvent) => {
    const hd = handleDragRef.current;
    if (!hd || hd.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try { (e.currentTarget as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    handleDragRef.current = null;
  }, []);

  // ── Keyboard: Esc cancels; ⌘/Ctrl+Enter saves ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); endCapture(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [endCapture]);

  // ── Focus trap: keep Tab/Shift+Tab from escaping into the dimmed host page ─
  // The interceptor above only blocks pointer events, so without this, Tab
  // can move focus into elements underneath the overlay.
  useEffect(() => {
    const FOCUSABLE_SELECTOR =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = overlayRootRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const activeInside = !!active && root.contains(active);
      if (e.shiftKey) {
        if (!activeInside || active === first) { e.preventDefault(); last.focus(); }
      } else {
        if (!activeInside || active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Focus textarea when annotation card opens
  useEffect(() => {
    if (phase === 'annotating' && taRef.current) taRef.current.focus();
  }, [phase]);

  // Revoke shot URL on unmount
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

  // Belt-and-suspenders: if the component unmounts mid-capture (host navigates
  // away while html2canvas is still running), make sure the scroll lock never
  // outlives us. unlockPageScroll() is idempotent.
  useEffect(() => () => { unlockPageScroll(); }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!selection || !description.trim()) return;
    const target: QaTarget = {
      kind: selection.kind,
      selector: selection.selector,
      text: selection.text,
      tagName: selection.tagName,
      rect: {
        top: Math.round(selection.rect.top),
        left: Math.round(selection.rect.left),
        width: Math.round(selection.rect.width),
        height: Math.round(selection.rect.height),
      },
      scroll: { ...scrollSnap.current },
    };
    await addNote({ description, screenshot: shot ?? undefined, target });
    endCapture();
  };

  // ── Popover placement (reused for the annotating card + confirm toolbar) ─
  const popStyleFor = useCallback((r: QaRect): React.CSSProperties => {
    if (typeof window === 'undefined') return {};
    const below = r.top + r.height + 12;
    const placeAbove = below + 220 > window.innerHeight;
    const top = placeAbove ? Math.max(12, r.top - 12) : below;
    let left = r.left;
    left = Math.min(left, window.innerWidth - 340);
    left = Math.max(12, left);
    return {
      top,
      left,
      transform: placeAbove ? 'translateY(-100%)' : 'none',
    };
  }, []);

  const popStyle = selection ? popStyleFor(selection.rect) : {};
  const confirmPopStyle = candidate ? popStyleFor(candidate.rect) : {};

  const activeRect = drag?.rect ?? candidate?.rect ?? selection?.rect ?? hover?.rect ?? null;
  const isRegion = !!drag?.rect || candidate?.kind === 'region' || selection?.kind === 'region';
  const confirmingRegion = phase === 'confirming' && candidate?.kind === 'region' && coarse;

  return (
    <div data-qa-overlay="true" ref={overlayRootRef}>
      {/* ── Dimmed interceptor ───────────────────────────────────────────── */}
      <div
        ref={layerRef}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="qa-fixed qa-inset-0 qa-z-10090"
        style={{
          cursor: phase === 'selecting' && !coarse ? 'crosshair' : 'default',
          touchAction: coarse ? 'none' : 'auto',
          background: 'rgba(58,42,46,0.18)',
        }}
      />

      {/* ── Hint bar (desktop) ──────────────────────────────────────────── */}
      {phase === 'selecting' && !coarse && (
        <div
          className="qa-fixed qa-left-half qa-top-4 qa-z-10095 qa-translate-x-neg-half qa-flex qa-items-center qa-gap-3 qa-rounded-full qa-px-4 qa-py-2 qa-text-sm qa-text-white qa-shadow-lg"
          style={{ background: theme.primary }}
        >
          <span className="qa-flex qa-items-center qa-gap-1.5">
            <Icon name="MousePointerClick" size={16} />
            {t('cap_click')}
          </span>
          <span className="qa-opacity-50">·</span>
          <span className="qa-flex qa-items-center qa-gap-1.5">
            <Icon name="Square" size={16} />
            {t('cap_drag')}
          </span>
          <button
            onClick={() => endCapture()}
            className="qa-tap-icon qa-ms-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-xs qa-hover-bg-white-15"
            style={{ background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Esc
          </button>
        </div>
      )}

      {/* ── Hint bar (touch) ────────────────────────────────────────────── */}
      {phase === 'selecting' && coarse && (
        <div
          className="qa-fixed qa-left-half qa-top-4 qa-z-10095 qa-translate-x-neg-half qa-flex qa-items-center qa-gap-3 qa-rounded-full qa-px-4 qa-py-2 qa-text-sm qa-text-white qa-shadow-lg"
          style={{ background: theme.primary }}
        >
          <span className="qa-flex qa-items-center qa-gap-1.5">
            <Icon name="MousePointerClick" size={16} />
            {t('tap_element')}
          </span>
          <span className="qa-opacity-50">·</span>
          <button
            onClick={() => setRegionMode((v) => !v)}
            aria-pressed={regionMode}
            className="qa-tap qa-flex qa-items-center qa-gap-1.5 qa-rounded-full qa-px-2 qa-py-0.5 qa-text-xs"
            style={{
              border: '1px solid rgba(255,255,255,0.4)',
              background: regionMode ? 'rgba(255,255,255,0.35)' : 'transparent',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <Icon name="Square" size={16} />
            {t('draw_region')}
          </button>
          <button
            onClick={() => endCapture()}
            className="qa-tap-icon qa-ms-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-xs qa-hover-bg-white-15"
            style={{ background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Esc
          </button>
        </div>
      )}

      {/* ── Selection / hover / candidate highlight ──────────────────────── */}
      {activeRect && (
        <div
          className="qa-fixed qa-z-10092 qa-rounded"
          style={{
            top: activeRect.top,
            left: activeRect.left,
            width: activeRect.width,
            height: activeRect.height,
            pointerEvents: confirmingRegion ? 'auto' : 'none',
            outline: `2px ${isRegion ? 'dashed' : 'solid'} ${theme.accent}`,
            outlineOffset: '1px',
            background: `${theme.accent}1f`,
            boxShadow:
              phase === 'annotating'
                ? '0 0 0 9999px rgba(58,42,46,0.28)'
                : 'none',
          }}
        >
          {/* element selector label — selecting hover, or a confirming candidate */}
          {(phase === 'selecting' || phase === 'confirming') && hover?.selector && !drag && (
            <span
              className="qa-absolute qa-rounded qa-px-1.5 qa-py-0.5 qa-text-11 qa-text-white qa-truncate"
              style={{
                top: '-1.5rem',
                left: 0,
                maxWidth: '260px',
                background: theme.primary,
              }}
            >
              {hover.selector}
            </span>
          )}
          {/* drag dimensions label */}
          {drag?.rect && (
            <span
              className="qa-absolute qa-rounded qa-px-1.5 qa-py-0.5 qa-text-11 qa-text-white"
              style={{
                bottom: '-1.5rem',
                right: 0,
                background: theme.accentDark,
              }}
            >
              {Math.round(drag.rect.width)} × {Math.round(drag.rect.height)}
            </span>
          )}

          {/* touch region-candidate: draggable body + 8 resize handles */}
          {confirmingRegion && (
            <>
              <div
                className="qa-absolute qa-inset-0 qa-z-10093"
                onPointerDown={onHandlePointerDown('move')}
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
                style={{ touchAction: 'none', cursor: 'move' }}
              />
              {REGION_HANDLES.map(({ edge, top, left, cursor }) => (
                <div
                  key={edge}
                  role="button"
                  aria-label={t('resize')}
                  className="qa-tap-icon qa-z-10094 qa-absolute qa-rounded-full"
                  onPointerDown={onHandlePointerDown(edge)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                  style={{
                    top,
                    left,
                    transform: 'translate(-50%, -50%)',
                    touchAction: 'none',
                    cursor,
                    background: `${theme.accent}33`,
                  }}
                >
                  <span
                    className="qa-rounded-full"
                    style={{
                      width: 16,
                      height: 16,
                      background: theme.accent,
                      border: '2px solid #fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Touch confirm toolbar ─────────────────────────────────────────── */}
      {phase === 'confirming' && candidate && coarse && (
        <div
          data-qa-overlay="true"
          dir={dir}
          role="group"
          aria-label={candidate.kind === 'region' ? t('confirm_region') : t('use_this')}
          className="qa-fixed qa-z-10096 qa-flex qa-items-center qa-gap-2 qa-rounded-full qa-border qa-px-3 qa-py-2 qa-shadow-lg"
          style={{
            ...confirmPopStyle,
            background: theme.surface,
            borderColor: `${theme.primary}22`,
          }}
        >
          <button
            onClick={() => void beginAnnotation(candidate)}
            className="qa-tap qa-flex qa-items-center qa-gap-1.5 qa-rounded-full qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-text-white"
            style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
          >
            <Icon name="Check" size={16} />
            {t('use_this')}
          </button>
          <button
            onClick={() => { setCandidate(null); setHover(null); setPhase('selecting'); }}
            className="qa-tap qa-rounded-full qa-border qa-px-3 qa-py-2 qa-text-sm"
            style={{
              borderColor: `${theme.primary}33`,
              color: theme.primary,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {t('adjust')}
          </button>
        </div>
      )}

      {/* ── Inline annotation card ───────────────────────────────────────── */}
      {phase === 'annotating' && selection && (
        <div
          data-qa-overlay="true"
          dir={dir}
          className={`qa-fixed qa-z-10096 qa-w-320 qa-overflow-hidden qa-rounded-xl qa-border qa-shadow-2xl qa-card-anim${cardIn ? ' qa-card-in' : ''}`}
          style={{
            ...popStyle,
            background: theme.surface,
            borderColor: `${theme.primary}22`,
            fontFamily:
              dir === 'rtl'
                ? "'Tajawal', sans-serif"
                : "'Nunito', system-ui, sans-serif",
          }}
        >
          {/* card header */}
          <div
            className="qa-flex qa-items-center qa-gap-2 qa-px-3 qa-py-2 qa-text-white"
            style={{ background: theme.primary }}
          >
            <Icon
              name={selection.kind === 'region' ? 'Square' : 'MousePointerClick'}
              size={16}
            />
            <span className="qa-text-xs qa-font-semibold">
              {selection.kind === 'region' ? t('sel_region') : t('sel_element')}
            </span>
            <button
              onClick={() => endCapture()}
              className="qa-tap-icon qa-ms-auto qa-opacity-80 qa-hover-opacity-100"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff' }}
            >
              <Icon name="X" size={16} />
            </button>
          </div>

          {/* card body */}
          <div className="qa-space-y-2 qa-p-3">
            {/* screenshot preview */}
            <div
              className="qa-flex qa-min-h-16 qa-items-center qa-justify-center qa-rounded-lg qa-border"
              style={{
                borderColor: `${theme.primary}1a`,
                background: theme.cream,
              }}
            >
              {capturing ? (
                <span
                  className="qa-flex qa-items-center qa-gap-2 qa-py-4 qa-text-xs"
                  style={{ color: theme.primary }}
                >
                  <Icon name="Loader2" size={16} className="qa-animate-spin" />
                  {t('capturing')}
                </span>
              ) : shotUrl ? (
                <img
                  src={shotUrl}
                  alt="capture"
                  className="qa-max-h-32 qa-rounded-md"
                />
              ) : (
                <span className="qa-py-4 qa-text-xs qa-text-slate-400">
                  {t('no_shot')}
                </span>
              )}
            </div>

            <LocationReveal target={selection as QaTarget} />

            <textarea
              ref={taRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
              }}
              rows={3}
              placeholder={t('annotate_placeholder')}
              className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
              style={{ borderColor: `${theme.primary}33`, background: '#fff', color: 'inherit' }}
            />

            <div className="qa-flex qa-items-center qa-gap-2">
              <button
                onClick={() => void save()}
                disabled={!description.trim()}
                className="qa-tap qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-text-white"
                style={{ background: theme.accent, border: 'none', cursor: 'pointer' }}
              >
                <Icon name="Check" size={16} />
                {t('save_point')}
              </button>
              <button
                onClick={() => {
                  setPhase('selecting');
                  setSelection(null);
                  setShot(null);
                  setDescription('');
                }}
                className="qa-tap qa-rounded-lg qa-border qa-px-3 qa-py-2 qa-text-sm"
                style={{
                  borderColor: `${theme.primary}33`,
                  color: theme.primary,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {t('reselect')}
              </button>
            </div>

            <p className="qa-text-center qa-text-10 qa-text-slate-400">
              {t('save_hint')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
