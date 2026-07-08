/**
 * standalone.ts — entry point for non-React hosts.
 *
 * Exposes the imperative mount so a plain <script> or web-component wrapper
 * can boot Qapture without a React peer in the host app.
 *
 * Also registers a <qapture-widget> custom element (best-effort) that reads
 * its config from a `config` attribute (JSON string) or a `.config` property.
 */

export { initQaStudio } from './index';
export type { QaConfig } from './index';

// ---------------------------------------------------------------------------
// <qapture-widget> custom element (best-effort; skipped on SSR)
// ---------------------------------------------------------------------------

if (
  typeof window !== 'undefined' &&
  typeof customElements !== 'undefined' &&
  !customElements.get('qapture-widget')
) {
  // Lazily import so tree-shakers can drop this if the entry is never used.
  import('./index').then(({ initQaStudio: init }) => {
    class QaStudioWidget extends HTMLElement {
      private _destroy: (() => void) | undefined;

      connectedCallback(): void {
        if (this._destroy) return; // already mounted (e.g. by the sweep below)
        let cfg = {};
        try {
          const attr = this.getAttribute('config');
          if (attr) cfg = JSON.parse(attr) as Record<string, unknown>;
        } catch {
          // malformed JSON — use defaults
        }
        // Allow property-based config too: <element>.config = {...}
        const propCfg = (this as unknown as Record<string, unknown>)['config'];
        if (propCfg && typeof propCfg === 'object' && !Array.isArray(propCfg)) {
          cfg = propCfg as Record<string, unknown>;
        }
        const instance = init(cfg);
        this._destroy = instance.destroy;
      }

      disconnectedCallback(): void {
        this._destroy?.();
        this._destroy = undefined;
      }
    }

    customElements.define('qapture-widget', QaStudioWidget);

    // An element that connected and then disconnected again before this
    // dynamic import resolved never got a connectedCallback — browsers only
    // upgrade (and invoke connectedCallback on) elements that are still
    // connected at the moment the class is defined. Sweep for any instance
    // that's connected right now but wasn't mounted by that native upgrade
    // and mount it manually; connectedCallback's guard above makes this a
    // no-op for instances the native upgrade already handled.
    document.querySelectorAll('qapture-widget').forEach((el) => {
      if (el instanceof QaStudioWidget && el.isConnected) {
        el.connectedCallback();
      }
    });
  }).catch(() => {
    // Swallow import errors — not critical
  });
}
