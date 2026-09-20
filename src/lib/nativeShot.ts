/**
 * nativeShot.ts — ask the local helper for a real screenshot.
 *
 * WHY THIS EXISTS
 * ---------------
 * `getDisplayMedia` is the only way a page can photograph the screen, and it
 * prompts every single time — that is the security model, not a gap in it.
 * Each prompt restarts the OS capture pipeline, which on a laptop is heat and
 * a machine that feels like it is recording continuously.
 *
 * `qapture2 shots` moves the camera out of the browser. It is a loopback
 * server that runs `screencapture`, the binary behind Cmd+Shift+4. macOS asks
 * for Screen Recording permission once, for the terminal, and never again.
 *
 * WHAT THIS MODULE IS CAREFUL ABOUT
 * ---------------------------------
 * The helper photographs a rectangle of the DESKTOP. We ask for the browser
 * window's rectangle, which `window.screenX/screenY/outerWidth/outerHeight`
 * describe in the same coordinate space and unit (points) that `screencapture
 * -R` takes — so neither side has to know how many displays there are or how
 * they are arranged.
 *
 * What we get back therefore contains the page AND the browser's toolbar. Where
 * the page sits inside it is NOT computed from outerHeight - innerHeight: that
 * is a guess, and a wrong guess here is a screenshot confidently showing the
 * wrong pixels, which is worse than no screenshot because nobody double-checks
 * one that looks fine. It is MEASURED, by the same calibration card the
 * surface-share path uses — see frameCalibration.ts.
 *
 * The measurement is cached against environmentSignature(), so the card only
 * flashes when the window has actually moved, resized, zoomed or changed
 * display. In a normal session that is once.
 *
 * SSR-safe: every entry point returns a falsy result off-browser.
 */

import { environmentSignature, type FrameMapping } from './frameCalibration';

/** Where the helper listens. Fixed, because the page cannot go hunting. */
export const DEFAULT_SHOT_PORT = 7017;

/** A probe that has not answered by now means nothing is listening. */
const PROBE_TIMEOUT_MS = 700;

/** A capture that has not answered by now is not coming back. */
const SHOT_TIMEOUT_MS = 9000;

/**
 * How long a "no helper here" answer is believed before we look again.
 *
 * Probing costs a failed fetch, which Chrome logs to the console in red. Doing
 * that on every capture would fill a tester's console with noise about a
 * feature they are not using, so a negative answer is cached — but not
 * forever, because the whole point is that you can start the helper mid-session
 * and have it picked up.
 */
const ABSENT_RECHECK_MS = 30_000;

/**
 * The port the helper was started on. Default unless the config says
 * otherwise, which only matters when 7017 was already taken.
 */
let configuredPort = DEFAULT_SHOT_PORT;

/** Point the widget at a different port, and forget what we knew. */
export function setShotPort(port: number): void {
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return;
  if (port === configuredPort) return;
  configuredPort = port;
  resetNativeShotProbe();
}

let cachedBase: string | null = null;
let lastProbeAt = 0;
let lastProbeResult = false;

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  if (typeof fetch !== 'function') return null;
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ac?.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac?.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is the helper running?
 *
 * Answers from cache when it answered recently, so that a session with no
 * helper does not pay a failed request per capture.
 */
export async function isNativeShotAvailable(port = configuredPort): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const now = Date.now();
  if (lastProbeResult && cachedBase) return true;
  if (!lastProbeResult && now - lastProbeAt < ABSENT_RECHECK_MS) return false;

  lastProbeAt = now;
  const res = await fetchWithTimeout(`${baseUrl(port)}/qapture/health`, { method: 'GET' }, PROBE_TIMEOUT_MS);
  lastProbeResult = !!res && res.ok;
  cachedBase = lastProbeResult ? baseUrl(port) : null;
  return lastProbeResult;
}

/** Forget what we know about the helper — used when the tester toggles it. */
export function resetNativeShotProbe(): void {
  cachedBase = null;
  lastProbeAt = 0;
  lastProbeResult = false;
}

/**
 * Photograph the browser window.
 *
 * Returns the raw desktop crop — the page is somewhere inside it, behind the
 * toolbar. Locating it is the caller's job, because only the caller knows
 * whether it already holds a valid measurement.
 */
export async function shootBrowserWindow(
  port = configuredPort,
): Promise<HTMLCanvasElement | null> {
  if (typeof window === 'undefined') return null;
  const base = cachedBase ?? baseUrl(port);

  // The window's rectangle in desktop points — the same space `screencapture
  // -R` reads, which is what makes this multi-display-safe for free.
  const body = JSON.stringify({
    x: window.screenX,
    y: window.screenY,
    w: window.outerWidth,
    h: window.outerHeight,
  });

  const res = await fetchWithTimeout(
    `${base}/qapture/shot`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body },
    SHOT_TIMEOUT_MS,
  );
  if (!res || !res.ok) return null;

  let payload: { png?: string };
  try {
    payload = (await res.json()) as { png?: string };
  } catch {
    return null;
  }
  if (!payload.png) return null;

  return decodeToCanvas(payload.png);
}

function decodeToCanvas(dataUrl: string): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// The cached measurement
// ---------------------------------------------------------------------------

let cachedMapping: FrameMapping | null = null;
let cachedFor = '';

/** The measurement for this window geometry, if we still have a valid one. */
export function getCachedMapping(): FrameMapping | null {
  if (!cachedMapping) return null;
  return environmentSignature() === cachedFor ? cachedMapping : null;
}

/** Remember a measurement against the geometry it was taken at. */
export function cacheMapping(m: FrameMapping | null): void {
  cachedMapping = m;
  cachedFor = m ? environmentSignature() : '';
}

