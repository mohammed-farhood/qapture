/**
 * screenCapture.ts — "exact" screenshots via the Screen Capture API.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until 0.3.x every screenshot came from html2canvas, which does not
 * photograph the page: it *re-renders a clone* of the DOM into an offscreen
 * iframe and rasterises that. Any way the clone lays out differently from the
 * live page shows up as "the screenshot is not the part I selected":
 *
 *   • an `overflow:auto` container (sidebar, table, modal body, chat log)
 *     clones with scrollTop reset to 0 — the shot shows the TOP of that
 *     container while the tester selected something scrolled far down;
 *   • the clone's viewport width differs from the live one by the scrollbar
 *     width, so every centred/responsive layout shifts horizontally;
 *   • canvas/WebGL/video/iframe content and CSS the cloner doesn't implement
 *     (backdrop-filter, some gradients, `mask`) simply render differently.
 *
 * The Screen Capture API has none of those failure modes: the browser hands
 * us the *actual composited pixels* of this tab's viewport. Cropping the
 * tester's viewport-coordinate rect out of that frame is then pure
 * arithmetic, so what they framed is exactly what they get.
 *
 * COST / GATING
 * -------------
 * It needs one permission prompt ("share this tab"), so it is only ever
 * offered where it can work *silently correctly*:
 *   - `preferCurrentTab` must be honoured (Chromium). Elsewhere the picker
 *     would let the tester share a screen or another window, which produces a
 *     frame that has nothing to do with our coordinate space.
 *   - even then the result is validated at runtime (`displaySurface` must be
 *     'browser', and the frame's aspect ratio must match the viewport's).
 *     A mismatch disables exact mode for the session rather than silently
 *     handing back a mis-cropped image.
 *
 * The stream is kept alive for the whole QA session (one prompt, not one per
 * note) and released by stopExactCapture() / the track's own 'ended' event
 * when the tester clicks Chrome's "Stop sharing".
 *
 * SSR-safe: every entry point returns a falsy/no-op result off-browser.
 */

/** How wrong the frame's aspect ratio may be before we distrust the mapping. */
const ASPECT_TOLERANCE = 0.08;

/** Cap on how long we'll wait for a fresh frame after hiding the overlay. */
const FRESH_FRAME_TIMEOUT_MS = 500;

/** Cap on how long we'll wait for the <video> to report real dimensions. */
const VIDEO_READY_TIMEOUT_MS = 4000;

export type ExactCaptureStatus =
  /** No getDisplayMedia, or a browser where preferCurrentTab isn't honoured. */
  | 'unsupported'
  /** Supported, but no stream is running (never asked, or released). */
  | 'idle'
  /** A live current-tab stream is held and ready to grab frames from. */
  | 'live'
  /** The tester dismissed the prompt, or shared the wrong surface. Don't nag. */
  | 'declined';

let stream: MediaStream | null = null;
let track: MediaStreamTrack | null = null;
let video: HTMLVideoElement | null = null;
let grabber: { grabFrame(): Promise<ImageBitmap> } | null = null;
let declined = false;

/**
 * True on Chromium-family browsers, where `preferCurrentTab` makes
 * getDisplayMedia offer *this tab* instead of a full surface picker.
 *
 * Feature-detecting the option itself isn't possible (unknown keys in the
 * constraints dict are ignored silently), and getting it wrong is not a
 * cosmetic issue: on a browser that ignores it, the tester is asked to pick a
 * screen/window, and a whole-screen frame maps to our viewport coordinates
 * incorrectly. So this stays a capability gate, and the runtime validation in
 * validateFrameMapping() is the second line of defence.
 */
function supportsPreferCurrentTab(): boolean {
  const nav = navigator as Navigator & {
    userAgentData?: { brands?: { brand: string }[] };
  };
  const brands = nav.userAgentData?.brands;
  if (Array.isArray(brands) && brands.length) {
    return brands.some((b) => /chromium/i.test(b.brand));
  }
  const ua = navigator.userAgent || '';
  // CriOS/FxiOS/EdgiOS are all WebKit under the skin and have no
  // getDisplayMedia at all; excluding Firefox/Safari leaves desktop Chromium.
  if (/CriOS|FxiOS|EdgiOS|Firefox/i.test(ua)) return false;
  return /Chrome|Chromium|Edg\//i.test(ua);
}

/** Whether exact capture can be attempted in this browser at all. */
export function isExactCaptureSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  if (!md || typeof md.getDisplayMedia !== 'function') return false;
  return supportsPreferCurrentTab();
}

/** Current state, for the UI to decide what to offer the tester. */
export function getExactCaptureStatus(): ExactCaptureStatus {
  if (!isExactCaptureSupported()) return 'unsupported';
  if (track && track.readyState === 'live') return 'live';
  if (declined) return 'declined';
  return 'idle';
}

function teardown(): void {
  if (video) {
    try { video.pause(); } catch { /* ignore */ }
    video.srcObject = null;
    video.remove();
  }
  if (stream) {
    for (const t of stream.getTracks()) {
      try { t.stop(); } catch { /* ignore */ }
    }
  }
  video = null;
  stream = null;
  track = null;
  grabber = null;
}

/** Release the shared stream (stops the browser's "sharing" indicator). */
export function stopExactCapture(): void {
  teardown();
}

