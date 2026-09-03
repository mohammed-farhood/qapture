/**
 * screenCapture.ts — one still photograph of the page, then nothing.
 *
 * WHY THIS EXISTS
 * ---------------
 * html2canvas does not photograph the page: it *re-renders a clone* of the DOM
 * into an offscreen iframe and rasterises that. A <canvas> chart comes out
 * blank, a WebGL view comes out empty, a cross-origin iframe comes out missing,
 * and CSS the cloner doesn't implement comes out different. It is a
 * reconstruction, and no amount of fixing turns a reconstruction into a
 * photograph.
 *
 * The Screen Capture API hands us the *actual composited pixels*. Cropping the
 * tester's viewport-coordinate rect out of that is pure arithmetic, so what
 * they framed is exactly what they get.
 *
 * FREEZE FIRST (v0.8)
 * -------------------
 * Until 0.7.9 this module held a live stream for the whole QA session and
 * grabbed a frame at the moment the tester finished dragging. That ordering
 * caused every problem it had:
 *
 *   • the stream outlived the moment, so the OS kept the screen-sharing
 *     indicator lit and the capture pipeline running for as long as the tab
 *     was open — a real battery cost, on the one browser (Safari) that can
 *     only share a whole window or screen;
 *   • a mapping measured at grant time could go stale before the grab (window
 *     moved, zoomed, changed display), so the module carried an environment
 *     signature and re-measured mid-session;
 *   • the stream could die between two captures — the tester pressed "Stop
 *     sharing", a frame dropped, an aspect check failed — and the next capture
 *     silently fell back to the redraw engine. Same click, different engine,
 *     no indication which. That is what read as "screenshots are broken
 *     sometimes and fine other times".
 *
 * So the order is inverted. freezeViewport() runs when the tester ENTERS
 * capture mode: it acquires the stream, takes ONE frame, normalises it to the
 * viewport, and stops the track — all inside about a third of a second. Every
 * subsequent crop is arithmetic against a dead bitmap.
 *
 * What that buys, beyond the battery:
 *   • nothing can go stale, because nothing is left alive to go stale — the
 *     still IS the viewport, already mapped, so mapRectToFrame is applied once
 *     here rather than once per capture;
 *   • the tester crops a FROZEN page. A hover state, an open dropdown or a
 *     tooltip survives being framed, where dragging a selection used to
 *     dismiss the very thing being reported;
 *   • whether this capture is a photograph or a redraw is settled before the
 *     tester starts framing, so the UI can say so up front instead of
 *     discovering it afterwards.
 *
 * What it costs: the page cannot be scrolled mid-capture to reach something
 * off-screen. The exact engine never could (it photographs the viewport and
 * nothing else), so nothing that previously worked is lost.
 *
 * TWO STRATEGIES
 * --------------
 * Chromium honours `preferCurrentTab`, so the frame IS the viewport and
 * normalising is a no-op. That is 'tab' mode, measured at 0.0px error.
 *
 * Safari and Firefox have no tab capture. They CAN share a window or a screen,
 * and that frame does contain the page — it just also contains a toolbar, and
 * maybe a whole desktop. Finding the page in it by arithmetic (outerHeight -
 * innerHeight, screenX/screenY, devicePixelRatio) is a stack of guesses, each
 * of which can be quietly wrong. Quietly wrong here means a screenshot
 * confidently showing the wrong pixels, which is worse than no screenshot:
 * nobody double-checks a screenshot that looks fine.
 *
 * So 'surface' mode MEASURES. calibrate() covers the page with an opaque card
 * carrying four known colours at four known corners, photographs it, and solves
 * for scale and origin from where those colours landed — see
 * frameCalibration.ts. Toolbar height, pixel ratio and monitor layout cancel
 * out because none of them are used. Two corners solve, the other two verify,
 * and a calibration that cannot be verified is REFUSED: the frame is dropped
 * and this capture falls back to the DOM engine, visibly.
 *
 * SSR-safe: every entry point returns a falsy/no-op result off-browser.
 */

