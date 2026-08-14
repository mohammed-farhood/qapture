/**
 * defaults.ts — Default configuration for qapture.
 *
 * No credentials or journey by default. `visible: undefined` is the sentinel
 * for "dev-only" — ShadowMount checks NODE_ENV (or a framework equivalent) at
 * mount time.
 *
 * Custom themes were removed in Qapture 0.3.0 — there is no theme block here
 * and no DEFAULT_THEME re-export; the widget ships one fixed design.
 */

import type { ResolvedConfig } from './config/schema';

export const DEFAULT_CONFIG: ResolvedConfig = {
  namespace:    'qapture',
  brand:        { label: 'Qapture' },
  loginField:   { en: 'Username', ar: 'اسم المستخدم' },
  credentials:  [],
  journey:      [],
  preamble:     null,
  rtl:          false,
  /**
   * `undefined` is the "dev-only" sentinel.
   * ShadowMount reads this and shows the panel only when
   * process.env.NODE_ENV !== 'production' (or equivalent).
   */
  visible:      undefined,
  alwaysVisible: false,
  hotkey:       'shift+alt+q',
  // Alt/Option-based, because it is the only shortcut family a web page can
  // claim without fighting the browser or the OS — see QaConfig.captureHotkey.
  captureHotkey: 'shift+alt+c',
  captureContext: true,
};
