/**
 * scrollLock.ts — freeze page scrolling while a capture is in flight, WITHOUT
 * changing a single pixel of the page's layout.
 *
 * WHY THIS WAS REWRITTEN IN v0.4
 * ------------------------------
 * Until 0.3.x the lock was `overflow: hidden` on `<html>` and `<body>`. That
 * is the standard modal-dialog trick, and it is exactly wrong here, because
 * this lock runs in the moments BETWEEN the tester choosing a rectangle and
 * the screenshot being rendered — a window in which the page must not move.
 * It moved it two ways:
 *
 *  1. `position: sticky` elements UNSTICK. Making the root a non-scrolling
 *     box takes away the scrollport a stuck element is sticking to, so a
 *     header pinned at the top of the viewport jumps back to its natural
 *     place hundreds of pixels up the document. Measured directly: with the
 *     page scrolled to 1200px, a stuck header read `getBoundingClientRect()
 *     .top === 0` before the lock and `-1200` after it. Every screenshot
 *     taken near a sticky header was therefore a picture of a page that had
 *     silently rearranged itself — the single biggest cause of "the
 *     screenshot is not the part I selected", since sticky headers, toolbars
 *     and sidebars are in nearly every modern app.
 *  2. Removing the classic scrollbar WIDENS the layout viewport (by ~15px on
 *     Windows/Linux, and on macOS with "always show scrollbars"), which
 *     shifts every centred and responsive layout sideways.
 *
 * So the lock no longer touches CSS. It swallows the input events that cause
 * scrolling instead: `wheel` and `touchmove` in the capture phase with
 * `passive: false`. Nothing in the page's box model changes, sticky elements
 * stay stuck, and the rect the tester picked still means what it meant.
 *
 * Scope note: this blocks scrolling of inner `overflow:auto` containers too,
 * which is what we want — during the render, nothing on screen should move.
 * Keyboard scrolling is deliberately NOT blocked: the lock only spans the
 * render itself, and a blanket keydown swallow risks eating keystrokes meant
 * for the annotation box.
 */

let lockCount = 0;

function preventScroll(e: Event): void {
  // Only cancelable events can be prevented; a passive listener elsewhere in
  // the page may have already made this one non-cancelable.
  if (e.cancelable) e.preventDefault();
}

const LISTENER_OPTIONS: AddEventListenerOptions = { passive: false, capture: true };

export function lockPageScroll(): void {
  if (typeof window === 'undefined') return;
  if (lockCount === 0) {
    window.addEventListener('wheel', preventScroll, LISTENER_OPTIONS);
    window.addEventListener('touchmove', preventScroll, LISTENER_OPTIONS);
  }
  lockCount++;
}

export function unlockPageScroll(): void {
  if (typeof window === 'undefined' || lockCount === 0) return;
  lockCount--;
  if (lockCount === 0) {
    window.removeEventListener('wheel', preventScroll, LISTENER_OPTIONS);
    window.removeEventListener('touchmove', preventScroll, LISTENER_OPTIONS);
  }
}