/**
 * Forget a previous decline so the tester can opt back in from the UI
 * without reloading the page.
 */
export function resetExactCaptureDecline(): void {
  declined = false;
}

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
 * Tab capture is damage-driven: frames are produced when something on the
 * page changes. Hiding the QA overlay is exactly such a change, so waiting
 * for the next presented frame is what guarantees we photograph the page
 * *without* our own UI in it rather than re-reading the last frame that still
 * had the scrim in it.
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
 * The frame we get back must be a picture of THIS tab's viewport. If the
 * tester picked a whole screen or a different window in a browser that
 * ignored preferCurrentTab, the frame's aspect ratio won't match the
 * viewport's — and cropping viewport coordinates out of it would produce a
 * confidently wrong image, which is worse than falling back.
 */
function validateFrameMapping(frameW: number, frameH: number): boolean {
  if (!frameW || !frameH) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!vw || !vh) return false;
  const frameAspect = frameW / frameH;
  const viewAspect = vw / vh;
  return Math.abs(frameAspect - viewAspect) / viewAspect <= ASPECT_TOLERANCE;
}

/**
 * Ask for (or reuse) a live capture of the current tab.
 *
 * MUST be called from a user gesture the first time — browsers reject
 * getDisplayMedia without transient activation.
 *
 * @returns true when a validated, live current-tab stream is ready.
 */
export async function startExactCapture(): Promise<boolean> {
  if (!isExactCaptureSupported()) return false;
  if (track && track.readyState === 'live' && video) return true;

  // A half-dead stream (tester hit "Stop sharing") must be cleared before we
  // ask again, or we'd hold two.
  if (stream) teardown();

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

    const s = await navigator.mediaDevices.getDisplayMedia(constraints);
    const t = s.getVideoTracks()[0];
    if (!t) { for (const x of s.getTracks()) x.stop(); declined = true; return false; }

    const settings = t.getSettings() as MediaTrackSettings & { displaySurface?: string };
    if (settings.displaySurface && settings.displaySurface !== 'browser') {
      // Tester shared a screen/window instead of this tab.
      for (const x of s.getTracks()) x.stop();
      declined = true;
      return false;
    }

    const el = document.createElement('video');
    // Marked as overlay so the DOM engine ignores it and hideOverlay() hides it.
    el.setAttribute('data-qa-overlay', 'true');
    el.muted = true;
    el.playsInline = true;
    el.style.cssText =
      'position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    el.srcObject = s;
    document.body.appendChild(el);
    try { await el.play(); } catch { /* muted autoplay should not reject; ignore */ }

    const ready = await waitFor(() => el.videoWidth > 0 && el.videoHeight > 0, VIDEO_READY_TIMEOUT_MS);
    if (!ready || !validateFrameMapping(el.videoWidth, el.videoHeight)) {
      el.remove();
      for (const x of s.getTracks()) x.stop();
      declined = true;
      return false;
    }

    stream = s;
    track = t;
    video = el;

    // ImageCapture gives a clean ImageBitmap without going through a
    // <video> paint; where it's missing we draw the element directly.
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
    grabber = IC ? new IC(t) : null;

    t.addEventListener('ended', () => { teardown(); });
    return true;
  } catch {
    // NotAllowedError (dismissed prompt) and friends all land here.
    declined = true;
    teardown();
    return false;
  }
}

/**
 * Crop `rect` (viewport CSS pixels) out of a freshly presented frame.
 *
 * @param rect - viewport coordinates, getBoundingClientRect-style.
 * @returns a PNG-quality source canvas, or null when exact capture is
 *   unavailable/invalid — callers fall back to the DOM engine.
 */
export async function grabExactRegion(rect: {
  top: number; left: number; width: number; height: number;
}): Promise<HTMLCanvasElement | null> {
  if (!track || track.readyState !== 'live' || !video) return null;

  await nextPresentedFrame(video);

  let source: CanvasImageSource;
  let frameW: number;
  let frameH: number;
  let bitmap: ImageBitmap | null = null;

  if (grabber) {
    try {
      bitmap = await grabber.grabFrame();
      source = bitmap;
      frameW = bitmap.width;
      frameH = bitmap.height;
    } catch {
      source = video;
      frameW = video.videoWidth;
      frameH = video.videoHeight;
    }
  } else {
    source = video;
    frameW = video.videoWidth;
    frameH = video.videoHeight;
  }

  try {
    if (!validateFrameMapping(frameW, frameH)) return null;

    const scaleX = frameW / window.innerWidth;
    const scaleY = frameH / window.innerHeight;

    // Clamp to the frame so a rect touching the viewport edge (or a stale
    // rect after a resize) can't ask for pixels that don't exist — drawImage
    // would silently letterbox transparent padding into the result.
    const sx = Math.max(0, Math.min(frameW, Math.round(rect.left * scaleX)));
    const sy = Math.max(0, Math.min(frameH, Math.round(rect.top * scaleY)));
    const sw = Math.max(1, Math.min(frameW - sx, Math.round(rect.width * scaleX)));
    const sh = Math.max(1, Math.min(frameH - sy, Math.round(rect.height * scaleY)));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  } catch {
    return null;
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}
