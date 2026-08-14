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

/**
 * One thing the tester did. v0.5 "Loop".
 *
 * A bug report without steps to reproduce is a riddle. Testers rarely write
 * them (they were busy testing), and by the time anyone asks, the sequence is
 * gone. This records it automatically: the handful of interactions leading up
 * to each note, in order, with timings.
 *
 * PRIVACY — this is the strictest part of the module, because unlike console
 * output, interactions happen ON the data:
 *  - What was TYPED is never recorded. An edit records only *that* a field
 *    was typed into, identified by its visible label.
 *  - A `<select>`'s chosen option is not recorded either — an option's text is
 *    routinely a customer name or an address.
 *  - Checkboxes and radios record on/off, which is UI state, not content.
 *  - Only non-character keys (Enter, Escape, Tab, arrows) are recorded, so a
 *    keystroke trail can never reconstruct typed text.
 *  - Anything inside a password field records as the bare fact of an edit.
 * The same query-string redaction used for URLs applies to navigation.
 */
export type QaStep = {
  t: number;
  kind: 'click' | 'type' | 'toggle' | 'select' | 'submit' | 'key' | 'nav';
  /** What the tester would call it — the element's visible/accessible name. */
  label: string;
  selector?: string;
  /** Non-content extras: 'on'/'off' for a toggle, the key name for a key. */
  detail?: string;
  /** Consecutive identical steps collapse into one with a count. */
  repeat?: number;
};

export type QaNoteContext = {
  events: QaContextEvent[];
  env: QaEnvSnapshot;
  forensics?: QaTargetForensics;
  /** The last few things the tester did before this note. See QaStep. */
  steps?: QaStep[];
};

// ---------------------------------------------------------------------------
// Ring buffer
// ---------------------------------------------------------------------------

const RING_CAP = 75;
/** Cap on any single recorded string, so one giant log line can't dominate. */
const MAX_MESSAGE_CHARS = 600;
/** Cap on captured outerHTML. */
const MAX_HTML_CHARS = 600;

/**
 * How many interaction steps to keep. Deliberately much smaller than the
 * event ring: "the last dozen things I did" is a reproduction recipe, while
 * a hundred would just be a diary nobody reads.
 */
const STEP_CAP = 25;
/** How many are attached to a note by default. */
const STEPS_PER_NOTE = 12;
/** Two identical interactions closer than this collapse into one step. */
const STEP_MERGE_MS = 4000;
/** Cap on a step's label. */
const MAX_LABEL_CHARS = 60;

let ring: QaContextEvent[] = [];
let steps: QaStep[] = [];
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
  // v0.5 step recorder
  onClick?: (e: Event) => void;
  onInput?: (e: Event) => void;
  onChange?: (e: Event) => void;
  onSubmit?: (e: Event) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  onPopState?: () => void;
  pushState?: typeof history.pushState;
  replaceState?: typeof history.replaceState;
};
const original: Original = {};

/**
 * Subscribers notified when something breaks (v0.5 "error catcher").
 *
 * The buffer has always SEEN every crash and failed request; it just waited
 * to be asked. The most valuable bug is the one the tester never noticed —
 * an uncaught exception behind a spinner, a 500 on a background save — so
 * the widget now offers to capture it at the moment it happens.
 *
 * Only genuine breakage is announced: uncaught errors, unhandled rejections,
 * and network calls that failed outright or came back 5xx. `console.error`
 * is deliberately excluded — apps log to it constantly, including on purpose,
 * and a prompt per console line would be unusable.
 */
export type QaIssue = {
  t: number;
  kind: 'error' | 'network';
  /** One line a human can read on a toast. */
  summary: string;
};

type IssueListener = (issue: QaIssue) => void;
const issueListeners = new Set<IssueListener>();

/** Subscribe to "something just broke". Returns an unsubscribe function. */
export function onIssue(fn: IssueListener): () => void {
  issueListeners.add(fn);
  return () => { issueListeners.delete(fn); };
}

