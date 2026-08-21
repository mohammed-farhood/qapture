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
 * TWO STRATEGIES (v0.7.6)
 * -----------------------
 * Chromium honours `preferCurrentTab`, so it can hand back a capture of THIS
 * TAB: the frame is the viewport, and cropping is one multiply. That is the
 * 'tab' mode, unchanged since 0.4 and measured at 0.0px error.
 *
 * Safari and Firefox have no tab capture at all. Until 0.7.5 that meant they
 * got no real screenshots ever — only html2canvas redraws, which render an
 * inline-SVG chart as bare outlines and a <canvas> as a blank box. They CAN
 * share a window or a screen, though, and that frame does contain the page;
 * it just also contains a toolbar, and maybe a whole desktop.
 *
 * Finding the page in such a frame by arithmetic — `outerHeight - innerHeight`
 * for the toolbar, `screenX/screenY` for the window, `devicePixelRatio` for
 * Retina — is a stack of guesses, each of which can be quietly wrong (a
 * bookmarks bar, a scaled display, a second monitor). Quietly wrong here means
 * a screenshot confidently showing the wrong pixels, which is worse than no
 * screenshot at all: nobody double-checks a screenshot that looks fine.
 *
 * So 'surface' mode MEASURES instead. calibrate() covers the page with an
 * opaque card carrying four known colours at four known corners, photographs
 * it once, and solves for scale and origin from where those colours landed —
 * see frameCalibration.ts. Toolbar height, pixel ratio and monitor layout
 * cancel out because none of them are used. Two corners solve, the other two
 * verify, and a calibration that cannot be verified is REFUSED: the grant is
 * dropped and the session falls back to the DOM engine.
 *
 * A measurement belongs to the geometry it was taken in, so it is re-taken
 * whenever the window moves, resizes, zooms or changes display
 * (environmentSignature()).
 *
 * The stream is kept alive for the whole QA session (one prompt, not one per
 * note) and released by stopExactCapture() / the track's own 'ended' event
 * when the tester clicks Chrome's "Stop sharing".
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
  environmentSignature,
  type FrameMapping,
} from './frameCalibration';

/** How wrong the frame's aspect ratio may be before we distrust the mapping. */
const ASPECT_TOLERANCE = 0.08;

/** How long the calibration card stays up while we grab a frame of it. */
const CALIBRATION_SETTLE_MS = 220;

/** Cap on how long we'll wait for a fresh frame after hiding the overlay. */
const FRESH_FRAME_TIMEOUT_MS = 500;

/** Cap on how long we'll wait for the <video> to report real dimensions. */
const VIDEO_READY_TIMEOUT_MS = 4000;

export type ExactCaptureStatus =
  /** No Screen Capture API at all — iOS/iPadOS, and old desktop builds. */
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
 * Whether exact capture can be attempted in this browser at all.
 *
 * Until 0.7.5 this also required preferCurrentTab, i.e. Chromium — which meant
 * Safari and Firefox testers could never get a real screenshot, only a redraw.
 * That is no longer a hard limit: those browsers can share a WINDOW or a
 * SCREEN, and frameCalibration.ts locates the page inside such a frame by
 * measuring it. So the gate is now simply "is there a Screen Capture API",
 * and which strategy we use is decided per grant in startExactCapture().
 */
export function isExactCaptureSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return !!md && typeof md.getDisplayMedia === 'function';
}

/**
 * How the live stream maps onto the page.
 *  - 'tab'     the frame IS the viewport (Chromium preferCurrentTab). One
 *              multiply, nothing to measure.
 *  - 'surface' the frame is a window or a screen with the page somewhere
 *              inside it, located by calibration.
 */
export type ExactCaptureMode = 'tab' | 'surface';

let mode: ExactCaptureMode = 'tab';
let mapping: FrameMapping | null = null;
let mappingSignature = '';

