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
 * NOTE: data-qa-overlay is shared by every top-level widget piece (FAB, panel,
 * notice host, test-along HUD, this component, and highlight.ts's flash box)
 * purely for that exclusion purpose — it does NOT uniquely identify this
 * component's own subtree, since document order puts <QaFab> and friends
 * before this component (see QaRoot.tsx). Consumers that need to scope
 * specifically to "is this element inside CaptureMode's own overlay" (e.g.
 * the focus-trap test) must use the more specific `data-qa-capture-root`
 * attribute on the outer div immediately below instead.
 *
 * Ported from CaptureMode.jsx:
 *  - framer-motion removed → CSS card-anim / card-in classes for fade-in
 *  - THEME import removed → useQa().theme
 *  - lucide-react → Icon
 *  - Tailwind classes → qa-* equivalents
 *
 * v0.3 "Graphite" (this file):
 *  - `theme` is gone from useQa() entirely — every colour below is a fixed
 *    design token (var(--qa-*)) or one of styles.ts's semantic utility
 *    classes, never a value read from context.
 *  - Severity chip row (bug/question/polish, default 'bug') in the
 *    annotation card, threaded into addNote()'s `severity` field.
 *  - collectTargetForensics(el) runs the moment an 'element' (not 'region')
 *    target is picked, and its result rides in local state to save() as
 *    addNote()'s `forensics` field.
 *  - clampRegionRect() floors every region rect to 8×8 and clamps it inside
 *    the viewport, applied at drag-normalization time and on every touch
 *    resize/move tick; a raw drag that's tiny on BOTH axes falls back to an
 *    element-click selection instead of forcing a degenerate region.
 *
 * v0.4 "Ledger" (this file):
 *  - COMPACT MODE. When `compactCapture` is on, the annotation step is a small
 *    box beside the selection — a textarea and a send button — instead of the
 *    full card. Enter saves. The screenshot and the location are still
 *    captured; only the chrome (preview, location reveal, severity row) is
 *    hidden, and `expanded` brings it back for a single note without changing
 *    the saved preference. Minimizing the full card sets the preference, so
 *    "shrink it once" means "stay small".
 *  - The hint bar offers the pixel-exact screenshot opt-in, deliberately
 *    placed where a mis-framed screenshot is actually noticed. The click
 *    doubles as the user gesture getDisplayMedia requires.
 *  - captureRegion() now picks between the exact and DOM engines itself (see
 *    lib/capture.ts); nothing in this file changes per engine.
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
import { Icon, type IconName } from '../icons/Icon';
import { captureRegion } from '../lib/capture';
import { getStableSelector } from '../lib/selector';
import { useCoarsePointer } from '../lib/coarse';
import { lockPageScroll, unlockPageScroll } from '../lib/scrollLock';
import { collectTargetForensics, type QaTargetForensics } from '../lib/contextBuffer';
import LocationReveal from './LocationReveal';
import ShotAnnotator from './ShotAnnotator';

const DRAG_THRESHOLD = 6; // px before a mouse press becomes a region drag
const TOUCH_DRAG_THRESHOLD = 12; // px before a touch press becomes a region drag
const MIN_REGION_SIZE = 8; // px floor when resizing a region candidate

/** Severity a tester can tag onto a note — mirrors QaNote['severity']. */
type Severity = 'bug' | 'question' | 'polish';
const SEVERITIES: readonly Severity[] = ['bug', 'question', 'polish'];
const SEVERITY_ICON: Record<Severity, IconName> = {
  bug: 'Bug',
  question: 'AlertTriangle',
  polish: 'Pencil',
};
const SEVERITY_LABEL_KEY: Record<Severity, string> = {
  bug: 'sev_bug',
  question: 'sev_question',
  polish: 'sev_polish',
};

/**
 * Floor a candidate/drag rect to a sane minimum (8×8) and clamp it fully
 * inside the current viewport. Applied both when a mouse/touch drag is
 * normalized into a region rect (onPointerUp) and on every touch resize/move
 * tick (onHandlePointerMove), so a region candidate can never end up
 * degenerate or drift off-screen.
 */
function clampRegionRect(rect: QaRect): QaRect {
  const vw = typeof window !== 'undefined' ? window.innerWidth : rect.left + rect.width;
  const vh = typeof window !== 'undefined' ? window.innerHeight : rect.top + rect.height;
  const width = Math.min(Math.max(MIN_REGION_SIZE, rect.width), Math.max(MIN_REGION_SIZE, vw));
  const height = Math.min(Math.max(MIN_REGION_SIZE, rect.height), Math.max(MIN_REGION_SIZE, vh));
  const left = Math.min(Math.max(0, rect.left), Math.max(0, vw - width));
  const top = Math.min(Math.max(0, rect.top), Math.max(0, vh - height));
  return { top, left, width, height };
}

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

/**
 * The whole visible page as a selection.
 *
 * Dragging a box across the entire screen to say "all of it" is a chore, and
 * on a laptop it is genuinely awkward — the drag has to start in a corner
 * that is often already covered by something. This is the same region
 * capture, pre-sized.
 */
function viewportSelection(): Selection {
  return {
    kind: 'region',
    rect: {
      top: 0,
      left: 0,
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
    },
  };
}

export default function CaptureMode() {
  const {
    addNote, endCapture, t, dir,
    compactCapture, setCompactCapture,
    exactShots, enableExactShots,
    capturePrefill,
  } = useQa();
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
  // Distinguishes a BROKEN render (html2canvas threw/timed out — worth a
  // Retry) from a degenerate selection that never attempted one (shows the
  // plain no_shot copy, since retrying would fail identically).
  const [captureError, setCaptureError] = useState(false);
  // Seeded from context so the error catcher can open capture with the error
  // already written in. This component only exists while capture is active,
  // so the initial value applies exactly once per capture session.
  const [description, setDescription] = useState(capturePrefill);
  const [severity, setSeverity] = useState<Severity>('bug');
  // Forensics for the DOM element behind the CURRENT selection/candidate —
  // collected the moment an 'element' (not 'region') target is picked, and
  // threaded through local state to save() since save() no longer has a
  // live element reference by then.
  const [targetForensics, setTargetForensics] = useState<QaTargetForensics | undefined>(undefined);
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

  // Drawing on the shot is opt-in and never blocks the flow: the tester taps
  // the preview they already have in front of them (v0.5).
  const [drawing, setDrawing] = useState(false);

  // Compact mode: a small box next to the selection instead of the full card.
  // `compactCapture` is the tester's saved preference; `expanded` is a
  // per-selection override, so "show me the full card just for this one" is a
  // single click and doesn't change the default.
  const [expanded, setExpanded] = useState(!compactCapture);
  const compact = compactCapture && !expanded;

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

  // ── Screenshot render ────────────────────────────────────────────────────
  // Split out from beginAnnotation so Retry can re-run it against the SAME
  // selection without disturbing the annotation the tester has already typed.
  const runCapture = useCallback(async (rect: QaRect) => {
    setCapturing(true);
    setCaptureError(false);
    lockPageScroll();
    try {
      const outcome = await captureRegion(rect, scrollSnap.current);
      const blob = outcome.status === 'ok' ? outcome.blob : null;
      // Create the object URL unconditionally once we have a blob — this
      // async chain (dynamic import(html2canvas) + a real canvas render)
      // may well finish AFTER Escape has already cancelled and unmounted
      // this component. Only the destination for that URL depends on
      // mount state below: never setState on an unmounted component, and
      // never leave the blob: URL registration dangling either way.
      const url = blob ? URL.createObjectURL(blob) : null;

      if (!mountedRef.current) {
        // Component is gone — nothing to show this to. Revoke immediately
        // instead of orphaning the blob: URL (it isn't reclaimed by normal
        // GC; only an explicit revoke frees it).
        if (url) URL.revokeObjectURL(url);
        return;
      }

      setCaptureError(outcome.status === 'failed');
      setShot(blob);
      setShotUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } finally {
      unlockPageScroll();
      if (mountedRef.current) setCapturing(false);
    }
  }, []);

  // ── Begin annotation phase ───────────────────────────────────────────────
  const beginAnnotation = useCallback(async (sel: Selection) => {
    setSelection(sel);
    setCandidate(null);
    setHover(null);
    setRegionMode(false);
    setSeverity('bug'); // fresh selection → fresh default severity
    setExpanded(!compactCapture); // a new selection returns to the preference
    setPhase('annotating');
    setCardIn(false); // reset: card will fade in on next frame
    await runCapture(sel.rect);
  }, [runCapture, compactCapture]);

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
    setDrag(null);
    const threshold = pointerKind.current === 'mouse' ? DRAG_THRESHOLD : TOUCH_DRAG_THRESHOLD;
    const moved = d !== null && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > threshold;
    scrollSnap.current = { x: window.scrollX, y: window.scrollY };

    // A drag past the pointer-distance threshold can STILL be a degenerate
    // rect on one axis (fast diagonal movement). Only treat it as a region
    // once clampRegionRect has something meaningful to clamp — a raw rect
    // that's tiny on BOTH axes falls through to the plain element-click path
    // below instead of being forced up into a fake 8×8 region.
    let regionRect: QaRect | null = null;
    if (moved && d) {
      const rawRect: QaRect = {
        left: Math.min(d.x0, e.clientX),
        top: Math.min(d.y0, e.clientY),
        width: Math.abs(e.clientX - d.x0),
        height: Math.abs(e.clientY - d.y0),
      };
      if (rawRect.width >= MIN_REGION_SIZE || rawRect.height >= MIN_REGION_SIZE) {
        regionRect = clampRegionRect(rawRect);
      }
    }

    if (regionRect) {
      const sel: Selection = { kind: 'region', rect: regionRect };
      setTargetForensics(undefined); // regions have no single DOM target to inspect
      if (coarse) {
        setCandidate(sel);
        setPhase('confirming');
      } else {
        void beginAnnotation(sel);
      }
      return;
    }

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
    setTargetForensics(collectTargetForensics(el));
    if (coarse) {
      setCandidate(sel);
      setHover({ rect: sel.rect, selector: sel.selector || '' });
      setPhase('confirming');
    } else {
      void beginAnnotation(sel);
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

    // Track the moving edge(s) against the FIXED opposite edge(s) — deriving
    // width/height from raw (possibly edge-flipped) coordinates, same
    // Math.min/abs normalization used by the desktop/touch drag-select path.
    // clampRegionRect() below is what enforces the 8×8 floor + viewport
    // bounds, so nothing here needs its own ad-hoc clamping.
    let top = startRect.top;
    let left = startRect.left;
    let right = startRect.left + startRect.width;
    let bottom = startRect.top + startRect.height;

    if (edge === 'move') {
      left = startRect.left + dx;
      top = startRect.top + dy;
      right = left + startRect.width;
      bottom = top + startRect.height;
    } else {
      if (edge.includes('e')) right += dx;
      if (edge.includes('w')) left += dx;
      if (edge.includes('s')) bottom += dy;
      if (edge.includes('n')) top += dy;
    }

    const rawRect: QaRect = {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      width: Math.abs(right - left),
      height: Math.abs(bottom - top),
    };

    const rect = clampRegionRect(rawRect);
    setCandidate((prev) => (prev ? { ...prev, rect } : prev));
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
      // Shadow-DOM-safe focus check: document.activeElement only reports the
      // shadow HOST when focus is inside a shadow tree, so ask the overlay
      // root's own root (the ShadowRoot in production) which of its
      // descendants — if any — is actually focused. (Same pattern as
      // QaPanel.tsx's keyboard-avoidance focus check.)
      const rootNode = root.getRootNode() as Document | ShadowRoot;
      const active = rootNode.activeElement as HTMLElement | null;
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
    await addNote({
      description,
      screenshot: shot ?? undefined,
      target,
      severity,
      forensics: selection.kind === 'element' ? targetForensics : undefined,
    });
    endCapture();
  };

  // ── Popover placement (reused for the annotating card + confirm toolbar) ─
  //
  // The annotation card's real height varies a lot (screenshot preview,
  // location-reveal toggle, severity chips, description, footer) and grows
  // over time as features are added — a fixed height guess here previously
  // decided "does it fit below?" and got that wrong once the card grew past
  // the guess, placing it below an element that was itself already low on
  // the page. The result: the card's footer (Save/Cancel) rendered past the
  // bottom of the viewport with no way to reach it — capture-mode locks page
  // scroll (see lockPageScroll() below), and the card itself had no internal
  // scroll of its own, so it was genuinely stuck off-screen.
  //
  // Fixed two ways, belt-and-suspenders like clampRegionRect() above:
  //  1. Pick whichever side (above/below the target) has MORE room, instead
  //     of guessing a fixed card height — this is right far more often.
  //  2. Independent of that guess, cap maxHeight to whatever room is
  //     actually available on the chosen side and let the card scroll
  //     internally (see the qa-overflow-y-auto class below) — so even a
  //     wrong above/below guess, or a card taller than fits either way,
  //     never leaves any part of it unreachable.
  const popStyleFor = useCallback((r: QaRect, cardWidth = 340): React.CSSProperties => {
    if (typeof window === 'undefined') return {};
    const margin = 12;
    const spaceBelow = window.innerHeight - (r.top + r.height + margin);
    const spaceAbove = r.top - margin;

    // A selection that fills the viewport — "Whole screen", or a region
    // dragged edge to edge — leaves NO room on either side, and anchoring to
    // it would push the card off the top of the screen with the Save button
    // unreachable (the same failure 0.3.1 fixed for tall cards, arriving by a
    // different route). When neither side has room, float the card near the
    // top instead: it overlaps the selection, which is exactly what the
    // tester already framed and can still see behind it.
    const MIN_ROOM = 120;
    if (Math.max(spaceAbove, spaceBelow) < MIN_ROOM) {
      let left = Math.min(r.left, window.innerWidth - cardWidth);
      left = Math.max(margin, left);
      return {
        top: margin * 2,
        left,
        maxHeight: `${Math.max(MIN_ROOM, window.innerHeight - margin * 4)}px`,
      };
    }

    const placeAbove = spaceBelow < spaceAbove;
    const top = placeAbove ? Math.max(margin, r.top - margin) : r.top + r.height + margin;
    let left = r.left;
    left = Math.min(left, window.innerWidth - cardWidth);
    left = Math.max(margin, left);
    const available = (placeAbove ? spaceAbove : spaceBelow) - margin;
    return {
      top,
      left,
      transform: placeAbove ? 'translateY(-100%)' : 'none',
      maxHeight: `max(${margin * 4}px, ${Math.max(0, available)}px)`,
    };
  }, []);

  const popStyle = selection ? popStyleFor(selection.rect, compact ? 296 : 340) : {};
  const confirmPopStyle = candidate ? popStyleFor(candidate.rect) : {};

  const activeRect = drag?.rect ?? candidate?.rect ?? selection?.rect ?? hover?.rect ?? null;
  const isRegion = !!drag?.rect || candidate?.kind === 'region' || selection?.kind === 'region';
  const confirmingRegion = phase === 'confirming' && candidate?.kind === 'region' && coarse;

  return (
    <div data-qa-overlay="true" data-qa-capture-root="true" ref={overlayRootRef}>
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
          background: 'var(--qa-scrim-capture)',
        }}
      />

      {/* ── Hint bar (desktop) ──────────────────────────────────────────── */}
      {phase === 'selecting' && !coarse && (
        <div
          className="qa-fixed qa-left-half qa-top-4 qa-z-10095 qa-translate-x-neg-half qa-flex qa-items-center qa-gap-3 qa-rounded-full qa-border qa-border-subtle qa-bg-2 qa-px-4 qa-py-2 qa-text-sm qa-text-hi qa-elev-2"
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
          <span className="qa-opacity-50">·</span>
          <button
            onClick={() => {
              scrollSnap.current = { x: window.scrollX, y: window.scrollY };
              setTargetForensics(undefined);
              void beginAnnotation(viewportSelection());
            }}
            className="qa-tap qa-flex qa-items-center qa-gap-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-11 qa-text-hi qa-hover-bg-white-15"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            <Icon name="Maximize2" size={13} />
            {t('capture_screen')}
          </button>

          {/* Pixel-exact opt-in, offered exactly where a mis-framed shot is
              noticed. The click is the user gesture getDisplayMedia needs. */}
          {exactShots.supported && (
            exactShots.status === 'live' ? (
              <span
                className="qa-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-2 qa-py-0.5 qa-text-11"
                style={{ background: 'var(--qa-success-tint)', color: 'var(--qa-success)' }}
                title={t('exact_on')}
              >
                <Icon name="Camera" size={13} />
              </span>
            ) : (
              <button
                onClick={() => void enableExactShots()}
                title={t('exact_hint')}
                className="qa-tap qa-flex qa-items-center qa-gap-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-11 qa-text-hi qa-hover-bg-white-15"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                <Icon name="Camera" size={13} />
                {t('exact_label')}
              </button>
            )
          )}
          <button
            onClick={() => endCapture()}
            className="qa-tap-icon qa-ms-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-xs qa-text-hi qa-hover-bg-white-15"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            Esc
          </button>
        </div>
      )}

      {/* ── Hint bar (touch) ────────────────────────────────────────────── */}
      {phase === 'selecting' && coarse && (
        <div
          className="qa-fixed qa-left-half qa-top-4 qa-z-10095 qa-translate-x-neg-half qa-flex qa-items-center qa-gap-3 qa-rounded-full qa-border qa-border-subtle qa-bg-2 qa-px-4 qa-py-2 qa-text-sm qa-text-hi qa-elev-2"
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
            onClick={() => {
              scrollSnap.current = { x: window.scrollX, y: window.scrollY };
              setTargetForensics(undefined);
              void beginAnnotation(viewportSelection());
            }}
            className="qa-tap qa-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-2 qa-py-0.5 qa-text-xs"
            style={{ border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
          >
            <Icon name="Maximize2" size={14} />
            {t('capture_screen')}
          </button>
          <button
            onClick={() => endCapture()}
            className="qa-tap-icon qa-ms-1 qa-rounded-full qa-border qa-border-white-40 qa-px-2 qa-py-0.5 qa-text-xs qa-text-hi qa-hover-bg-white-15"
            style={{ background: 'transparent', cursor: 'pointer' }}
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
            outline: `2px ${isRegion ? 'dashed' : 'solid'} var(--qa-accent)`,
            outlineOffset: '1px',
            background: 'var(--qa-accent-tint)',
            boxShadow:
              phase === 'annotating'
                ? '0 0 0 9999px var(--qa-scrim-spot)'
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
                background: 'var(--qa-surface-3)',
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
                background: 'var(--qa-accent-active)',
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
                    background: 'var(--qa-accent-tint)',
                  }}
                >
                  <span
                    className="qa-rounded-full"
                    style={{
                      width: 16,
                      height: 16,
                      background: 'var(--qa-accent)',
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
          className="qa-fixed qa-z-10096 qa-flex qa-items-center qa-gap-2 qa-rounded-full qa-border qa-px-3 qa-py-2 qa-elev-2"
          style={{
            ...confirmPopStyle,
            background: 'var(--qa-surface-1)',
            borderColor: 'var(--qa-border-subtle)',
          }}
        >
          <button
            onClick={() => void beginAnnotation(candidate)}
            className="qa-tap qa-flex qa-items-center qa-gap-1.5 qa-rounded-full qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-bg-accent"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <Icon name="Check" size={16} />
            {t('use_this')}
          </button>
          <button
            onClick={() => {
              setCandidate(null);
              setHover(null);
              setPhase('selecting');
              setTargetForensics(undefined);
            }}
            className="qa-tap qa-rounded-full qa-border qa-border-subtle qa-px-3 qa-py-2 qa-text-sm qa-text-mid"
            style={{ background: 'transparent', cursor: 'pointer' }}
          >
            {t('adjust')}
          </button>
        </div>
      )}

      {/* ── Compact composer ─────────────────────────────────────────────── */}
      {/* The full card carries a screenshot preview, the location reveal and
          the severity row — everything you want when filing a considered bug,
          and everything in the way when you just want to type "this label is
          wrong" and move on. Compact mode is the second case: one box, next to
          what you picked. The screenshot is still captured, the location is
          still recorded; only the chrome is gone, and one click brings it
          back for this note. */}
      {phase === 'annotating' && selection && compact && (
        <div
          data-qa-overlay="true"
          dir={dir}
          className={`qa-fixed qa-z-10096 qa-overflow-hidden qa-rounded-xl qa-border qa-border-subtle qa-elev-3 qa-card-anim${cardIn ? ' qa-card-in' : ''}`}
          style={{
            ...popStyle,
            width: 280,
            background: 'var(--qa-surface-1)',
          }}
        >
          <div className="qa-flex qa-items-end qa-gap-1.5 qa-p-2">
            <textarea
              ref={taRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void save(); }
              }}
              rows={2}
              placeholder={t('annotate_placeholder')}
              className="qa-min-w-0 qa-flex-1 qa-rounded-lg qa-border qa-border-subtle qa-bg-0 qa-text-hi qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
              style={{ resize: 'none' }}
            />
            <button
              onClick={() => void save()}
              disabled={!description.trim()}
              title={t('save_point')}
              aria-label={t('save_point')}
              className="qa-tap-icon qa-rounded-lg qa-bg-accent"
              style={{ border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Send" size={15} />
            </button>
          </div>

          <div className="qa-flex qa-items-center qa-gap-2 qa-px-2 qa-pb-1.5 qa-text-10 qa-text-lo">
            {capturing ? (
              <span className="qa-flex qa-items-center qa-gap-1 qa-text-accent">
                <Icon name="Loader2" size={11} className="qa-animate-spin" />
                {t('capturing')}
              </span>
            ) : shotUrl ? (
              <span className="qa-flex qa-items-center qa-gap-1 qa-text-success">
                <Icon name="Check" size={11} />
                {selection.kind === 'region' ? t('sel_region') : t('sel_element')}
              </span>
            ) : (
              <span className="qa-truncate">{t('no_shot')}</span>
            )}
            <button
              onClick={() => setExpanded(true)}
              title={t('expand_card')}
              aria-label={t('expand_card')}
              className="qa-tap-icon qa-ms-auto qa-text-mid qa-hover-text-slate-600"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="Maximize2" size={12} />
            </button>
            <button
              onClick={() => endCapture()}
              aria-label={t('cancel')}
              className="qa-tap-icon qa-text-mid qa-hover-text-slate-600"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Icon name="X" size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Draw-on-screenshot editor ────────────────────────────────────── */}
      {drawing && shot && (
        <ShotAnnotator
          blob={shot}
          onCancel={() => setDrawing(false)}
          onDone={(next) => {
            setDrawing(false);
            setShot(next);
            setShotUrl((old) => {
              if (old) URL.revokeObjectURL(old);
              return URL.createObjectURL(next);
            });
          }}
        />
      )}

      {/* ── Inline annotation card ───────────────────────────────────────── */}
      {phase === 'annotating' && selection && !compact && (
        <div
          data-qa-overlay="true"
          dir={dir}
          className={`qa-fixed qa-z-10096 qa-w-320 qa-overflow-hidden qa-rounded-xl qa-border qa-border-subtle qa-elev-3 qa-card-anim${cardIn ? ' qa-card-in' : ''}`}
          style={{
            ...popStyle,
            // popStyle's maxHeight caps this to whatever room is actually
            // available above/below the target; overflowY lets the card
            // itself scroll internally rather than ever rendering content
            // (most importantly the Save button) somewhere the page's own
            // scroll — locked during capture — can't reach. overflowX stays
            // hidden so the qa-overflow-hidden class's rounded-corner
            // clipping is preserved on that axis.
            overflowY: 'auto',
            overflowX: 'hidden',
            background: 'var(--qa-surface-1)',
          }}
        >
          {/* card header */}
          <div className="qa-flex qa-items-center qa-gap-2 qa-px-3 qa-py-2 qa-bg-2 qa-border-b qa-border-subtle qa-text-hi">
            <Icon
              name={selection.kind === 'region' ? 'Square' : 'MousePointerClick'}
              size={16}
            />
            <span className="qa-text-xs qa-font-semibold">
              {selection.kind === 'region' ? t('sel_region') : t('sel_element')}
            </span>
            <button
              onClick={() => { setExpanded(false); setCompactCapture(true); }}
              title={t('collapse_card')}
              aria-label={t('collapse_card')}
              className="qa-tap-icon qa-ms-auto qa-opacity-80 qa-hover-opacity-100"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--qa-ink-hi)' }}
            >
              <Icon name="Minimize2" size={14} />
            </button>
            <button
              onClick={() => endCapture()}
              className="qa-tap-icon qa-opacity-80 qa-hover-opacity-100"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--qa-ink-hi)' }}
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
                borderColor: 'var(--qa-border-subtle)',
                background: 'var(--qa-surface-0)',
              }}
            >
              {capturing ? (
                <span className="qa-flex qa-items-center qa-gap-2 qa-py-4 qa-text-xs qa-text-accent">
                  <Icon name="Loader2" size={16} className="qa-animate-spin" />
                  {t('capturing')}
                </span>
              ) : shotUrl ? (
                <button
                  type="button"
                  onClick={() => setDrawing(true)}
                  title={t('draw_label')}
                  aria-label={t('draw_label')}
                  className="qa-relative qa-group qa-tap"
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  <img
                    src={shotUrl}
                    alt="capture"
                    className="qa-max-h-32 qa-rounded-md"
                  />
                  <span
                    className="qa-absolute qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-px-1.5 qa-py-0.5 qa-text-10"
                    style={{
                      bottom: 4,
                      insetInlineEnd: 4,
                      background: 'var(--qa-surface-1)',
                      color: 'var(--qa-ink-hi)',
                      border: '1px solid var(--qa-border-subtle)',
                    }}
                  >
                    <Icon name="Pencil" size={10} />
                    {t('draw_label')}
                  </span>
                </button>
              ) : captureError ? (
                // The render broke rather than being skipped — offer a retry
                // against the same selection instead of a dead-end message.
                <span className="qa-flex qa-flex-col qa-items-center qa-gap-2 qa-py-3">
                  <span className="qa-text-xs qa-text-red-600">{t('capture_failed')}</span>
                  <button
                    type="button"
                    onClick={() => selection && void runCapture(selection.rect)}
                    className="qa-tap qa-inline-flex qa-items-center qa-gap-1.5 qa-rounded-md qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-xs qa-text-mid qa-focus-ring"
                    // Without these the shadow root falls back to the UA's
                    // grey buttonface, which reads as "disabled" in dark mode —
                    // so the one control offered after a failure looked dead.
                    style={{ background: 'transparent', cursor: 'pointer' }}
                  >
                    <Icon name="RotateCcw" size={13} />
                    {t('retry')}
                  </button>
                </span>
              ) : (
                <span className="qa-py-4 qa-text-xs qa-text-slate-400">
                  {t('no_shot')}
                </span>
              )}
            </div>

            <LocationReveal target={selection as QaTarget} />

            {/* severity chip row — default 'bug', threaded into addNote on save */}
            <div
              role="group"
              aria-label={t('severity_label')}
              className="qa-flex qa-items-center qa-flex-wrap qa-gap-1.5"
            >
              <span className="qa-text-11 qa-text-mid qa-me-1">{t('severity_label')}</span>
              {SEVERITIES.map((sev) => {
                const active = severity === sev;
                const toneClass =
                  sev === 'bug'
                    ? 'qa-bg-danger-tint qa-text-danger'
                    : sev === 'question'
                      ? 'qa-bg-warn-tint qa-text-warn'
                      : 'qa-bg-accent-tint qa-text-accent';
                return (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSeverity(sev)}
                    aria-pressed={active}
                    className={`qa-tap qa-inline-flex qa-items-center qa-gap-1 qa-rounded-full qa-border qa-border-subtle qa-px-2 qa-py-1 qa-text-11 qa-focus-ring ${
                      active ? toneClass : 'qa-bg-2 qa-text-mid'
                    }`}
                    style={{ cursor: 'pointer' }}
                  >
                    <Icon name={SEVERITY_ICON[sev]} size={12} />
                    {t(SEVERITY_LABEL_KEY[sev])}
                  </button>
                );
              })}
            </div>

            <textarea
              ref={taRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
                // 1/2/3 set severity without leaving the keyboard — but only
                // with a modifier, since bare digits are text the tester is
                // trying to type ("2 items in cart").
                if ((e.altKey || e.metaKey || e.ctrlKey) && SEVERITIES[Number(e.key) - 1]) {
                  e.preventDefault();
                  setSeverity(SEVERITIES[Number(e.key) - 1]);
                }
              }}
              rows={3}
              placeholder={t('annotate_placeholder')}
              className="qa-w-full qa-resize-y qa-rounded-lg qa-border qa-border-subtle qa-bg-0 qa-text-hi qa-px-2 qa-py-1.5 qa-text-sm qa-focus-ring"
            />

            <div className="qa-flex qa-items-center qa-gap-2">
              <button
                onClick={() => void save()}
                disabled={!description.trim()}
                className="qa-tap qa-flex qa-flex-1 qa-items-center qa-justify-center qa-gap-1.5 qa-rounded-lg qa-px-3 qa-py-2 qa-text-sm qa-font-semibold qa-bg-accent"
                style={{ border: 'none', cursor: 'pointer' }}
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
                  setSeverity('bug');
                  setTargetForensics(undefined);
                }}
                className="qa-tap qa-rounded-lg qa-border qa-border-subtle qa-px-3 qa-py-2 qa-text-sm qa-text-mid"
                style={{ background: 'transparent', cursor: 'pointer' }}
              >
                {t('reselect')}
              </button>
            </div>

            <p className="qa-text-center qa-text-10 qa-text-slate-400">
              {t('save_hint')} · {t('severity_keys')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
