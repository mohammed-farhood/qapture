/**
 * schema.ts — all public config types + a runtime validator for qapture.
 *
 * validateConfig() deep-merges user input over the built-in defaults, coerces
 * or skips invalid entries, and NEVER throws. Returns a fully-resolved config
 * plus human-readable warnings.
 *
 * Also exports DEFAULT_THEME so that defaults.ts can import it without
 * creating a circular dependency (defaults.ts → schema.ts, not the reverse).
 */

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

/** A bilingual string: either a plain string (language-neutral) or { en, ar? }. */
export type QaBilingual = string | { en: string; ar?: string };

/** Brand colour palette for the QA panel. All fields optional on input. */
export type QaTheme = {
  primary: string;
  primaryDark: string;
  accent: string;
  accentDark: string;
  sage: string;
  cream: string;
  mauve: string;
  surface: string;
  ink: string;
};

/** A single test credential row. */
export type QaCredential = {
  role: string;
  roleAr?: string;
  login: string;
  password: string;
  seeded?: boolean;
  hint?: { en: string; ar?: string };
};

/** Risk level for a journey step. */
export type QaRisk = 'red' | 'amber' | 'green';

/** One step inside a journey lane. */
export type QaJourneyStep = {
  path: string;
  what: QaBilingual;
  risk?: QaRisk;
  riskWhy?: string;
};

/** A role-grouped journey lane. */
export type QaJourneyLane = {
  id: string;
  color?: string;
  role: QaBilingual;
  steps: QaJourneyStep[];
};

/**
 * Freeform preamble block consumed by AI agents in Phase 2.
 * All fields optional; additional keys allowed via index signature.
 *
 * conventions, invariants, verifySteps, and runCommands all accept either a
 * single string (plain text / newline-separated) or an explicit string[].
 * The export layer normalises both forms before rendering.
 */