function announce(ev: QaContextEvent): void {
  if (!issueListeners.size) return;
  let issue: QaIssue | null = null;
  if (ev.kind === 'error') {
    issue = { t: ev.t, kind: 'error', summary: ev.message };
  } else if (ev.kind === 'network' && (ev.status === null || ev.status >= 500)) {
    const what = ev.status === null ? (ev.error ?? 'failed') : String(ev.status);
    issue = { t: ev.t, kind: 'network', summary: `${ev.method} ${ev.url} → ${what}` };
  }
  if (!issue) return;
  for (const fn of issueListeners) {
    try { fn(issue); } catch { /* a broken subscriber must not break capture */ }
  }
}

function push(ev: QaContextEvent): void {
  announce(ev);
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
// Step recorder (v0.5) — see QaStep for the privacy rules this enforces
// ---------------------------------------------------------------------------

/** Trim, collapse whitespace, and cap — labels go into a one-line list. */
function label(raw: string | null | undefined): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_LABEL_CHARS ? `${s.slice(0, MAX_LABEL_CHARS)}…` : s;
}

/**
 * What a human would call this element.
 *
 * Order matters: an explicit accessible name beats visible text, which beats
 * a placeholder, which beats a machine name. NEVER falls back to the
 * element's `value` — that is the content the tester typed.
 */
function nameFor(el: Element): string {
  const html = el as HTMLElement;
  const aria = label(html.getAttribute?.('aria-label'));
  if (aria) return aria;

  const labelledBy = html.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const owner = document.getElementById(labelledBy.split(/\s+/)[0]);
    const text = label(owner?.textContent);
    if (text) return text;
  }

  // A form control's own <label>, by wrapping or by `for=`.
  const id = html.getAttribute?.('id');
  if (id) {
    try {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      const text = label(explicit?.textContent);
      if (text) return text;
    } catch { /* exotic id — fall through */ }
  }
  const wrapping = html.closest?.('label');
  if (wrapping) {
    const text = label(wrapping.textContent);
    if (text) return text;
  }

  const alt = label(html.getAttribute?.('alt'));
  if (alt) return alt;
  const title = label(html.getAttribute?.('title'));
  if (title) return title;

  // Visible text, but only for elements small enough that their text IS
  // their name — otherwise clicking a page section would dump a paragraph.
  const text = label(html.innerText ?? html.textContent);
  if (text && text.length <= MAX_LABEL_CHARS) return text;

  const placeholder = label(html.getAttribute?.('placeholder'));
  if (placeholder) return placeholder;
  const name = label(html.getAttribute?.('name'));
  if (name) return name;

  return el.tagName ? el.tagName.toLowerCase() : 'element';
}

/** Our own UI must never appear in the tester's steps. */
function isOurs(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof (el as Element).closest !== 'function') return false;
  return !!el.closest('[data-qa-overlay]');
}

function pushStep(step: QaStep): void {
  const previous = steps[steps.length - 1];
  // Collapse a repeat of the same interaction (typing into one field fires an
  // `input` event per keystroke; twenty of those is noise, "typed in Email"
  // is the step).
  if (
    previous &&
    previous.kind === step.kind &&
    previous.label === step.label &&
    previous.detail === step.detail &&
    step.t - previous.t < STEP_MERGE_MS
  ) {
    previous.t = step.t;
    previous.repeat = (previous.repeat ?? 1) + 1;
    return;
  }
  steps.push(step);
  if (steps.length > STEP_CAP) steps = steps.slice(steps.length - STEP_CAP);
}

/**
 * The closest thing to "what the tester meant to click".
 *
 * A click usually lands on an inner <span> or <svg>; the interactive ancestor
 * is what they would name. Falls back to the raw target.
 */
function interactiveAncestor(el: Element): Element {
  const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], label';
  return (el.closest?.(INTERACTIVE) as Element | null) ?? el;
}