import {
  MARKERS,
  MARKER_SIZE,
  markerCentres,
  findMarkerCandidates,
  deriveMapping,
  mapRectToFrame,
  type FrameMapping,
} from './frameCalibration';

/** How wrong the frame's aspect ratio may be before we distrust a tab share. */
const ASPECT_TOLERANCE = 0.08;

/** How long the calibration card stays up while we grab a frame of it. */
const CALIBRATION_SETTLE_MS = 220;

/** Cap on how long we'll wait for a fresh frame after hiding the overlay. */
const FRESH_FRAME_TIMEOUT_MS = 500;

/** Cap on how long we'll wait for the <video> to report real dimensions. */
const VIDEO_READY_TIMEOUT_MS = 4000;

/**
 * How the frame maps onto the page.
 *  - 'tab'     the frame IS the viewport (Chromium preferCurrentTab).
 *  - 'surface' the frame is a window or a screen with the page somewhere
 *              inside it, located by calibration.
 */
export type ExactCaptureMode = 'tab' | 'surface';

export type ExactCaptureStatus =
  /** No Screen Capture API at all — iOS/iPadOS, and old desktop builds. */
  | 'unsupported'
  /** Supported, but the tester has not switched real photographs on. */
  | 'idle'
  /** Armed: the next capture will ask to photograph the screen. */
  | 'live'
  /** The tester dismissed the prompt, or the frame could not be trusted. */
  | 'declined';

/**
 * A single photograph of the viewport, already normalised so that its pixels
 * correspond to viewport CSS pixels by a constant scale.
 *
 * It is a dead bitmap. Nothing about it can expire, and holding it costs no
 * battery — which is the entire point of taking it up front.
 */
export interface FrozenFrame {
  /** The viewport, as photographed. Width/height are device pixels. */
  readonly canvas: HTMLCanvasElement;
  /** Which strategy produced it. */
  readonly mode: ExactCaptureMode;
  /** Viewport CSS size at the moment of the photograph. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Wall-clock time of the photograph, for the note's provenance. */
  readonly takenAt: number;
}

/** Whether exact capture can be attempted in this browser at all. */
export function isExactCaptureSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return !!md && typeof md.getDisplayMedia === 'function';
}

// ---------------------------------------------------------------------------
// Arming, and the still currently held
// ---------------------------------------------------------------------------

let armed = false;
let declined = false;
let frozen: FrozenFrame | null = null;
let lastMode: ExactCaptureMode | null = null;

/**
 * Switch real photographs on.
 *
 * Deliberately does NOT prompt. Under the old design arming meant acquiring a
 * session-long stream, so it had to ask then and there; now the grant lasts one
 * frame, so it belongs to the capture that needs it. Flipping a settings toggle
 * should not put a share prompt (and, in Safari, a calibration flash) on screen
 * before the tester has asked to capture anything.
 */
export function armExactCapture(): boolean {
  if (!isExactCaptureSupported()) return false;
  armed = true;
  declined = false;
  return true;
}

/** Switch real photographs off and drop any still we are holding. */
export function disarmExactCapture(): void {
  armed = false;
  releaseFrozenFrame();
}

/** Forget a previous decline so the tester can opt back in from the UI. */
export function resetExactCaptureDecline(): void {
  declined = false;
}

/** Current state, for the UI to decide what to offer the tester. */
export function getExactCaptureStatus(): ExactCaptureStatus {
  if (!isExactCaptureSupported()) return 'unsupported';
  if (armed) return 'live';
  if (declined) return 'declined';
  return 'idle';
}

/** Which strategy took the still we are holding, or the last one taken. */
export function getExactCaptureMode(): ExactCaptureMode | null {
  return frozen ? frozen.mode : lastMode;
}

/** The still currently held for this capture, if any. */
export function getFrozenFrame(): FrozenFrame | null {
  return frozen;
}

/**
 * Drop the still.
 *
 * A viewport-sized bitmap on a retina display is tens of megabytes, so it is
 * released the moment capture mode ends rather than lingering until the next
 * one replaces it.
 */
