/**
 * qapture — public API.
 *
 * Ships ZERO AI: this is a keyless, secretless, 100% client-side capture
 * widget. The <Qapture/> component and initQaStudio() imperative function
 * both mount an isolated Shadow-DOM host on the client and render nothing on
 * the server (SSR-safe).
 */

// Re-export all public config types so consumers can type their config objects
// without a separate import path.
export type {
  QaConfig,
  ResolvedConfig,
  QaTheme,
  QaBilingual,
  QaCredential,
  QaJourneyLane,
  QaJourneyStep,
  QaRisk,
  QaPreamble,
} from './config/schema';

import { useEffect } from 'react';
import type { QaConfig } from './config/schema';
import { validateConfig } from './config/schema';
import { mountQaStudio } from './mount/ShadowMount';

// ---------------------------------------------------------------------------
// Imperative entry
// ---------------------------------------------------------------------------

/**
 * Mount qapture imperatively.
 *
 * Validates and resolves the supplied config, then mounts the widget into an
 * isolated Shadow-DOM host attached to document.body. Returns a handle with a
 * destroy() method that unmounts and cleans up.
 *
 * SSR-safe: returns a no-op destroy() when called outside a browser.
 */
export function initQaStudio(config?: QaConfig): { destroy(): void } {
  if (typeof window === 'undefined') {
    return { destroy() {} };
  }

  const { config: resolved, warnings } = validateConfig(config);

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn('[Qapture]', w);
  }

  return mountQaStudio(resolved);
}

// ---------------------------------------------------------------------------
// Declarative React entry
// ---------------------------------------------------------------------------

/**
 * Drop-in React component that mounts qapture on the client.
 *
 * Renders `null` (SSR-safe). On mount it calls initQaStudio() and returns its
 * destroy() for useEffect cleanup. Config changes after mount are ignored
 * (destroy + remount if needed).
 *
 * Usage (Next.js App Router):
 *   import { Qapture } from 'qapture/next';  // adds 'use client' banner
 *   <Qapture config={qaConfig} />
 *
 * Usage (any React app):
 *   import { Qapture } from 'qapture';
 *   <Qapture config={qaConfig} />
 */
export function Qapture({ config }: { config?: QaConfig }): null {
  useEffect(() => {
    const instance = initQaStudio(config);
    return () => instance.destroy();
    // intentionally [] — mount once; remount is user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Backward-compatible alias
export { Qapture as QaStudio };
