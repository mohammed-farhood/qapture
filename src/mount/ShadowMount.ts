/**
 * ShadowMount.ts — imperatively mounts qapture into an isolated Shadow DOM.
 *
 * Creates a <qapture> custom element appended to document.body, attaches an
 * open shadow root, injects the QA_CSS stylesheet, applies theme CSS variables
 * on the host, then renders <QaRoot> into the shadow via ReactDOM.createRoot.
 *
 * The returned destroy() function unmounts React, removes the host element from
 * the DOM, and cleans up any light-DOM flash boxes that highlight.ts created.
 *
 * SSR-safe: returns a no-op destroy() when typeof window === 'undefined'.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ResolvedConfig } from '../config/schema';
import { injectStyles, applyThemeVars } from '../lib/styles';
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

  // Inject the QA stylesheet into the shadow root
  injectStyles(shadow);

  // Set CSS custom properties (theme colours) on the host element so that
  // var(--qa-*) tokens resolve correctly inside the shadow tree.
  applyThemeVars(host, config.theme);

  // Mount React into the shadow root.
  // ShadowRoot extends DocumentFragment which is accepted by createRoot.
  const root = ReactDOM.createRoot(shadow);
  root.render(React.createElement(QaRoot, { config }));

  return {
    destroy() {
      try {
        root.unmount();
      } catch {
        // ignore errors during unmount (e.g. already unmounted)
      }

      // Remove the shadow host from the document
      if (host.parentNode) host.remove();

      // Clean up any light-DOM flash boxes injected by highlight.ts.
      // These are direct children of <body> with data-qa-overlay but are
      // NOT the <qapture> host element (already removed above).
      if (typeof document !== 'undefined') {
        document.body
          .querySelectorAll(':scope > [data-qa-overlay]')
          .forEach((el) => el.remove());
      }
    },
  };
}