function installStepRecorder(): void {
  original.onClick = (e: Event) => {
    const target = e.target as Element | null;
    if (!target || isOurs(target)) return;
    const el = interactiveAncestor(target);
    pushStep({ t: now(), kind: 'click', label: nameFor(el), selector: el.tagName?.toLowerCase() });
  };

  original.onInput = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    if (!el || isOurs(el)) return;
    const tag = el.tagName?.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea' && !el.isContentEditable) return;
    // NOTE: the event's value is deliberately never read — see QaStep.
    const isPassword = (el.type || '').toLowerCase() === 'password';
    pushStep({
      t: now(),
      kind: 'type',
      label: isPassword ? 'password field' : nameFor(el),
      selector: tag,
    });
  };

  original.onChange = (e: Event) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement | null;
    if (!el || isOurs(el)) return;
    const tag = el.tagName?.toLowerCase();
    const type = ((el as HTMLInputElement).type || '').toLowerCase();
    if (tag === 'select') {
      // The chosen option's TEXT is not recorded — it is content.
      pushStep({ t: now(), kind: 'select', label: nameFor(el), selector: tag });
      return;
    }
    if (type === 'checkbox' || type === 'radio') {
      pushStep({
        t: now(),
        kind: 'toggle',
        label: nameFor(el),
        detail: (el as HTMLInputElement).checked ? 'on' : 'off',
        selector: tag,
      });
    }
  };

  original.onSubmit = (e: Event) => {
    const el = e.target as Element | null;
    if (!el || isOurs(el)) return;
    pushStep({ t: now(), kind: 'submit', label: nameFor(el), selector: 'form' });
  };

  // Only non-character keys: a character-key trail would reconstruct typing.
  const NOTABLE_KEYS = new Set([
    'Enter', 'Escape', 'Tab', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown',
  ]);
  original.onKeyDown = (e: KeyboardEvent) => {
    if (!NOTABLE_KEYS.has(e.key)) return;
    if (isOurs(e.target)) return;
    const target = e.target as Element | null;
    pushStep({
      t: now(),
      kind: 'key',
      label: target && target !== document.body ? nameFor(interactiveAncestor(target)) : 'page',
      detail: e.key,
    });
  };

  const recordNav = () => {
    if (typeof location === 'undefined') return;
    pushStep({ t: now(), kind: 'nav', label: redactUrl(location.pathname + location.search) });
  };
  original.onPopState = recordNav;

  document.addEventListener('click', original.onClick, true);
  document.addEventListener('input', original.onInput, true);
  document.addEventListener('change', original.onChange, true);
  document.addEventListener('submit', original.onSubmit, true);
  document.addEventListener('keydown', original.onKeyDown as EventListener, true);
  window.addEventListener('popstate', original.onPopState);
  window.addEventListener('hashchange', original.onPopState);

  // Single-page apps navigate without firing popstate, so wrap the history
  // methods the router actually calls.
  if (typeof history !== 'undefined') {
    original.pushState = history.pushState.bind(history);
    original.replaceState = history.replaceState.bind(history);
    history.pushState = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.pushState!.apply(this, args);
      recordNav();
      return result;
    };
    history.replaceState = function (this: History, ...args: Parameters<History['replaceState']>) {
      const result = original.replaceState!.apply(this, args);
      recordNav();
      return result;
    };
  }
}

function uninstallStepRecorder(): void {
  if (original.onClick) document.removeEventListener('click', original.onClick, true);
  if (original.onInput) document.removeEventListener('input', original.onInput, true);
  if (original.onChange) document.removeEventListener('change', original.onChange, true);
  if (original.onSubmit) document.removeEventListener('submit', original.onSubmit, true);
  if (original.onKeyDown) document.removeEventListener('keydown', original.onKeyDown as EventListener, true);
  if (original.onPopState) {
    window.removeEventListener('popstate', original.onPopState);
    window.removeEventListener('hashchange', original.onPopState);
  }
  if (original.pushState) history.pushState = original.pushState;
  if (original.replaceState) history.replaceState = original.replaceState;
  steps = [];
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

  // — interaction steps (v0.5) —
  installStepRecorder();

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

  uninstallStepRecorder();

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

/**
 * The last few things the tester did, oldest first.
 *
 * Unlike drainSinceLastNote(), this does NOT consume: filing two notes in a
 * row should give both of them the run-up, since the second note is usually
 * about the same sequence.
 */
export function readRecentSteps(limit = STEPS_PER_NOTE): QaStep[] {
  if (!installed) return [];
  return steps.slice(Math.max(0, steps.length - limit)).map((s) => ({ ...s }));
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