export type QaPreamble = {
  projectName?: string;
  oneLiner?: string;
  stack?: string;
  runCommands?: string | string[];
  /** Numbered conventions list — plain string or explicit array. */
  conventions?: string | string[];
  /** Do-not-break invariants — plain string or explicit array. */
  invariants?: string | string[];
  /** Steps to verify a fix — plain string or explicit array. */
  verifySteps?: string | string[];
  additionalContext?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Input config (consumer writes partial shapes)
// ---------------------------------------------------------------------------

export type QaConfig = {
  /** Storage + DB namespace. Defaults to 'qapture'. */
  namespace?: string;
  /** Override any subset of the colour palette. */
  theme?: Partial<QaTheme>;
  /** Panel brand label. */
  brand?: { label?: string };
  /** Display label for the login/username field. */
  loginField?: { en: string; ar?: string };
  /** Test credentials list. */
  credentials?: QaCredential[];
  /** Role-grouped testing journey. */
  journey?: QaJourneyLane[];
  /** AI agent preamble block. */
  preamble?: QaPreamble;
  /** If true, default language initializes to 'ar' (RTL). */
  rtl?: boolean;
  /**
   * Whether the panel is visible.
   * - true / false: always show / always hide
   * - undefined (default): ShadowMount treats as "dev-only" (show only when
   *   process.env.NODE_ENV !== 'production' or equivalent)
   */
  visible?: boolean;
  /** Always visible, even in production. Overrides `visible`. */
  alwaysVisible?: boolean;
  /** Keyboard shortcut to toggle the panel. Default: 'shift+alt+q'. */
  hotkey?: string;
};

// ---------------------------------------------------------------------------
// Resolved config (no optional keys — returned by validateConfig)
// ---------------------------------------------------------------------------

export type ResolvedConfig = {
  namespace: string;
  theme: QaTheme;
  brand: { label: string };
  loginField: { en: string; ar?: string };
  credentials: QaCredential[];
  journey: QaJourneyLane[];
  preamble: QaPreamble | null;
  rtl: boolean;
  /**
   * Visibility sentinel.
   * - true: always show
   * - false: always hide
   * - undefined: dev-only (ShadowMount interprets at mount time)
   *
   * The key is always present in ResolvedConfig; only the value may be undefined.
   */
  visible: boolean | undefined;
  alwaysVisible: boolean;
  hotkey: string;
};

// ---------------------------------------------------------------------------
// Built-in default theme (neutral indigo/slate palette)
// Exported here so defaults.ts can import it without circular deps.
// ---------------------------------------------------------------------------

export const DEFAULT_THEME: QaTheme = {
  primary:     '#4f46e5', // indigo-600
  primaryDark: '#3730a3', // indigo-800
  accent:      '#7c3aed', // violet-600
  accentDark:  '#6d28d9', // violet-700
  sage:        '#6b7280', // gray-500
  cream:       '#f8fafc', // slate-50
  mauve:       '#a78bfa', // violet-400
  surface:     '#ffffff',
  ink:         '#1f2937', // gray-800
};

// Inline defaults used by validateConfig (avoids importing from defaults.ts).
const DEFAULTS = {
  namespace:     'qapture',
  brandLabel:    'Qapture',
  loginField:    { en: 'Username', ar: 'اسم المستخدم' } as { en: string; ar?: string },
  rtl:           false,
  visible:       undefined as boolean | undefined,
  alwaysVisible: false,
  hotkey:        'shift+alt+q',
};

// ---------------------------------------------------------------------------
// Validator utilities
// ---------------------------------------------------------------------------

const VALID_RISKS = new Set<QaRisk>(['red', 'amber', 'green']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidBilingual(v: unknown): v is QaBilingual {
  if (typeof v === 'string') return true;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return typeof o['en'] === 'string';
  }
  return false;
}

function coerceTheme(input: Partial<QaTheme> | undefined): QaTheme {
  if (!input || typeof input !== 'object') return { ...DEFAULT_THEME };
  const out: QaTheme = { ...DEFAULT_THEME };
  const keys: (keyof QaTheme)[] = [
    'primary', 'primaryDark', 'accent', 'accentDark',
    'sage', 'cream', 'mauve', 'surface', 'ink',
  ];
  for (const k of keys) {
    const v = input[k];
    if (typeof v === 'string' && v.trim().length > 0) {
      out[k] = v.trim();
    }
  }
  return out;
}

function coerceCredentials(raw: unknown, warnings: string[]): QaCredential[] {
  if (!Array.isArray(raw)) return [];
  const out: QaCredential[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown>;
    if (!c || typeof c !== 'object') {
      warnings.push(`credentials[${i}]: not an object — skipped`);
      continue;
    }
    if (!isNonEmptyString(c['role'])) {
      warnings.push(`credentials[${i}]: missing or empty "role" — skipped`);
      continue;
    }
    if (!isNonEmptyString(c['login'])) {
      warnings.push(`credentials[${i}] (role="${String(c['role'])}"): missing or empty "login" — skipped`);
      continue;
    }
    const cred: QaCredential = {
      role:     (c['role'] as string).trim(),
      login:    (c['login'] as string).trim(),
      password: isNonEmptyString(c['password']) ? (c['password'] as string).trim() : '',
    };
    if (isNonEmptyString(c['roleAr'])) cred.roleAr = (c['roleAr'] as string).trim();
    if (typeof c['seeded'] === 'boolean') cred.seeded = c['seeded'];
    if (c['hint'] !== null && c['hint'] !== undefined && typeof c['hint'] === 'object') {
      const h = c['hint'] as Record<string, unknown>;
      if (typeof h['en'] === 'string') {
        cred.hint = { en: h['en'] };
        if (typeof h['ar'] === 'string') cred.hint.ar = h['ar'];
      }
    }
    out.push(cred);
  }
  return out;
}

function coerceJourney(raw: unknown, warnings: string[]): QaJourneyLane[] {
  if (!Array.isArray(raw)) return [];
  const out: QaJourneyLane[] = [];
  for (let i = 0; i < raw.length; i++) {
    const lane = raw[i] as Record<string, unknown>;
    if (!lane || typeof lane !== 'object') {
      warnings.push(`journey[${i}]: not an object — skipped`);
      continue;
    }
    if (!isNonEmptyString(lane['id'])) {
      warnings.push(`journey[${i}]: missing or empty "id" — skipped`);
      continue;
    }
    if (!isValidBilingual(lane['role'])) {
      warnings.push(`journey[${i}] (id="${String(lane['id'])}"): invalid "role" — skipped`);
      continue;
    }
    if (!Array.isArray(lane['steps'])) {
      warnings.push(`journey[${i}] (id="${String(lane['id'])}"): "steps" is not an array — lane skipped`);
      continue;
    }
    const steps: QaJourneyStep[] = [];
    const rawSteps = lane['steps'] as unknown[];
    for (let j = 0; j < rawSteps.length; j++) {
      const s = rawSteps[j] as Record<string, unknown>;
      if (!s || typeof s !== 'object') {
        warnings.push(`journey[${i}].steps[${j}]: not an object — skipped`);
        continue;
      }
      if (!isNonEmptyString(s['path'])) {
        warnings.push(`journey[${i}].steps[${j}]: missing or empty "path" — skipped`);
        continue;
      }
      if (!isValidBilingual(s['what'])) {
        warnings.push(`journey[${i}].steps[${j}] (path="${String(s['path'])}"): invalid "what" — skipped`);
        continue;
      }
      const step: QaJourneyStep = {
        path: (s['path'] as string).trim(),
        what: s['what'] as QaBilingual,
      };
      if (s['risk'] !== undefined) {
        if (VALID_RISKS.has(s['risk'] as QaRisk)) {
          step.risk = s['risk'] as QaRisk;
        } else {
          warnings.push(`journey[${i}].steps[${j}]: invalid risk "${String(s['risk'])}" — ignored`);
        }
      }
      if (isNonEmptyString(s['riskWhy'])) step.riskWhy = s['riskWhy'] as string;
      steps.push(step);
    }
    const resolved: QaJourneyLane = {
      id:    (lane['id'] as string).trim(),
      role:  lane['role'] as QaBilingual,
      steps,
    };
    if (isNonEmptyString(lane['color'])) resolved.color = (lane['color'] as string).trim();
    out.push(resolved);
  }
  return out;
}

function coercePreamble(raw: unknown): QaPreamble | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as QaPreamble;
}

