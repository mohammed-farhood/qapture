/**
 * capture.ts — crop a screenshot of a page region using html2canvas
 * (dynamically imported so it stays out of the normal bundle). The QA overlay's
 * own UI is excluded from the capture via the data-qa-overlay marker.
 *
 * Coordinates are VIEWPORT coords (getBoundingClientRect-style). We convert to
 * document coords for html2canvas by adding the scroll offset (sx/sy).
 *
 * iOS canvas-cap rationale (viewport-only rendering):
 *   html2canvas clones the target into an offscreen same-origin <iframe> sized
 *   windowWidth x windowHeight, then (per its own source, verified against the
 *   installed html2canvas@1.4.1) scrolls that clone to (scrollX, scrollY)
 *   before parsing so element positions land back in document-coordinate
 *   space — see Bounds.fromClientRect adding windowBounds.left/top, which is
 *   built from the same scrollX/scrollY/windowWidth/windowHeight options.
 *   iOS Safari caps any single rendering surface at ~16.7M pixels (4096x4096).
 *   Sizing that offscreen clone to the FULL document
 *   (documentElement.scrollWidth/scrollHeight, as this used to do) blows past
 *   that cap on any reasonably long page at scale=2, producing a blank/failed
 *   capture. Sizing it to the actual viewport (window.innerWidth/innerHeight)
 *   instead keeps the offscreen surface bounded by ~viewport*scale regardless
 *   of page length, while passing the matching scrollX/scrollY makes
 *   html2canvas scroll that viewport-sized clone to the right spot — so the
 *   final crop (x/y/width/height below) is unchanged for a given rect+scroll.
 *
 * SSR-safe: returns null when document / window are unavailable.
 */

import type { QaRect } from '../context/QaContext';

const HTML2CANVAS_TIMEOUT_MS = 10000;

/** Background used when the page declares no opaque background of its own. */
const FALLBACK_PAGE_BACKGROUND = '#ffffff';

/**
 * The result of a capture attempt.
 *  - 'ok'     → a PNG blob was produced
 *  - 'empty'  → nothing was attempted (SSR, or a degenerate sub-2px rect)
 *  - 'failed' → html2canvas threw, timed out, or toBlob() yielded null
 *
 * 'empty' and 'failed' are deliberately distinct: only 'failed' is worth
 * offering the tester a Retry for — 'empty' would fail again identically.
 */
export type CaptureOutcome =
  | { status: 'ok'; blob: Blob }
  | { status: 'empty' }
  | { status: 'failed' };

/**
 * Race a promise against a timeout, resolving to null if the timeout wins.
 * Used so a hung html2canvas() call (known to happen on pages with heavy
 * CSS filters/SVG/cross-origin images) can't leave capture mode stuck
 * forever — the caller's null-on-failure contract still holds.
 *
 * The timer is cleared in .finally() so a fast-resolving capture doesn't
 * leave a pending timeout holding the event loop open.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** True for `transparent` and any rgb()/rgba() colour with a zero alpha. */
function isTransparent(color: string): boolean {
  const c = (color || '').trim().toLowerCase();
  if (!c || c === 'transparent') return true;
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return false;
  // Handles both legacy `rgba(0, 0, 0, 0)` and modern `rgb(0 0 0 / 0)`.
  const parts = m[1].split(/[,/\s]+/).filter(Boolean);
  return parts.length >= 4 && parseFloat(parts[3]) === 0;
}

/**
 * The colour the captured region should be composited onto.
 *
 * html2canvas renders `document.body`, and passing `backgroundColor: null`
 * makes that render transparent. Most real sites paint their page background
 * on `<html>` (or on neither, relying on the browser's white default), NOT on
 * `<body>` — so a transparent render produced screenshots whose background was
 * empty pixels. A tight element crop hid it (the element covered the hole),
 * but a dragged region over page whitespace exported a fully blank PNG, and
 * every capture rendered wrongly against a dark viewer.
 *
 * So: use the first opaque background from body → documentElement, and fall
 * back to white, which is what the browser itself would paint.
 */
function resolvePageBackground(): string {
  if (typeof getComputedStyle !== 'function') return FALLBACK_PAGE_BACKGROUND;
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    try {
      const bg = getComputedStyle(el).backgroundColor;
      if (!isTransparent(bg)) return bg;
    } catch {
      // getComputedStyle can throw on detached/exotic nodes — keep looking.
    }
  }
  return FALLBACK_PAGE_BACKGROUND;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } else {
      // Safari fallback
      const dataUrl = canvas.toDataURL('image/png');
      const bin = atob(dataUrl.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type: 'image/png' }));
    }
  });
}

/**
 * Capture a rectangular region of the page as a PNG Blob.
 * @param rect - viewport coordinates (getBoundingClientRect-style)
 * @param scroll - page scroll offset (x/y) to treat as "now", snapshotted at
 *   selection time. Defaults to the current window scroll position when
 *   omitted. Passing an explicit snapshot keeps the crop correct even if
 *   momentum/inertial scrolling shifts the page while the html2canvas chunk
 *   is being dynamically imported.
 * @returns a CaptureOutcome — 'ok' with the PNG blob, 'empty' when nothing was
 *   attempted (SSR / degenerate rect), or 'failed' when the render broke.
 */
export async function captureRegion(
  rect: QaRect,
  scroll?: { x: number; y: number }
): Promise<CaptureOutcome> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { status: 'empty' };
  }
  if (!rect || rect.width < 2 || rect.height < 2) return { status: 'empty' };

  // Snapshot the scroll position now (before the async import below) so a
  // caller-supplied snapshot — or this fallback — can't be shifted by scroll
  // that happens while html2canvas is loading.
  const sx = scroll?.x ?? window.scrollX;
  const sy = scroll?.y ?? window.scrollY;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = await withTimeout(
      html2canvas(document.body, {
        x: sx + rect.left,
        y: sy + rect.top,
        width: rect.width,
        height: rect.height,
        scale,
        useCORS: true,
        allowTaint: true,
        // The page's own background, never null — see resolvePageBackground().
        backgroundColor: resolvePageBackground(),
        logging: false,
        scrollX: sx,
        scrollY: sy,
        // Viewport-only clone (not the full document) — see iOS canvas-cap
        // rationale above. Keeps the offscreen render surface ~viewport*scale.
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        ignoreElements: (el: Element) =>
          el.nodeType === 1 &&
          typeof (el as HTMLElement).hasAttribute === 'function' &&
          (el as HTMLElement).hasAttribute('data-qa-overlay'),
      }),
      HTML2CANVAS_TIMEOUT_MS
    );
    if (!canvas) return { status: 'failed' };
    const blob = await toBlob(canvas);
    return blob ? { status: 'ok', blob } : { status: 'failed' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[QA] region capture failed:', err);
    return { status: 'failed' };
  }
}
