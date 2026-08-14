/**
 * ShadowMount.ts — imperatively mounts qapture into an isolated Shadow DOM.
 *
 * Creates a <qapture> custom element appended to document.body, attaches an
 * open shadow root, injects the QA_CSS stylesheet (all colour comes from the
 * fixed Graphite tokens defined in that stylesheet's own `:host` block — v0.3
 * removed per-consumer theming, so there is no host CSS-variable step here
 * any more), then renders <QaRoot> into the shadow via ReactDOM.createRoot.
 *
 * Also starts the runtime-context ring buffer (console/error/network capture
 * that gets attached to notes) right after mount, unless the resolved config
 * opts out via `captureContext: false`.
 *
 * The returned destroy() function stops that capture, unmounts React, removes
 * the host element from the DOM, and cleans up any light-DOM flash boxes that
 * highlight.ts created.
 *
 * SSR-safe: returns a no-op destroy() when typeof window === 'undefined'.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ResolvedConfig } from '../config/schema';
import { injectStyles } from '../lib/styles';
import { installContextCapture, uninstallContextCapture } from '../lib/contextBuffer';
import QaRoot from '../components/QaRoot';

export type QaStudioInstance = {
  destroy(): void;
};

/**
 * Inline styles for the host element (v0.6).
 *
 * WHY THIS EXISTS — "the tool doesn't appear on some pages"
 * --------------------------------------------------------
 * Until now the host was an unstyled custom element and every visible piece
 * lived in the shadow root at z-index ~9990–10097. Those values compete in
 * the PAGE's root stacking context, so any app chrome with a bigger number —
 * and a z-index arms race is normal in real apps, where sticky headers,
 * drawers, cookie banners and modal libraries routinely sit at 99999 or
 * 2147483647 — simply covered the widget. It was mounted, it was working, it
 * was underneath something.
 *
 * Making the host itself a fixed, top-of-the-range stacking context fixes
 * that once for every layer inside it: internal ordering is preserved
 * (children keep their relative z-indexes) but the whole widget is lifted
 * above the page in one step.
 *
 * The box is deliberately 0×0 with pointer-events:none — it must never
 * intercept a click meant for the app. The actual UI inside is
 * position:fixed (so the viewport, not this box, is its containing block —
 * a fixed ancestor alone does not become one) and re-enables pointer events
 * for itself.
 */
const HOST_STYLE = [
  'position:fixed',
  'top:0',
  'left:0',
  'width:0',
  'height:0',
  // Just below the 32-bit maximum, leaving room for anything that
  // deliberately wants to sit on top of even this (a screen reader overlay,
  // a browser extension).
  'z-index:2147483000',
  'isolation:isolate',
  'pointer-events:none',
].join(';');

/** Run `fn` once the document has a <body> to attach to. */
function whenBodyReady(fn: () => void): void {
  if (document.body) { fn(); return; }
  // A synchronous script in <head> (or an early standalone init) runs before
  // the body exists; appendChild would throw and the widget would silently
  // never mount.
  document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
}

export function mountQaStudio(config: ResolvedConfig): QaStudioInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }

  // Create and attach the shadow host element. NOTE: the tag MUST contain a
  // hyphen — only valid custom-element names (and a fixed set of standard
  // elements) support attachShadow; a bare <qapture> would throw NotSupportedError.
  const host = document.createElement('qapture-overlay');
  host.setAttribute('data-qa-overlay', 'true');
  host.setAttribute('style', HOST_STYLE);

  let destroyed = false;

  /**
   * Keep the host attached (v0.6) — the other half of "it disappears on some
   * pages".
   *
   * Frameworks and page transitions do occasionally clear or replace the
   * contents of <body>: a hydration mismatch, a router that swaps the whole
   * tree, a library that resets innerHTML, a "clean up stray nodes" pass.
   * When that happens the widget vanishes mid-session and the tester assumes
   * it broke. React never re-runs its mount effect for this, because from
   * React's point of view nothing changed — the root it renders into is
   * simply no longer in the document.
   *
   * So we watch, and put ourselves back. The observer only fires on child
   * changes to <body>, and only acts when the host is genuinely disconnected,
   * so re-attaching cannot loop.
   */
  let guard: MutationObserver | null = null;
  function startAttachGuard(): void {
    if (typeof MutationObserver === 'undefined' || !document.body) return;
    guard = new MutationObserver(() => {
      if (destroyed || host.isConnected || !document.body) return;
      try {
        document.body.appendChild(host);
      } catch {
        // If even this fails the page is being torn down; nothing to do.
      }
    });
    guard.observe(document.body, { childList: true });
  }

  whenBodyReady(() => {
    if (destroyed) return;
    document.body.appendChild(host);
    startAttachGuard();
  });

  // Open shadow root
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject the QA stylesheet into the shadow root. Every colour the widget
  // uses lives in that stylesheet's own :host token block — there is no
  // per-instance theme step any more (v0.3.0 removed custom theming).
  injectStyles(shadow);

  // Mount React into the shadow root.
  // ShadowRoot extends DocumentFragment which is accepted by createRoot.
  const root = ReactDOM.createRoot(shadow);
  root.render(React.createElement(QaRoot, { config }));

  // Start recording console/error/network events for note context, unless
  // the consumer explicitly opted out.
  if (config.captureContext !== false) {
    installContextCapture();
  }

  return {
    destroy() {
      // Flag first: the attach guard must not resurrect a host we are
      // deliberately removing.
      destroyed = true;
      if (guard) { guard.disconnect(); guard = null; }

      // Mirror the mount-time condition exactly: uninstallContextCapture()
      // decrements a shared nested-mount refCount (see contextBuffer.ts), so
      // an instance that never incremented it (captureContext: false) must
      // never decrement it either — otherwise it could consume a ref-count
      // token that belongs to a DIFFERENT, still-live instance and cause a
      // premature restore of the wrapped globals out from under it.
      if (config.captureContext !== false) {
        uninstallContextCapture();
      }

      try {
        root.unmount();
      } catch {
        // ignore errors during unmount (e.g. already unmounted)
      }

      // Remove the shadow host from the document
      if (host.parentNode) host.remove();

      // Clean up any light-DOM flash boxes injected by highlight.ts — plain
      // <div data-qa-overlay> children of <body>. The :not(qapture-overlay)
      // guard matters: destroy() can run AFTER a replacement instance has
      // already mounted its own host (React StrictMode remounts, and the
      // deferred teardown in index.ts), and a bare [data-qa-overlay] sweep
      // would tear that live host out of the document.
      if (typeof document !== 'undefined') {
        document.body
          .querySelectorAll(':scope > [data-qa-overlay]:not(qapture-overlay)')
          .forEach((el) => el.remove());
      }
    },
  };
}
