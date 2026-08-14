/**
 * capture.ts — turn a selected viewport rect into a screenshot Blob.
 *
 * TWO ENGINES (v0.4)
 * ------------------
 *  1. 'exact'  — screenCapture.ts photographs this tab's real composited
 *                pixels and we crop the rect out arithmetically. What the
 *                tester framed is exactly what lands in the note. Needs a
 *                one-time "share this tab" grant, Chromium only.
 *  2. 'dom'    — html2canvas re-renders a clone of the DOM. Always available,
 *                no permission, but it is a *reconstruction*: anything the
 *                clone lays out differently shows up as a mis-framed shot.
 *
 * The DOM engine is still the fallback everywhere, so v0.4 fixes what it was
 * actually getting wrong. These were established by measurement, not
 * inspection — scripts/capture-accuracy-test.mjs drives real Chrome against
 * colour-boundary fixtures and reports the misalignment in pixels:
 *
 *  a. STUCK `position: sticky` ELEMENTS — the bug behind "the screenshot is
 *     not the part I selected" on a real app, measured at 20px of a 40px
 *     capture (half the image was of somewhere else). Two things caused it,
 *     and both had to go:
 *       • capture mode's own scroll lock used `overflow: hidden`, which takes
 *         away the scrollport sticky elements stick to — so every stuck
 *         header jumped back up the document *before* the render. Fixed in
 *         scrollLock.ts, which no longer touches CSS at all.
 *       • html2canvas doesn't implement sticky positioning either, so even an
 *         undisturbed stuck header renders at its natural position. Fixed by
 *         markStuckElements() below, which pins each one at its on-screen
 *         offset inside the clone.
 *     Sticky headers, toolbars and sidebars are near-universal in modern
 *     apps, which is why this read as "screenshots are just wrong".
 *
 *  b. VIEWPORT WIDTH — the old code passed `windowWidth: window.innerWidth`,
 *     which INCLUDES the classic scrollbar, while layout happens against the
 *     content box. Where the platform draws classic (space-taking)
 *     scrollbars — Windows, Linux, and macOS with "always show scrollbars" —
 *     that ~15px discrepancy shifts every centred or responsive layout
 *     sideways relative to the rect. It now passes
 *     documentElement.clientWidth/clientHeight, the box the live layout uses.
 *     (Not observable on macOS overlay scrollbars, where the two are equal —
 *     and note this matters MORE now that the lock leaves the scrollbar in
 *     place.)
 *
 *  c. CROPPING — html2canvas's own x/y/width/height crop is applied to a
 *     re-scrolled clone in document space. We now render the viewport once
 *     and crop with a plain 2D canvas, so the arithmetic is ours and
 *     verifiable.
 *
 * Things deliberately NOT "fixed", having been checked and found already
 * correct in html2canvas@1.4.1: inner `overflow:auto` scroll offsets (it
 * tracks these itself via its `scrolledElements` restore) and captures on a
 * scrolled page (measured at 0.0px error).
 *
 * What remains unfixable by cropping is everything the clone cannot
 * reproduce at all — canvas/WebGL, video, cross-origin iframes, unsupported
 * CSS. That is what the exact engine is for.
 *
 * Coordinates are VIEWPORT coords (getBoundingClientRect-style) throughout.
 *
 * SSR-safe: returns { status: 'empty' } when document / window are missing.
 */

import type { QaRect } from '../context/QaContext';
import { getExactCaptureStatus, grabExactRegion } from './screenCapture';

const HTML2CANVAS_TIMEOUT_MS = 10000;

/** Background used when the page declares no opaque background of its own. */
const FALLBACK_PAGE_BACKGROUND = '#ffffff';

/**
 * Longest edge (device px) a stored screenshot may have.
 *
 * Screenshots are ~99% of what Qapture keeps in IndexedDB, and a full-viewport
 * region on a retina laptop is ~2880px wide — several MB as PNG. That is what
 * pushed testers into "storage full" on deployed betas. Capping the long edge
 * plus WebP encoding below cuts a typical note's footprint by roughly an order
 * of magnitude while staying comfortably legible for both a human reviewer and
 * an agent reading the exported ZIP.
 */
const MAX_SHOT_EDGE = 1800;

/** WebP quality. High enough that UI text stays crisp; small enough to matter. */
const WEBP_QUALITY = 0.92;

/** Attribute used to ferry live sticky offsets into html2canvas's clone. */
const STUCK_ATTR = 'data-qa-stuck';

export type CaptureEngine = 'exact' | 'dom';

/**
 * The result of a capture attempt.
 *  - 'ok'     → a PNG/WebP blob was produced (`engine` says how)
 *  - 'empty'  → nothing was attempted (SSR, or a degenerate sub-2px rect)
 *  - 'failed' → the render broke, timed out, or encoding yielded null
 *
 * 'empty' and 'failed' are deliberately distinct: only 'failed' is worth
 * offering the tester a Retry for — 'empty' would fail again identically.
 */
export type CaptureOutcome =
  | { status: 'ok'; blob: Blob; engine: CaptureEngine }
  | { status: 'empty' }
  | { status: 'failed' };

