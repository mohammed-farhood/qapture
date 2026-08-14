/**
 * scrollLock.ts — freeze page scrolling while a capture is in flight.
 *
 * WHY THE PADDING COMPENSATION (v0.4)
 * -----------------------------------
 * Setting `overflow:hidden` on <html> removes the classic scrollbar, which
 * WIDENS the layout viewport by the scrollbar's width (~15px on desktop
 * Windows/Linux, and on macOS whenever "always show scrollbars" is on).
 * Every centred container, every responsive breakpoint near the boundary, and
 * every right-anchored element then moves — *after* the tester has already
 * measured the rect they want captured, and *before* the screenshot renders.
 * That silently mis-framed screenshots on exactly the pages most likely to
 * have a scrollbar: long ones.
 *
 * So the lock now adds back the exact width it removed as padding, keeping
 * the content box the same size it was when the rect was measured.
 */

let lockCount = 0;
let prevHtmlOverflow = '';
let prevBodyOverflow = '';
let prevHtmlPaddingRight = '';
let compensated = false;

/** Width of the classic scrollbar currently occupying viewport space. */
function scrollbarWidth(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const doc = document.documentElement;
  if (!doc) return 0;
  return Math.max(0, window.innerWidth - doc.clientWidth);
}

export function lockPageScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    const gap = scrollbarWidth();

    prevHtmlOverflow = html.style.overflow;
    prevBodyOverflow = body ? body.style.overflow : '';
    prevHtmlPaddingRight = html.style.paddingRight;
    compensated = gap > 0;

    if (compensated) {
      // Read the resolved padding first so we ADD to whatever the page set,
      // rather than replacing it.
      const current = parseFloat(getComputedStyle(html).paddingRight) || 0;
      html.style.paddingRight = `${current + gap}px`;
    }
    html.style.overflow = 'hidden';
    if (body) body.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockPageScroll(): void {
  if (typeof document === 'undefined' || lockCount === 0) return;
  lockCount--;
  if (lockCount === 0) {
    document.documentElement.style.overflow = prevHtmlOverflow;
    if (compensated) {
      document.documentElement.style.paddingRight = prevHtmlPaddingRight;
      compensated = false;
    }
    if (document.body) document.body.style.overflow = prevBodyOverflow;
  }
}
