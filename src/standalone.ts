/**
 * standalone.ts — entry point for non-React hosts.
 *
 * Exposes the imperative mount so a plain <script> or web-component wrapper
 * can boot QA Studio without a React peer in the host app.
 *
 * Also registers a <qa-studio-widget> custom element (best-effort) that reads
 * its config from a `config` attribute (JSON string) or a `.config` property.
 */

export { initQaStudio } from './index';
export type { QaConfig } from './index';

// ---------------------------------------------------------------------------
// <qa-studio-widget> custom element (best-effort; skipped on SSR)
// ---------------------------------------------------------------------------

if (
  typeof window !== 'undefined' &&
  typeof customElements !== 'undefined' &&
  !customElements.get('qa-studio-widget')
) {
  // Lazily import so tree-shakers can drop this if the entry is never used.
  import('./index').then(({ initQaStudio: init }) => {
    customElements.define(
      'qa-studio-widget',
      class QaStudioWidget extends HTMLElement {
        private _destroy: (() => void) | undefined;

        connectedCallback(): void {
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
        }
      },
    );
  }).catch(() => {
    // Swallow import errors — not critical
  });
}
