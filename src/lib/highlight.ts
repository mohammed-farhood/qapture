/**
 * highlight.ts — briefly flash a highlight box over a captured target so a
 * developer can see exactly where it is on the page.
 *
 * Creates a LIGHT-DOM <div> appended to document.body (not inside the shadow
 * root) so it always renders above everything. Carries data-qa-overlay so it
 * is excluded from html2canvas captures.
 *
 * SSR-safe: all paths guard typeof document.
 * No import from qa.config — colours are read from CSS custom properties
 * set on documentElement (or from the optional `color` argument).
 */

import type { QaTarget } from '../context/QaContext';

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

function paint(
  rect: { top: number; left: number; width: number; height: number },
  color?: string,
): void {
  if (typeof document === 'undefined') return;
  if (!rect || rect.width < 1 || rect.height < 1) return;

  const accent  = color ?? readCssVar('--qa-accent',  '#7c3aed');
  const primary = readCssVar('--qa-primary', '#4f46e5');

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
 * Flash a highlight box over a captured target.
 * Tries the live element via selector first; falls back to the stored rect.
 *
 * @param target - the QaTarget to locate
 * @param color  - optional accent colour override (defaults to --qa-accent)
 */
export function flashLocate(target: QaTarget | null, color?: string): void {
  if (typeof document === 'undefined' || !target) return;

  let el: Element | null = null;
  if (target.selector) {
    try { el = document.querySelector(target.selector); } catch { el = null; }
  }

  if (el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    requestAnimationFrame(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      paint({ top: r.top, left: r.left, width: r.width, height: r.height }, color);
    });
  } else if (target.rect) {
    paint(target.rect, color);
  }
}