/** Which strategy the current stream is using, or null when nothing is live. */
export function getExactCaptureMode(): ExactCaptureMode | null {
  return track && track.readyState === 'live' ? mode : null;
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
  // A measurement belongs to the stream it was taken from. Keeping it across a
  // teardown would let a fresh grant inherit the old window's geometry, which
  // is the exact stale-mapping failure this module refuses to have.
  mode = 'tab';
  mapping = null;
  mappingSignature = '';
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

/** Read one frame of the live stream into a canvas we can inspect. */
async function grabFrameCanvas(): Promise<HTMLCanvasElement | null> {
  if (!video) return null;
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
 * The tester sees a dark flash for a fifth of a second, once per grant.
 *
 * Returns false when the frame cannot be trusted — the caller then refuses the
 * whole exact-capture grant rather than cropping from a guess.
 */
async function calibrate(): Promise<boolean> {
  if (!video) return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw <= MARKER_SIZE || vh <= MARKER_SIZE) return false;

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
    const frame = await grabFrameCanvas();
    if (!frame) return false;
    const ctx = frame.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, frame.width, frame.height);
    const found = deriveMapping(
      findMarkerCandidates(data, frame.width, frame.height),
      vw, vh, frame.width, frame.height,
    );
    if (!found) return false;
    mapping = found;
    mappingSignature = environmentSignature();
    return true;
  } catch {
    return false;
  } finally {
    card.remove();
  }
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
    // A non-'browser' surface used to be an outright refusal. It is now simply
    // the other strategy: keep the stream and measure where the page sits in
    // it. Only Chromium ever reports 'browser' here.
    const sharedTab = !settings.displaySurface || settings.displaySurface === 'browser';

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
    const giveUp = () => {
      el.remove();
      for (const x of s.getTracks()) x.stop();
      declined = true;
      return false;
    };
    if (!ready) return giveUp();

    // A tab share whose frame matches the viewport needs no measurement — this
    // is the Chromium path, unchanged since 0.4 and measured at 0.0px.
    const isDirect = sharedTab && validateFrameMapping(el.videoWidth, el.videoHeight);

    // Commit the stream before calibrating: calibrate() grabs frames through
    // these module refs.
    stream = s;
    track = t;
    video = el;

    // ImageCapture gives a clean ImageBitmap without going through a
    // <video> paint; where it's missing we draw the element directly.
    const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
    grabber = IC ? new IC(t) : null;

    if (isDirect) {
      mode = 'tab';
      mapping = null;
      mappingSignature = '';
    } else {
      mode = 'surface';
      if (!await calibrate()) {
        // We hold a real stream but cannot say where the page is in it. That
        // is precisely when guessing produces a confidently wrong screenshot,
        // so hand the session back to the DOM engine instead.
        teardown();
        declined = true;
        return false;
      }
    }

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

  // In surface mode the mapping is only good while the window stays put. A
  // move, a resize, a zoom or a hop to another display invalidates it — and a
  // stale mapping is the confident-lie failure mode, so re-measure rather than
  // carry on. Costs one dark flash, and only when something actually changed.
  if (mode === 'surface') {
    if (!mapping || environmentSignature() !== mappingSignature) {
      if (!await calibrate()) return null;
    }
  }

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
    // Where in this frame the requested viewport rect lives. Two strategies,
    // one shape of answer.
    let sx: number;
    let sy: number;
    let sw: number;
    let sh: number;

    if (mode === 'surface') {
      if (!mapping) return null;
      const mapped = mapRectToFrame(rect, mapping, frameW, frameH);
      if (!mapped) return null;
      ({ sx, sy, sw, sh } = mapped);
    } else {
      if (!validateFrameMapping(frameW, frameH)) return null;
      const scaleX = frameW / window.innerWidth;
      const scaleY = frameH / window.innerHeight;

      // Clamp to the frame so a rect touching the viewport edge (or a stale
      // rect after a resize) can't ask for pixels that don't exist — drawImage
      // would silently letterbox transparent padding into the result.
      sx = Math.max(0, Math.min(frameW, Math.round(rect.left * scaleX)));
      sy = Math.max(0, Math.min(frameH, Math.round(rect.top * scaleY)));
      sw = Math.max(1, Math.min(frameW - sx, Math.round(rect.width * scaleX)));
      sh = Math.max(1, Math.min(frameH - sy, Math.round(rect.height * scaleY)));
    }

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