export function releaseFrozenFrame(): void {
  if (frozen) {
    // Zeroing the canvas frees the backing store on browsers that keep it
    // alive for a detached element.
    frozen.canvas.width = 0;
    frozen.canvas.height = 0;
  }
  frozen = null;
}

// ---------------------------------------------------------------------------
// Taking the photograph
// ---------------------------------------------------------------------------

function waitFor(test: () => boolean, timeoutMs: number): Promise<boolean> {
  if (test()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (test()) { resolve(true); return; }
      if (Date.now() - started >= timeoutMs) { resolve(false); return; }
      setTimeout(tick, 30);
    };
    tick();
  });
}

/**
 * Resolve once the video has presented a NEW frame (or the cap elapses).
 *
 * Tab capture is damage-driven: frames are produced when something on the page
 * changes. Hiding the QA overlay is exactly such a change, so waiting for the
 * next presented frame is what guarantees we photograph the page *without* our
 * own UI in it rather than re-reading the last frame that still had it.
 */
function nextPresentedFrame(el: HTMLVideoElement): Promise<void> {
  const rvfc = (el as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  }).requestVideoFrameCallback;

  if (typeof rvfc !== 'function') {
    return new Promise((resolve) => setTimeout(resolve, 140));
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const timer = setTimeout(done, FRESH_FRAME_TIMEOUT_MS);
    rvfc.call(el, () => { clearTimeout(timer); done(); });
  });
}

/**
 * A tab share's frame must be a picture of THIS viewport. If the tester picked
 * a whole screen in a browser that ignored preferCurrentTab, the aspect ratio
 * won't match — and cropping viewport coordinates out of it would produce a
 * confidently wrong image. Then we measure instead of assuming.
 */
function looksLikeViewport(frameW: number, frameH: number): boolean {
  if (!frameW || !frameH) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!vw || !vh) return false;
  return Math.abs(frameW / frameH - vw / vh) / (vw / vh) <= ASPECT_TOLERANCE;
}

/** Hide every top-level piece of QA UI, run `fn`, then restore. */
async function withOverlayHidden<T>(fn: () => Promise<T>): Promise<T> {
  const hosts = Array.from(
    document.querySelectorAll<HTMLElement>('body > [data-qa-overlay]'),
  );
  const previous = hosts.map((el) => el.style.visibility);
  // `visibility`, not `display`, so nothing in the host page reflows.
  for (const el of hosts) el.style.visibility = 'hidden';
  try {
    return await fn();
  } finally {
    hosts.forEach((el, i) => { el.style.visibility = previous[i]; });
  }
}

/** Read one frame of a live video element into a canvas we can inspect. */
async function grabFrameCanvas(
  video: HTMLVideoElement,
  grabber: { grabFrame(): Promise<ImageBitmap> } | null,
): Promise<HTMLCanvasElement | null> {
  await nextPresentedFrame(video);
  let source: CanvasImageSource = video;
  let w = video.videoWidth;
  let h = video.videoHeight;
  let bitmap: ImageBitmap | null = null;
  if (grabber) {
    try {
      bitmap = await grabber.grabFrame();
      source = bitmap;
      w = bitmap.width;
      h = bitmap.height;
    } catch { /* fall back to the <video> element */ }
  }
  if (!w || !h) { bitmap?.close?.(); return null; }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bitmap?.close?.(); return null; }
  ctx.drawImage(source, 0, 0);
  bitmap?.close?.();
  return c;
}

/**
 * Cover the page with an opaque card carrying four known colours at four known
 * corners, photograph it, and solve for where the page sits inside the frame.
 *
 * The card is the point, not a side effect. In a window or screen share the
 * frame contains the browser's toolbar, and possibly the whole desktop; the
 * only way to know which pixels are the PAGE is to put something identifiable
 * in it and look for that. Because the card is opaque, the only saturated
 * marker colours in the frame are ours, so the page's own content cannot be
 * mistaken for a corner.
 *
 * The tester sees a dark flash for a fifth of a second, once per capture.
 * Returns null when the frame cannot be trusted.
 */