/** Which engine a capture call may use. 'auto' prefers exact when it's live. */
export type CapturePreference = 'auto' | 'exact' | 'dom';

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

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

let webpSupported: boolean | null = null;

function supportsWebp(): boolean {
  if (webpSupported !== null) return webpSupported;
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    webpSupported = probe.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

/**
 * Downscale so the longest edge is at most MAX_SHOT_EDGE. Returns the input
 * untouched when it already fits (the common case for element captures).
 */
function fitToBudget(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= MAX_SHOT_EDGE) return canvas;
  const ratio = MAX_SHOT_EDGE / longest;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * ratio));
  out.height = Math.max(1, Math.round(canvas.height * ratio));
  const ctx = out.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b), type, quality);
      return;
    }
    // Safari fallback (very old builds): toDataURL always exists.
    try {
      const dataUrl = canvas.toDataURL(type, quality);
      const bin = atob(dataUrl.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type }));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Encode a captured canvas for storage: size-capped, WebP where available
 * (roughly 5–10× smaller than PNG for UI screenshots), PNG otherwise.
 *
 * Exported so NoteList's "replace image" path and the folder sync can reuse
 * exactly the same budget.
 */
export async function encodeShot(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const fitted = fitToBudget(canvas);
  if (supportsWebp()) {
    const webp = await canvasToBlob(fitted, 'image/webp', WEBP_QUALITY);
    if (webp && webp.size > 0) return webp;
  }
  return canvasToBlob(fitted, 'image/png');
}

/** File extension matching a screenshot blob's real type (png vs webp). */
export function shotExtension(blob: Blob | undefined | null): string {
  const type = blob?.type ?? '';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/jpeg') return 'jpg';
  return 'png';
}

// ---------------------------------------------------------------------------
// Overlay hiding (exact engine only — the DOM engine uses ignoreElements)
// ---------------------------------------------------------------------------

/**
 * Hide every top-level piece of QA UI, run `fn`, then restore.
 *
 * The exact engine photographs the real screen, so unlike html2canvas it has
 * no notion of "ignore this element" — the scrim, the selection outline and
 * the annotation card would all end up baked into the tester's screenshot.
 * Hiding is done with `visibility`, not `display`, so nothing in the host page
 * reflows while we do it.
 */
async function withOverlayHidden<T>(fn: () => Promise<T>): Promise<T> {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>('body > [data-qa-overlay]'),
  );
  const previous = hosts.map((el) => el.style.visibility);
  for (const el of hosts) el.style.visibility = 'hidden';
  try {
    return await fn();
  } finally {
    hosts.forEach((el, i) => { el.style.visibility = previous[i]; });
  }
}

// ---------------------------------------------------------------------------
// DOM engine
// ---------------------------------------------------------------------------

/**
 * Freeze every *stuck* `position: sticky` element at the place it is actually
 * being displayed.
 *
 * This is the one DOM-engine failure that reliably ruins a capture on a real
 * app. html2canvas does not implement sticky positioning: a header the tester
 * can see pinned to the top of the viewport is drawn back at its natural
 * document position — often hundreds of pixels away — so everything framed
 * near it comes out as bare page background. Verified against
 * html2canvas@1.4.1 with a real-browser fixture; scripts/capture-accuracy-
 * test.mjs measures the resulting error in pixels.
 *
 * The fix converts each sticky element into an absolutely-positioned one at
 * its current on-screen offset. Coordinates are taken relative to the
 * element's offsetParent, which is exactly the box CSS `top`/`left` resolve
 * against under `position: absolute`, so the clone lands it where the live
 * page has it. Offsets ride on an attribute because attributes survive
 * cloning, whereas inline styles on the live element would be visible to the
 * tester mid-capture.
 *
 * All reads happen before any write, so this costs a single layout pass.
 * Returns the touched elements for cleanup.
 */
function markStuckElements(): HTMLElement[] {
  let all: NodeListOf<HTMLElement>;
  try {
    all = document.body.querySelectorAll<HTMLElement>('*');
  } catch {
    return [];
  }

  const marks: { el: HTMLElement; value: string }[] = [];
  for (const el of Array.from(all)) {
    let position: string;
    try {
      position = getComputedStyle(el).position;
    } catch {
      continue;
    }
    if (position !== 'sticky') continue;
    if (el.closest('[data-qa-overlay]')) continue;

    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;

    // The containing block that CSS top/left resolve against once the element
    // becomes absolute. With no positioned ancestor that is the initial
    // containing block, whose origin sits one scroll offset above the
    // viewport.
    const parent = el.offsetParent as HTMLElement | null;
    const parentRect = parent
      ? parent.getBoundingClientRect()
      : { top: -window.scrollY, left: -window.scrollX };

    const top = Math.round(rect.top - parentRect.top);
    const left = Math.round(rect.left - parentRect.left);
    marks.push({ el, value: `${top},${left},${Math.round(rect.width)},${Math.round(rect.height)}` });
  }

  for (const { el, value } of marks) el.setAttribute(STUCK_ATTR, value);
  return marks.map((m) => m.el);
}

function unmarkStuckElements(els: HTMLElement[]): void {
  for (const el of els) el.removeAttribute(STUCK_ATTR);
}

