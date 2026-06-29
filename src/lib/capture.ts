/**
 * capture.ts — crop a screenshot of a page region using html2canvas
 * (dynamically imported so it stays out of the normal bundle). The QA overlay's
 * own UI is excluded from the capture via the data-qa-overlay marker.
 *
 * Coordinates are VIEWPORT coords (getBoundingClientRect-style). We convert to
 * document coords for html2canvas by adding scrollX/scrollY.
 *
 * SSR-safe: returns null when document / window are unavailable.
 */

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
 * @returns PNG Blob, or null if capture fails or SSR
 */
export async function captureRegion(rect: {
  top: number;
  left: number;
  width: number;
  height: number;
}): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  if (!rect || rect.width < 2 || rect.height < 2) return null;

  try {
    const { default: html2canvas } = await import('html2canvas');
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = await html2canvas(document.body, {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
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