// ---------------------------------------------------------------------------
// Public validator
// ---------------------------------------------------------------------------

/**
 * Validate and deep-resolve a user-supplied QaConfig.
 *
 * - NEVER throws
 * - Empty/undefined input → valid empty-but-usable config
 * - Coerces invalid entries and collects human-readable warnings
 */
export function validateConfig(
  input: QaConfig | undefined,
): { config: ResolvedConfig; warnings: string[] } {
  const warnings: string[] = [];

  if (input === undefined || input === null) {
    return {
      config: {
        namespace:    DEFAULTS.namespace,
        theme:        { ...DEFAULT_THEME },
        brand:        { label: DEFAULTS.brandLabel },
        loginField:   { ...DEFAULTS.loginField },
        credentials:  [],
        journey:      [],
        preamble:     null,
        rtl:          DEFAULTS.rtl,
        visible:      DEFAULTS.visible,
        alwaysVisible: DEFAULTS.alwaysVisible,
        hotkey:       DEFAULTS.hotkey,
      },
      warnings,
    };
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    warnings.push('config: expected an object — using defaults');
    return {
      config: {
        namespace:    DEFAULTS.namespace,
        theme:        { ...DEFAULT_THEME },
        brand:        { label: DEFAULTS.brandLabel },
        loginField:   { ...DEFAULTS.loginField },
        credentials:  [],
        journey:      [],
        preamble:     null,
        rtl:          DEFAULTS.rtl,
        visible:      DEFAULTS.visible,
        alwaysVisible: DEFAULTS.alwaysVisible,
        hotkey:       DEFAULTS.hotkey,
      },
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  // namespace
  const namespace = isNonEmptyString(raw['namespace'])
    ? (raw['namespace'] as string).trim()
    : DEFAULTS.namespace;

  // theme
  const theme = coerceTheme(raw['theme'] as Partial<QaTheme> | undefined);

  // brand
  let brandLabel = DEFAULTS.brandLabel;
  if (raw['brand'] !== undefined && raw['brand'] !== null && typeof raw['brand'] === 'object') {
    const b = raw['brand'] as Record<string, unknown>;
    if (isNonEmptyString(b['label'])) brandLabel = (b['label'] as string).trim();
  }

  // loginField
  let loginField: { en: string; ar?: string } = { ...DEFAULTS.loginField };
  if (raw['loginField'] !== undefined && typeof raw['loginField'] === 'object' && raw['loginField'] !== null) {
    const lf = raw['loginField'] as Record<string, unknown>;
    if (typeof lf['en'] === 'string') {
      loginField = { en: lf['en'] };
      if (typeof lf['ar'] === 'string') loginField.ar = lf['ar'];
    } else {
      warnings.push('loginField: missing "en" key — using default');
    }
  }

  // credentials
  const credentials = raw['credentials'] !== undefined
    ? coerceCredentials(raw['credentials'], warnings)
    : [];

  // journey
  const journey = raw['journey'] !== undefined
    ? coerceJourney(raw['journey'], warnings)
    : [];

  // preamble
  const preamble = raw['preamble'] !== undefined
    ? coercePreamble(raw['preamble'])
    : null;

  // scalar booleans / strings
  const rtl = typeof raw['rtl'] === 'boolean' ? raw['rtl'] : DEFAULTS.rtl;
  const alwaysVisible = typeof raw['alwaysVisible'] === 'boolean'
    ? raw['alwaysVisible']
    : DEFAULTS.alwaysVisible;
  const hotkey = isNonEmptyString(raw['hotkey'])
    ? (raw['hotkey'] as string).trim()
    : DEFAULTS.hotkey;

  // visible: true | false | undefined (sentinel for dev-only)
  let visible: boolean | undefined = DEFAULTS.visible;
  if (raw['visible'] !== undefined) {
    if (typeof raw['visible'] === 'boolean') {
      visible = raw['visible'];
    } else {
      warnings.push('visible: expected boolean — using default (dev-only)');
    }
  }

  return {
    config: {
      namespace,
      theme,
      brand: { label: brandLabel },
      loginField,
      credentials,
      journey,
      preamble,
      rtl,
      visible,
      alwaysVisible,
      hotkey,
    },
    warnings,
  };
}
