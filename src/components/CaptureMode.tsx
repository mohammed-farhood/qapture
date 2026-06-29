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
import LocationReveal from './LocationReveal';

const DRAG_THRESHOLD = 6; // px before a press becomes a region drag

interface Hover { rect: QaRect; selector: string }
interface DragState { x0: number; y0: number; rect: QaRect | null }
interface Selection {
  kind: 'element' | 'region';
  rect: QaRect;
  selector?: string;
  text?: string;
  tagName?: string;
}

export default function CaptureMode() {
  const { addNote, endCapture, t, dir, theme } = useQa();
  const layerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<'selecting' | 'annotating'>('selecting');
  const [hover, setHover] = useState<Hover | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [description, setDescription] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

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
    setPhase('annotating');
    setCardIn(false); // reset: card will fade in on next frame
    setCapturing(true);
    const blob = await captureRegion(sel.rect);
    setShot(blob);
    setShotUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setCapturing(false);
  }, []);

  // Trigger card fade-in one frame after phase switches to annotating
  useEffect(() => {
    if (phase !== 'annotating') { setCardIn(false); return; }
    const id = requestAnimationFrame(() => setCardIn(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  // ── Selecting-phase pointer handlers ────────────────────────────────────
  const onMove = (e: React.MouseEvent) => {
    if (phase !== 'selecting') return;
    if (dragRef.current) {
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
    const el = elementUnder(e.clientX, e.clientY);
    if (!el) { setHover(null); return; }
    const r = el.getBoundingClientRect();
    setHover({
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
      selector: getStableSelector(el),
    });
  };

  const onDown = (e: React.MouseEvent) => {
    if (phase !== 'selecting' || e.button !== 0) return;
    dragRef.current = { x0: e.clientX, y0: e.clientY, rect: null };
  };

  const onUp = (e: React.MouseEvent) => {
    if (phase !== 'selecting' || e.button !== 0) return;
    const d = dragRef.current;
    dragRef.current = null;
    const moved =
      d !== null &&
      Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > DRAG_THRESHOLD;

    if (moved && d) {
      const rect: QaRect = {
        left: Math.min(d.x0, e.clientX),
        top: Math.min(d.y0, e.clientY),
        width: Math.abs(e.clientX - d.x0),
        height: Math.abs(e.clientY - d.y0),
      };
      setDrag(null);
      void beginAnnotation({ kind: 'region', rect });
    } else {
      const el = elementUnder(e.clientX, e.clientY);
      if (!el) return;
      const r = el.getBoundingClientRect();
      void beginAnnotation({
        kind: 'element',
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        selector: getStableSelector(el),
        text: ((el as HTMLElement).innerText ?? el.textContent ?? '').trim().slice(0, 120),
        tagName: el.tagName.toLowerCase(),
      });
    }
  };

  // ── Keyboard: Esc cancels; ⌘/Ctrl+Enter saves ───────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); endCapture(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [endCapture]);

  // Focus textarea when annotation card opens
  useEffect(() => {
    if (phase === 'annotating' && taRef.current) taRef.current.focus();
  }, [phase]);

  // Revoke shot URL on unmount
  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

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
    };
    await addNote({ description, screenshot: shot ?? undefined, target });
    endCapture();
  };

  // ── Popover placement ───────────────────────────────────────────────────
  const popStyle: React.CSSProperties = (() => {
    if (!selection || typeof window === 'undefined') return {};
    const r = selection.rect;
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
  })();

  const activeRect = drag?.rect ?? selection?.rect ?? hover?.rect ?? null;
  const isRegion = !!drag?.rect || selection?.kind === 'region';

  return (
    <div data-qa-overlay="true">
      {/* ── Dimmed interceptor ───────────────────────────────────────────── */}
      <div
        ref={layerRef}
        onMouseMove={onMove}
        onMouseDown={onDown}
        onMouseUp={onUp}
        className="qa-fixed qa-inset-0 qa-z-10090"
        style={{
          cursor: phase === 'selecting' ? 'crosshair' : 'default',
          background: 'rgba(58,42,46,0.18)',
        }}
      />

      {/* ── Hint bar ────────────────────────────────────────────────────── */}
      {phase === 'selecting' && (
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
            className="qa-ms-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-xs qa-hover-bg-white-15"
            style={{ background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            Esc
          </button>
        </div>
      )}

      {/* ── Selection / hover highlight ──────────────────────────────────── */}
      {activeRect && (
        <div
          className="qa-fixed qa-z-10092 qa-rounded"
          style={{
            top: activeRect.top,
            left: activeRect.left,
            width: activeRect.width,
            height: activeRect.height,
            pointerEvents: 'none',
            outline: `2px ${isRegion ? 'dashed' : 'solid'} ${theme.accent}`,
            outlineOffset: '1px',
            background: `${theme.accent}1f`,
            boxShadow:
              phase === 'annotating'
                ? '0 0 0 9999px rgba(58,42,46,0.28)'
                : 'none',
          }}
        >
          {/* element selector label */}
          {phase === 'selecting' && hover?.selector && !drag && (
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
              className="qa-ms-auto qa-opacity-80 qa-hover-opacity-100"
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
                className="qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-text-white"
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
                className="qa-rounded-lg qa-border qa-px-3 qa-py-2 qa-text-sm"
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
