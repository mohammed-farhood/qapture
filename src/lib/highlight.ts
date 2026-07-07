/**
 * highlight.ts — briefly flash a highlight box over a captured target so a
 * developer can see exactly where it is on the page.
 *
 * Creates a LIGHT-DOM <div> appended to document.body (not inside the shadow
 * root) so it always renders above everything. Carries data-qa-overlay so it
 * is excluded from html2canvas captures.
 *
 * SSR-safe: all paths guard typeof document.
 * Colours come from the `colors` argument (the caller passes theme.primary /
 * theme.accent from useQa().theme). CSS custom properties are only used as a
 * last-resort fallback for any colour not supplied — the flash box is a
 * light-DOM sibling of the shadow host, not a descendant, so the host-scoped
 * --qa-primary/--qa-accent custom properties never actually reach it via
 * document.documentElement.
 */

import type { QaTarget } from '../context/QaContext';

/**
 * Optional scroll snapshot captured alongside a region rect (kind: 'region').
 * Not (yet) part of the shared QaTarget type, so it's read defensively here —
 * this activates automatically once capture-time code starts persisting it
 * onto the target.
 */
type ScrollSnapshot = { x: number; y: number };

type FlashColors = { primary?: string; accent?: string };

const SETTLE_TIMEOUT_MS = 400;

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

function paint(
  rect: { top: number; left: number; width: number; height: number },
  colors?: FlashColors,
): void {
  if (typeof document === 'undefined') return;
  if (!rect || rect.width < 1 || rect.height < 1) return;

  const accent  = colors?.accent  ?? readCssVar('--qa-accent',  '#7c3aed');
  const primary = colors?.primary ?? readCssVar('--qa-primary', '#4f46e5');

  const box = document.createElement('div');
  box.setAttribute('data-qa-overlay', 'true');
  Object.assign(box.style, {
    position:     'fixed',
    top:          `${rect.top}px`,
    left:         `${rect.left}px`,
    width:        `${rect.width}px`,
    height:       `${rect.height}px`,
    zIndex:       '10098',
    pointerEvents:'none',
    borderRadius: '3px',
    outline:      `3px solid ${accent}`,
    background:   `${accent}22`,
    boxShadow:    `0 0 0 4px ${primary}55`,
    transition:   'opacity 0.45s ease',
    opacity:      '1',
  });

  document.body.appendChild(box);
  setTimeout(() => { box.style.opacity = '0'; }, 1000);
  setTimeout(() => { if (box.parentNode) box.remove(); }, 1500);
}

/**
 * Waits for `el`'s position to stop moving before painting the highlight box.
 * `scrollIntoView({ block: 'center', inline: 'center' })` can trigger a CSS
 * scroll-behavior:smooth animation that runs for hundreds of ms — painting
 * one requestAnimationFrame later (the old behaviour) stamps the box at a
 * pre-scroll/mid-scroll position. Instead, poll getBoundingClientRect() every
 * frame until it stays unchanged for 2 consecutive frames, capped at
 * SETTLE_TIMEOUT_MS so a page that never settles still paints eventually.
 */
function settleThenPaint(el: Element, colors?: FlashColors): void {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const start = now();
  let last: DOMRect | null = null;
  let stableFrames = 0;

  const tick = () => {
    const r = el.getBoundingClientRect();
    const unchanged =
      !!last &&
      r.top === last.top &&
      r.left === last.left &&
      r.width === last.width &&
      r.height === last.height;
    stableFrames = unchanged ? stableFrames + 1 : 0;
    last = r;

    if (stableFrames >= 2 || now() - start >= SETTLE_TIMEOUT_MS) {
      paint({ top: r.top, left: r.left, width: r.width, height: r.height }, colors);
      return;
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

/**
 * Flash a highlight box over a captured target.
 * Tries the live element via selector first; falls back to the stored rect
 * (region-kind selections — freeform drag rects — never have a selector).
 * For a rect fallback, corrects for any scrolling that happened since
 * capture using the target's persisted scroll snapshot, when present.
 *
 * @param target - the QaTarget to locate
 * @param colors - primary/accent colours to paint with, normally
 *                 `{ primary: theme.primary, accent: theme.accent }` from the
 *                 caller's useQa().theme. Any colour left unset falls back to
 *                 the --qa-primary / --qa-accent CSS custom properties (or
 *                 hardcoded defaults).
 */
export function flashLocate(target: QaTarget | null, colors?: FlashColors): void {
  if (typeof document === 'undefined' || !target) return;

  let el: Element | null = null;
  if (target.selector) {
    try { el = document.querySelector(target.selector); } catch { el = null; }
  }

  if (el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    settleThenPaint(el, colors);
  } else if (target.rect) {
    let rect = target.rect;
    const snap = (target as QaTarget & { scroll?: ScrollSnapshot }).scroll;
    if (snap) {
      const dx = window.scrollX - snap.x;
      const dy = window.scrollY - snap.y;
      if (dx || dy) {
        rect = { ...rect, left: rect.left - dx, top: rect.top - dy };
      }
    }
    paint(rect, colors);
  }
}
