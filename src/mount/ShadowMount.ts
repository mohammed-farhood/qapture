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

export function mountQaStudio(config: ResolvedConfig): QaStudioInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { destroy() {} };
  }

  // Create and attach the shadow host element. NOTE: the tag MUST contain a
  // hyphen — only valid custom-element names (and a fixed set of standard
  // elements) support attachShadow; a bare <qapture> would throw NotSupportedError.
  const host = document.createElement('qapture-overlay');
  host.setAttribute('data-qa-overlay', 'true');
  document.body.appendChild(host);

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
      uninstallContextCapture();

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
