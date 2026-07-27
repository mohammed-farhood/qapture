/**
 * contextBuffer.ts — the runtime evidence a tester can't see and shouldn't
 * have to describe.
 *
 * A human tester writes "the button does nothing". What the coding agent
 * actually needs is the console error and the 500 that happened at that
 * moment. This module keeps a small ring of recent console/error/network
 * events so every captured note carries the runtime facts around it.
 *
 * Ships zero AI and phones nothing home: everything here stays in the page,
 * and only leaves via the ZIP the tester exports themselves.
 *
 * PRIVACY (deliberate, see SECURITY.md):
 *  - URLs are recorded with their query string REDACTED — tokens and session
 *    ids routinely live there.
 *  - Request/response BODIES and HEADERS are never read or stored.
 *  - No storage, cookie, or form values are ever touched.
 * The buffer is bounded (RING_CAP) so a long session can't grow without limit.
 */

// ---------------------------------------------------------------------------
// Types (contract §3)
// ---------------------------------------------------------------------------

export type QaContextEvent =
  | { t: number; kind: 'console'; level: 'error' | 'warn'; message: string; stack?: string }
  | { t: number; kind: 'error'; message: string; stack?: string }
  | { t: number; kind: 'network'; method: string; url: string; status: number | null; durationMs: number; error?: string };

export type QaEnvSnapshot = {
  url: string;
  route: string;
  viewportW: number;
  viewportH: number;
  dpr: number;
  userAgent: string;
  language: string;
  online: boolean;
  timezone: string;
  pageLoadMs?: number;
  memoryUsedMB?: number;
};

export type QaTargetForensics = {
  /**
   * Truncated outerHTML of the captured element. Live-value-bearing
   * attributes (`value`, `checked`, `selected`) and `<textarea>` text
   * content are stripped from the element AND every descendant before
   * capture — see `sanitizeForForensics` — so this can never carry a real
   * password/email/PII field value, matching the "no form value is ever
   * touched" guarantee in SECURITY.md.
   */
  html?: string;
  styles?: Record<string, string>;
  a11y?: {
    role?: string;
    hasAccessibleName: boolean;
    tabReachable: boolean;
    contrastFlag?: 'low' | 'ok' | 'unknown';
  };
};

export type QaNoteContext = {
  events: QaContextEvent[];
  env: QaEnvSnapshot;
  forensics?: QaTargetForensics;
};

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const RING_CAP = 75;
/** Cap on any single recorded string, so one giant log line can't dominate. */
const MAX_MESSAGE_CHARS = 600;
/** Cap on captured outerHTML. */
const MAX_HTML_CHARS = 600;

let ring: QaContextEvent[] = [];
let installed = false;
/**
 * Nested-mount reference count. React StrictMode's dev-mode double-invoke
 * (effect runs → cleanup runs → effect runs again) combined with this
 * widget's DEFERRED destroy() (queued via queueMicrotask specifically so it
 * never unmounts one React root synchronously while another is still
 * rendering — see the doc comment on <Qapture>'s effect in index.ts) means
 * the SECOND (surviving) mount's installContextCapture() call can run and
 * correctly no-op (capture already active) BEFORE the FIRST (StrictMode
 * throwaway) mount's deferred destroy() finally fires. With a plain
 * boolean, that deferred uninstallContextCapture() call tore down
 * console.error/fetch/XHR wrapping entirely — silently killing context
 * capture for the still-live surviving instance, even though its own widget
 * kept working normally otherwise. Counting nested install() calls and only
 * actually restoring the originals once the count returns to zero keeps
 * capture alive for as long as ANY mounted instance still wants it.
 */
let refCount = 0;

/** Index into `ring` marking what has already been attached to a note. */
let drainedUpTo = 0;

type Original = {
  consoleError?: typeof console.error;
  consoleWarn?: typeof console.warn;
  fetch?: typeof window.fetch;
  xhrOpen?: typeof XMLHttpRequest.prototype.open;
  xhrSend?: typeof XMLHttpRequest.prototype.send;
  onError?: (e: ErrorEvent) => void;
  onRejection?: (e: PromiseRejectionEvent) => void;
};
const original: Original = {};

function push(ev: QaContextEvent): void {
  ring.push(ev);
  if (ring.length > RING_CAP) {
    const overflow = ring.length - RING_CAP;
    ring = ring.slice(overflow);
    // Keep the drain marker pointing at the same logical position.
    drainedUpTo = Math.max(0, drainedUpTo - overflow);
  }
}

function clip(s: unknown, max = MAX_MESSAGE_CHARS): string {
  const str = typeof s === 'string' ? s : safeStringify(s);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function safeStringify(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    // Circular structures, getters that throw, exotic proxies.
    return String(v);
  }
}

function now(): number {
  return Date.now();
}

