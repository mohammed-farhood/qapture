/**
 * qa-studio — public API (Phase 0 placeholder; Phase 1 fills the real runtime).
 *
 * Ships ZERO AI: this is a keyless, secretless, 100% client-side capture widget.
 * The real <QaStudio/> mounts an isolated Shadow-DOM host on the client and
 * renders nothing on the server.
 */

export type QaConfig = Record<string, unknown>;

/** Declarative entry. Returns null until the Phase 1 runtime lands. */
export function QaStudio(_props: { config?: QaConfig }): null {
  return null;
}

/** Imperative entry for non-React / standalone hosts. */
export function initQaStudio(_config?: QaConfig): { destroy: () => void } {
  return { destroy() {} };
}