/** onclone hook: pin the marked elements where markStuckElements() saw them. */
function pinStuckClones(cloned: Document): void {
  try {
    cloned.querySelectorAll<HTMLElement>(`[${STUCK_ATTR}]`).forEach((el) => {
      const [top, left, width, height] = (el.getAttribute(STUCK_ATTR) || '')
        .split(',')
        .map((n) => Number(n));
      if (![top, left, width, height].every((n) => Number.isFinite(n))) return;
      el.style.position = 'absolute';
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      el.style.margin = '0';
      el.removeAttribute(STUCK_ATTR);
    });
  } catch {
    // A clone we can't touch just renders the way 0.3.x did.
  }
}

/**
 * Crop a viewport-sized render down to `rect`.
 *
 * `scale` is the device-pixel factor the viewport was rendered at, so the
 * source rectangle is simply the CSS rect times that factor. Every edge is
 * clamped to the rendered canvas so a rect flush against the viewport edge
 * can't pull in transparent padding.
 */
function cropCanvas(full: HTMLCanvasElement, rect: QaRect, scale: number): HTMLCanvasElement | null {
  const sx = Math.max(0, Math.min(full.width, Math.round(rect.left * scale)));
  const sy = Math.max(0, Math.min(full.height, Math.round(rect.top * scale)));
  const sw = Math.max(1, Math.min(full.width - sx, Math.round(rect.width * scale)));
  const sh = Math.max(1, Math.min(full.height - sy, Math.round(rect.height * scale)));

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

async function captureViaDom(
  rect: QaRect,
  sx: number,
  sy: number,
): Promise<HTMLCanvasElement | null> {
  const { default: html2canvas } = await import('html2canvas');
  const scale = Math.min(window.devicePixelRatio || 1, 2);

  // The LAYOUT viewport (excludes any classic scrollbar) — the same box the
  // live page used when the tester's rect was measured. See header point (b).
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;

  const marked = markStuckElements();
  try {
    const full = await withTimeout(
      html2canvas(document.body, {
        // Render exactly the current viewport, in document coordinates.
        x: sx,
        y: sy,
        width: vw,
        height: vh,
        scale,
        useCORS: true,
        allowTaint: true,
        // The page's own background, never null — see resolvePageBackground().
        backgroundColor: resolvePageBackground(),
        logging: false,
        scrollX: sx,
        scrollY: sy,
        windowWidth: vw,
        windowHeight: vh,
        ignoreElements: (el: Element) =>
          el.nodeType === 1 &&
          typeof (el as HTMLElement).hasAttribute === 'function' &&
          (el as HTMLElement).hasAttribute('data-qa-overlay'),
        onclone: (doc: Document) => pinStuckClones(doc),
      }),
      HTML2CANVAS_TIMEOUT_MS,
    );
    if (!full) return null;
    return cropCanvas(full, rect, scale);
  } finally {
    unmarkStuckElements(marked);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a rectangular region of the page.
 *
 * @param rect - viewport coordinates (getBoundingClientRect-style)
 * @param scroll - page scroll offset (x/y) to treat as "now", snapshotted at
 *   selection time. Only the DOM engine needs it (the exact engine
 *   photographs whatever is on screen); passing an explicit snapshot keeps the
 *   crop correct even if momentum scrolling shifts the page while the
 *   html2canvas chunk is being dynamically imported.
 * @param prefer - engine preference; 'auto' uses exact whenever a live
 *   current-tab stream already exists, otherwise the DOM engine.
 */
export async function captureRegion(
  rect: QaRect,
  scroll?: { x: number; y: number },
  prefer: CapturePreference = 'auto',
): Promise<CaptureOutcome> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return { status: 'empty' };
  }
  if (!rect || rect.width < 2 || rect.height < 2) return { status: 'empty' };

  // Snapshot the scroll position now (before the async work below) so a
  // caller-supplied snapshot — or this fallback — can't be shifted by scroll
  // that happens while html2canvas is loading.
  const sx = scroll?.x ?? window.scrollX;
  const sy = scroll?.y ?? window.scrollY;

  // ── Exact engine ────────────────────────────────────────────────────────
  if (prefer !== 'dom' && getExactCaptureStatus() === 'live') {
    try {
      const canvas = await withOverlayHidden(() => grabExactRegion(rect));
      if (canvas) {
        const blob = await encodeShot(canvas);
        if (blob) return { status: 'ok', blob, engine: 'exact' };
      }
      // Fall through to the DOM engine rather than failing outright: a
      // dropped frame shouldn't cost the tester their screenshot.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[QA] exact capture failed, falling back to DOM render:', err);
    }
    if (prefer === 'exact') return { status: 'failed' };
  }

  // ── DOM engine ──────────────────────────────────────────────────────────
  try {
    const canvas = await captureViaDom(rect, sx, sy);
    if (!canvas) return { status: 'failed' };
    const blob = await encodeShot(canvas);
    return blob ? { status: 'ok', blob, engine: 'dom' } : { status: 'failed' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[QA] region capture failed:', err);
    return { status: 'failed' };
  }
}