/**
 * Strip the query string and fragment from a URL.
 * Access tokens, session ids and password-reset codes all routinely travel in
 * query strings, and this buffer ends up in an exported file — so the path is
 * kept (it's what identifies the endpoint) and everything after it is not.
 */
export function redactUrl(raw: string): string {
  const s = String(raw ?? '');
  try {
    const u = new URL(s, typeof location !== 'undefined' ? location.href : 'http://localhost');
    const redacted = u.search ? '?…' : '';
    return `${u.origin}${u.pathname}${redacted}`;
  } catch {
    // Not parseable — fall back to a manual cut so we never leak a query.
    const cut = s.split(/[?#]/)[0];
    return s.length > cut.length ? `${cut}?…` : cut;
  }
}

// ---------------------------------------------------------------------------
// Install / uninstall
// ---------------------------------------------------------------------------

/**
 * Begin recording. Idempotent — calling twice does not double-wrap, which
 * matters because a double-wrapped console.error would record every message
 * twice and recurse through the saved original.
 */
export function installContextCapture(): void {
  refCount += 1;
  if (installed) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;

  // — console.error / console.warn —
  original.consoleError = console.error.bind(console);
  original.consoleWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    push({ t: now(), kind: 'console', level: 'error', message: clip(args.map(safeStringify).join(' ')) });
    original.consoleError?.(...(args as []));
  };
  console.warn = (...args: unknown[]) => {
    push({ t: now(), kind: 'console', level: 'warn', message: clip(args.map(safeStringify).join(' ')) });
    original.consoleWarn?.(...(args as []));
  };

  // — uncaught errors + unhandled rejections —
  original.onError = (e: ErrorEvent) => {
    const ev: QaContextEvent = { t: now(), kind: 'error', message: clip(e.message) };
    if (e.error?.stack) ev.stack = clip(e.error.stack);
    push(ev);
  };
  original.onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const ev: QaContextEvent = {
      t: now(),
      kind: 'error',
      message: clip(reason instanceof Error ? `${reason.name}: ${reason.message}` : safeStringify(reason)),
    };
    if (reason instanceof Error && reason.stack) ev.stack = clip(reason.stack);
    push(ev);
  };
  window.addEventListener('error', original.onError);
  window.addEventListener('unhandledrejection', original.onRejection as EventListener);

  // — fetch —
  if (typeof window.fetch === 'function') {
    original.fetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const started = now();
      const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET') || 'GET').toUpperCase();
      const url = redactUrl(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      try {
        const res = await original.fetch!(input, init);
        push({ t: started, kind: 'network', method, url, status: res.status, durationMs: now() - started });
        return res;
      } catch (err) {
        push({
          t: started, kind: 'network', method, url, status: null,
          durationMs: now() - started, error: clip(err instanceof Error ? err.message : safeStringify(err)),
        });
        throw err;
      }
    };
  }

  // — XMLHttpRequest —
  if (typeof XMLHttpRequest !== 'undefined') {
    original.xhrOpen = XMLHttpRequest.prototype.open;
    original.xhrSend = XMLHttpRequest.prototype.send;

    type TrackedXhr = XMLHttpRequest & { __qaMethod?: string; __qaUrl?: string; __qaStart?: number };

    XMLHttpRequest.prototype.open = function (this: TrackedXhr, method: string, url: string | URL, ...rest: unknown[]) {
      this.__qaMethod = String(method || 'GET').toUpperCase();
      this.__qaUrl = redactUrl(typeof url === 'string' ? url : url.href);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original.xhrOpen as any).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (this: TrackedXhr, ...args: unknown[]) {
      this.__qaStart = now();
      const record = (error?: string) => {
        const ev: QaContextEvent = {
          t: this.__qaStart ?? now(),
          kind: 'network',
          method: this.__qaMethod ?? 'GET',
          url: this.__qaUrl ?? '',
          status: error ? null : this.status,
          durationMs: now() - (this.__qaStart ?? now()),
        };
        if (error) ev.error = error;
        push(ev);
      };
      this.addEventListener('load', () => record());
      this.addEventListener('error', () => record('network error'));
      this.addEventListener('timeout', () => record('timeout'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (original.xhrSend as any).apply(this, args);
    } as typeof XMLHttpRequest.prototype.send;
  }
}

/**
 * Restore every wrapped global. Safe to call when not installed. Only
 * actually restores once the nested-mount refCount returns to zero — see
 * the comment on `refCount` above.
 */
export function uninstallContextCapture(): void {
  if (refCount > 0) refCount -= 1;
  if (!installed || refCount > 0) return;
  installed = false;

  if (original.consoleError) console.error = original.consoleError;
  if (original.consoleWarn) console.warn = original.consoleWarn;
  if (original.fetch) window.fetch = original.fetch;
  if (original.xhrOpen) XMLHttpRequest.prototype.open = original.xhrOpen;
  if (original.xhrSend) XMLHttpRequest.prototype.send = original.xhrSend;
  if (original.onError) window.removeEventListener('error', original.onError);
  if (original.onRejection) {
    window.removeEventListener('unhandledrejection', original.onRejection as EventListener);
  }

  ring = [];
  drainedUpTo = 0;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Events recorded since the previous note. Returns [] when not installed, so
 * callers never need to branch on whether capture is enabled.
 */
export function drainSinceLastNote(): QaContextEvent[] {
  if (!installed) return [];
  const slice = ring.slice(drainedUpTo);
  drainedUpTo = ring.length;
  return slice;
}

/** Environment facts that turn "works on my machine" into a reproducible report. */
export function collectEnvSnapshot(route: string): QaEnvSnapshot {
  const snap: QaEnvSnapshot = {
    url: typeof location !== 'undefined' ? redactUrl(location.href) : '',
    route,
    viewportW: typeof window !== 'undefined' ? window.innerWidth : 0,
    viewportH: typeof window !== 'undefined' ? window.innerHeight : 0,
    dpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
    timezone: '',
  };

  try {
    snap.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    snap.timezone = '';
  }

  try {
    const nav = performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (nav && Number.isFinite(nav.duration) && nav.duration > 0) {
      snap.pageLoadMs = Math.round(nav.duration);
    }
  } catch {
    // performance timing unavailable — omit the field entirely.
  }

  try {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    if (mem?.usedJSHeapSize) snap.memoryUsedMB = Math.round(mem.usedJSHeapSize / 1048576);
  } catch {
    // Chrome-only API — omit elsewhere.
  }

  return snap;
}

/** Relative luminance per WCAG 2.x, used only for the coarse contrast flag. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseRgb(color: string): [number, number, number] | null {
  const m = (color || '').match(/^rgba?\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(parseFloat);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/**
 * Attributes that mirror a field's current value in the raw DOM/HTML
 * (uncontrolled/plain HTML forms, autofill, and server-rendered forms all
 * routinely set these) rather than being purely structural. Forensics must
 * never ship one of these — see PRIVACY note at the top of this file and
 * SECURITY.md's "no form value is ever touched" guarantee.
 */
const SENSITIVE_FORENSICS_ATTRS = ['value', 'checked', 'selected'];

/**
 * Returns a detached clone of `el` with every live field value scrubbed from
 * it AND all of its descendants — a tester can capture a container element
 * (a form, a card) that merely *contains* a password/email input, not just
 * the input itself, so this has to walk the whole subtree rather than just
 * `el`. `<textarea>` stores its live value as text content rather than an
 * attribute, so that is cleared too.
 */
function sanitizeForForensics(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  const nodes: Element[] = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (const node of nodes) {
    for (const attr of SENSITIVE_FORENSICS_ATTRS) {
      if (node.hasAttribute(attr)) node.removeAttribute(attr);
    }
    if (node.tagName === 'TEXTAREA') node.textContent = '';
  }
  return clone;
}

/**
 * Facts about the captured element itself — what it actually is in the DOM,
 * how it's styled, and whether it's reachable. Answers the questions an agent
 * would otherwise have to ask ("is it a real <button>?", "is it even
 * focusable?") straight from the tester's capture.
 */
export function collectTargetForensics(el: Element): QaTargetForensics {
  const out: QaTargetForensics = {};
  if (!el || typeof window === 'undefined') return out;

  try {
    out.html = clip(sanitizeForForensics(el).outerHTML, MAX_HTML_CHARS);
  } catch {
    // Detached or exotic node.
  }

  try {
    const cs = getComputedStyle(el);
    out.styles = {
      display: cs.display,
      position: cs.position,
      overflow: cs.overflow,
      'z-index': cs.zIndex,
      'font-size': cs.fontSize,
      color: cs.color,
      'background-color': cs.backgroundColor,
    };

    const fg = parseRgb(cs.color);
    const bg = parseRgb(cs.backgroundColor);
    let contrastFlag: 'low' | 'ok' | 'unknown' = 'unknown';
    if (fg && bg) {
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      contrastFlag = ratio < 4.5 ? 'low' : 'ok';
    }

    const name =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el as HTMLElement).innerText ||
      el.textContent ||
      '';
    const tabIndexAttr = el.getAttribute('tabindex');
    const nativelyFocusable = /^(a|button|input|select|textarea)$/i.test(el.tagName)
      && !(el as HTMLInputElement).disabled;

    out.a11y = {
      hasAccessibleName: name.trim().length > 0,
      tabReachable: nativelyFocusable || (tabIndexAttr !== null && tabIndexAttr !== '-1'),
      contrastFlag,
    };
    const role = el.getAttribute('role');
    if (role) out.a11y.role = role;
  } catch {
    // getComputedStyle can throw on detached nodes — return what we have.
  }

  return out;
}

/** Test seam: true when the wrappers are currently in place. */
export function isContextCaptureInstalled(): boolean {
  return installed;
}