async function calibrate(
  video: HTMLVideoElement,
  grabber: { grabFrame(): Promise<ImageBitmap> } | null,
): Promise<FrameMapping | null> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= MARKER_SIZE || vh <= MARKER_SIZE) return null;

  const card = document.createElement('div');
  // NOT data-qa-overlay: the other overlays are hidden for a capture, but this
  // one has to be in the picture — it IS the measurement.
  card.setAttribute('data-qa-calibration', 'true');
  card.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;pointer-events:none;' +
    'contain:strict;';
  const centres = markerCentres(vw, vh);
  for (const m of MARKERS) {
    const dot = document.createElement('div');
    const c = centres[m.key];
    dot.style.cssText =
      `position:absolute;width:${MARKER_SIZE}px;height:${MARKER_SIZE}px;` +
      `left:${c.x - MARKER_SIZE / 2}px;top:${c.y - MARKER_SIZE / 2}px;` +
      `background:rgb(${m.color[0]},${m.color[1]},${m.color[2]});`;
    card.appendChild(dot);
  }
  document.body.appendChild(card);

  try {
    // One frame is not enough: the compositor and the capture pipeline are not
    // in lockstep, so the first presented frame may predate the card.
    await new Promise((r) => setTimeout(r, CALIBRATION_SETTLE_MS));
    const frame = await grabFrameCanvas(video, grabber);
    if (!frame) return null;
    const ctx = frame.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const { data } = ctx.getImageData(0, 0, frame.width, frame.height);
    const found = deriveMapping(
      findMarkerCandidates(data, frame.width, frame.height),
      vw, vh, frame.width, frame.height,
    );
    frame.width = 0;
    frame.height = 0;
    return found;
  } catch {
    return null;
  } finally {
    card.remove();
  }
}

/**
 * Take one photograph of the viewport and give the screen back straight away.
 *
 * MUST be called from a user gesture — browsers reject getDisplayMedia without
 * transient activation. Entering capture mode (a click, or the capture hotkey's
 * keydown) is that gesture.
 *
 * The still is held in this module until releaseFrozenFrame(); captureRegion()
 * crops from it. Returns null when there is no trustworthy photograph, in which
 * case the caller uses the DOM engine and says so.
 */
