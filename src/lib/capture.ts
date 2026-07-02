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
 * @returns PNG Blob, or null if capture fails or SSR
 */
export async function captureRegion(
  rect: QaRect,
  scroll?: { x: number; y: number }
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  if (!rect || rect.width < 2 || rect.height < 2) return null;

  // Snapshot the scroll position now (before the async import below) so a
  // caller-supplied snapshot — or this fallback — can't be shifted by scroll
  // that happens while html2canvas is loading.
  const sx = scroll?.x ?? window.scrollX;
  const sy = scroll?.y ?? window.scrollY;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = await html2canvas(document.body, {
      x: sx + rect.left,
      y: sy + rect.top,
      width: rect.width,
      height: rect.height,
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
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
    });
    return await toBlob(canvas);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[QA] region capture failed:', err);
    return null;
  }
}
