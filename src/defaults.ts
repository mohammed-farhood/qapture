/**
 * defaults.ts — Default configuration for qa-studio.
 *
 * Neutral indigo/slate colour palette; no credentials or journey by default.
 * `visible: undefined` is the sentinel for "dev-only" — ShadowMount checks
 * NODE_ENV (or a framework equivalent) at mount time.
 *
 * DEFAULT_THEME is re-exported from schema.ts to avoid a circular dependency
 * (schema.ts must not import from this file).
 */

import type { ResolvedConfig } from './config/schema';
export { DEFAULT_THEME } from './config/schema';

export const DEFAULT_CONFIG: ResolvedConfig = {
  namespace:    'qa-studio',
  theme: {
    primary:     '#4f46e5', // indigo-600
    primaryDark: '#3730a3', // indigo-800
    accent:      '#7c3aed', // violet-600
    accentDark:  '#6d28d9', // violet-700
    sage:        '#6b7280', // gray-500
    cream:       '#f8fafc', // slate-50
    mauve:       '#a78bfa', // violet-400
    surface:     '#ffffff',
    ink:         '#1f2937', // gray-800
  },
  brand:        { label: 'QA Studio' },
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
};