export async function freezeViewport(): Promise<FrozenFrame | null> {
  if (!isExactCaptureSupported()) return null;
  releaseFrozenFrame();

  let stream: MediaStream | null = null;
  let el: HTMLVideoElement | null = null;

  /**
   * Give the screen back. Called on every exit from this function, success or
   * failure — the stream must never outlive the frame it was opened for, which
   * is the whole reason this module was rewritten.
   */
  const release = () => {
    if (el) {
      try { el.pause(); } catch { /* ignore */ }
      el.srcObject = null;
      el.remove();
      el = null;
    }
    if (stream) {
      for (const t of stream.getTracks()) {
        try { t.stop(); } catch { /* ignore */ }
      }
      stream = null;
    }
  };

  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const constraints = {
      video: {
        displaySurface: 'browser',
        width:  { ideal: Math.round(window.innerWidth * dpr) },
        height: { ideal: Math.round(window.innerHeight * dpr) },
        frameRate: { ideal: 10, max: 30 },
      },
      audio: false,
      // Chromium-only hints: offer this tab first, allow self-capture, and
      // don't show the "switch what you're sharing" affordance.
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
      systemAudio: 'exclude',
    } as unknown as DisplayMediaStreamOptions;

    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    const track = stream.getVideoTracks()[0];
    if (!track) { declined = true; return null; }

    const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
    // Only Chromium ever reports 'browser' here.
    const sharedTab = !settings.displaySurface || settings.displaySurface === 'browser';

    el = document.createElement('video');
    // Marked as overlay so withOverlayHidden() hides it and the DOM engine
    // ignores it. It is off-screen and 1px anyway.
    el.setAttribute('data-qa-overlay', 'true');
    el.muted = true;
    el.playsInline = true;
    el.style.cssText =
      'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    el.srcObject = stream;
    document.body.appendChild(el);
    try { await el.play(); } catch { /* muted autoplay should not reject */ }

    const video = el;
    const ready = await waitFor(
      () => video.videoWidth > 0 && video.videoHeight > 0,
      VIDEO_READY_TIMEOUT_MS,
    );
    if (!ready) { declined = true; return null; }

    const IC = (window as unknown as {
      ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> };
    }).ImageCapture;
    // ImageCapture gives a clean ImageBitmap without going through a <video>
    // paint; where it's missing we draw the element directly.
    const grabber = IC ? new IC(track) : null;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mode: ExactCaptureMode =
      sharedTab && looksLikeViewport(video.videoWidth, video.videoHeight) ? 'tab' : 'surface';

    // Measure BEFORE the content frame. The card is opaque, so it has to come
    // down again before we photograph the page itself.
    const mapping = mode === 'surface' ? await calibrate(video, grabber) : null;
    if (mode === 'surface' && !mapping) {
      // We hold a real frame but cannot say where the page is in it. That is
      // precisely when guessing produces a confidently wrong screenshot, so
      // refuse and let the caller fall back — visibly.
      declined = true;
      return null;
    }

    const raw = await withOverlayHidden(() => grabFrameCanvas(video, grabber));
    if (!raw) return null;

    // Normalise to the viewport once, here, rather than per crop. After this
    // the still's pixels ARE the viewport's pixels, so both strategies produce
    // the same shape of thing and nothing downstream needs to know which ran.
    let page: HTMLCanvasElement;
    if (mode === 'surface' && mapping) {
      const box = mapRectToFrame(
        { left: 0, top: 0, width: vw, height: vh },
        mapping, raw.width, raw.height,
      );
      if (!box) return null;
      page = document.createElement('canvas');
      page.width = box.sw;
      page.height = box.sh;
      const ctx = page.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(raw, box.sx, box.sy, box.sw, box.sh, 0, 0, box.sw, box.sh);
      raw.width = 0;
      raw.height = 0;
    } else {
      page = raw;
    }

    frozen = {
      canvas: page,
      mode,
      viewportWidth: vw,
      viewportHeight: vh,
      takenAt: Date.now(),
    };
    lastMode = mode;
    return frozen;
  } catch {
    // NotAllowedError (dismissed prompt) and friends all land here.
    declined = true;
    return null;
  } finally {
    // Belt and braces: whatever happened above, the screen is given back here.
    release();
  }
}

/**
 * Crop `rect` (viewport CSS pixels) out of the still.
 *
 * Pure arithmetic against a dead bitmap — nothing to await, no frames, nothing
 * that can be in a different state than it was a moment ago.
 *
 * @returns a source canvas, or null when we hold no still or the rect misses it.
 */
export function cropFrozenRegion(rect: {
  top: number; left: number; width: number; height: number;
}): HTMLCanvasElement | null {
  const f = frozen;
  if (!f || !f.canvas.width || !f.canvas.height) return null;
  if (!f.viewportWidth || !f.viewportHeight) return null;

  // The rect is in TODAY's viewport coordinates; the still is of the viewport
  // as it was. If the window has been resized since, those two coordinate
  // systems are not the same one, and cropping across them would hand back a
  // confidently wrong image. Refuse, and let the caller redraw instead.
  if (
    window.innerWidth !== f.viewportWidth ||
    window.innerHeight !== f.viewportHeight
  ) {
    return null;
  }

  const scaleX = f.canvas.width / f.viewportWidth;
  const scaleY = f.canvas.height / f.viewportHeight;

  // Clamp to the still so a rect touching the viewport edge can't ask for
  // pixels that were never photographed — drawImage would silently letterbox
  // transparent padding into the result.
  const sx = Math.max(0, Math.min(f.canvas.width, Math.round(rect.left * scaleX)));
  const sy = Math.max(0, Math.min(f.canvas.height, Math.round(rect.top * scaleY)));
  const sw = Math.min(f.canvas.width - sx, Math.round(rect.width * scaleX));
  const sh = Math.min(f.canvas.height - sy, Math.round(rect.height * scaleY));
  if (sw < 1 || sh < 1) return null;

  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(f.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}
