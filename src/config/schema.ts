/**
 * schema.ts — all public config types + a runtime validator for qapture.
 *
 * validateConfig() deep-merges user input over the built-in defaults, coerces
 * or skips invalid entries, and NEVER throws. Returns a fully-resolved config
 * plus human-readable warnings.
 *
 * Custom themes were removed in Qapture 0.3.0 — QaConfig.theme is kept only
 * so older config objects still type-check; it is IGNORED by validateConfig
 * (a warning is pushed) and ResolvedConfig no longer carries a theme field.
 */

// ---------------------------------------------------------------------------
// Primitive types
// ---------------------------------------------------------------------------

/** A bilingual string: either a plain string (language-neutral) or { en, ar? }. */
export type QaBilingual = string | { en: string; ar?: string };

/**
 * Brand colour palette for the QA panel.
 *
 * @deprecated Custom themes were removed in Qapture 0.3.0 — the widget now
 * ships one fixed, self-contained design. This type is kept only so that
 * existing `theme?: Partial<QaTheme>` config objects still type-check; it has
 * no effect on the rendered UI.
 */
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
  /** Optional "what pass looks like" — shown alongside `what` when present. */
  expect?: QaBilingual;
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
  /**
   * Override any subset of the colour palette.
   *
   * @deprecated Custom themes were removed in Qapture 0.3.0 — the widget now
   * ships one fixed, self-contained design. This key is IGNORED (a warning is
   * pushed by validateConfig); remove it from your qa.config to silence it.
   */
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
  /**
   * Keyboard shortcut that jumps straight into capture mode, so a tester
   * never has to find the button first. Default: 'shift+alt+c'.
   *
   * Why not a Cmd/Ctrl shortcut: the obvious candidates are taken by things
   * a web page cannot and must not override — Cmd/Ctrl+C is copy, and on
   * macOS Cmd+Q quits the browser before the page ever sees the keystroke.
   * Alt/Option-based chords are the only family a page can claim safely, and
   * they are identical on macOS and Windows (Option = Alt), so one setting
   * covers both.
   */
  captureHotkey?: string;
  /**
   * Whether to capture ambient runtime context (console errors/warnings,
   * uncaught errors, network failures, env snapshot) alongside new notes.
   * Default: true.
   */
  captureContext?: boolean;
};

// ---------------------------------------------------------------------------
// Resolved config (no optional keys — returned by validateConfig)
// ---------------------------------------------------------------------------

export type ResolvedConfig = {
  namespace: string;
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
  captureHotkey: string;
  captureContext: boolean;
};

// ---------------------------------------------------------------------------
// Inline defaults used by validateConfig (avoids importing from defaults.ts).
// ---------------------------------------------------------------------------

const DEFAULTS = {
  namespace:     'qapture',
  brandLabel:    'Qapture',
  loginField:    { en: 'Username', ar: 'اسم المستخدم' } as { en: string; ar?: string },
  rtl:           false,
  visible:       undefined as boolean | undefined,
  alwaysVisible: false,
  hotkey:        'shift+alt+q',
  captureHotkey: 'shift+alt+c',
  captureContext: true,
};

// ---------------------------------------------------------------------------
// Validator utilities
// ---------------------------------------------------------------------------

const VALID_RISKS = new Set<QaRisk>(['red', 'amber', 'green']);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Replace any CR/LF in a string with a space so it can't break a Markdown table row. */
function stripNewlines(v: string): string {
  return v.replace(/\r\n|\r|\n/g, ' ');
}

function isValidBilingual(v: unknown): v is QaBilingual {
  if (typeof v === 'string') return true;
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return typeof o['en'] === 'string';
  }
  return false;
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
      role:     stripNewlines((c['role'] as string).trim()),
      login:    stripNewlines((c['login'] as string).trim()),
      password: isNonEmptyString(c['password']) ? stripNewlines((c['password'] as string).trim()) : '',
    };
    if (isNonEmptyString(c['roleAr'])) cred.roleAr = stripNewlines((c['roleAr'] as string).trim());
    if (typeof c['seeded'] === 'boolean') cred.seeded = c['seeded'];
    if (c['hint'] !== null && c['hint'] !== undefined && typeof c['hint'] === 'object') {
      const h = c['hint'] as Record<string, unknown>;
      if (typeof h['en'] === 'string') {
        cred.hint = { en: stripNewlines(h['en']) };
        if (typeof h['ar'] === 'string') cred.hint.ar = stripNewlines(h['ar']);
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
      if (s['expect'] !== undefined) {
        if (isValidBilingual(s['expect'])) {
          step.expect = s['expect'] as QaBilingual;
        } else {
          warnings.push(`journey[${i}].steps[${j}] (path="${String(s['path'])}"): invalid "expect" — ignored`);
        }
      }
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
    const rawRole = lane['role'] as QaBilingual;
    const role: QaBilingual = typeof rawRole === 'string'
      ? stripNewlines(rawRole)
      : { en: stripNewlines(rawRole.en), ...(typeof rawRole.ar === 'string' ? { ar: stripNewlines(rawRole.ar) } : {}) };
    const resolved: QaJourneyLane = {
      id:    (lane['id'] as string).trim(),
      role,
      steps,
    };
    if (isNonEmptyString(lane['color'])) resolved.color = (lane['color'] as string).trim();
    out.push(resolved);
  }
  return out;
}

/**
 * If this config clearly supports Arabic somewhere — loginField.ar, a
 * journey lane's role, a credential's roleAr/hint.ar — flag every OTHER
 * bilingual field that's missing its "ar" half: a plain string (QaBilingual
 * accepts one, but it can never carry a translation) or an {en}-only object.
 *
 * Silent when the config never uses Arabic anywhere: an English-only project
 * shouldn't get a warning it has no way to act on. But once ANY field proves
 * the project cares about Arabic-language testers, every other field that
 * silently falls back to English is a real gap, not a style choice — a
 * `journey[].steps[].what` is the exact prose a tester reads to know what to
 * test; a plain string there just IS the English text, permanently, no
 * matter what language the reader is testing in.
 */
function warnMissingArabic(
  loginField: { en: string; ar?: string },
  credentials: QaCredential[],
  journey: QaJourneyLane[],
  warnings: string[],
): void {
  const hasAr = (v: QaBilingual | undefined): boolean =>
    typeof v === 'object' && v !== null && isNonEmptyString(v.ar);

  const usesArabic =
    isNonEmptyString(loginField.ar) ||
    credentials.some((c) => isNonEmptyString(c.roleAr) || hasAr(c.hint)) ||
    journey.some((lane) => hasAr(lane.role) || lane.steps.some((s) => hasAr(s.what) || hasAr(s.expect)));

  if (!usesArabic) return;

  const missing: string[] = [];
  for (const lane of journey) {
    for (const step of lane.steps) {
      if (!hasAr(step.what)) missing.push(`journey "${lane.id}" → ${step.path} (what)`);
      if (step.expect !== undefined && !hasAr(step.expect)) {
        missing.push(`journey "${lane.id}" → ${step.path} (expect)`);
      }
    }
  }
  for (const c of credentials) {
    if (!isNonEmptyString(c.roleAr)) missing.push(`credentials role="${c.role}" (roleAr)`);
    if (c.hint !== undefined && !hasAr(c.hint)) missing.push(`credentials role="${c.role}" (hint.ar)`);
  }

  if (!missing.length) return;

  const LIMIT = 6;
  const shown = missing.slice(0, LIMIT).join('; ');
  const rest = missing.length > LIMIT ? ` (+${missing.length - LIMIT} more)` : '';
  warnings.push(
    `Arabic is used elsewhere in this config, but ${missing.length} bilingual field(s) have no "ar" and will show English to an Arabic-language tester: ${shown}${rest}. Every {en, ar} pair needs BOTH filled in — a plain string or an {en}-only object reads identically to a bilingual field that was simply never translated.`
  );
}

function coercePreamble(raw: unknown): QaPreamble | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = { ...raw } as QaPreamble;
  // projectName / stack render as single-line Markdown table cells (Project
  // table) — strip embedded newlines so a config-supplied value can't split
  // the row across multiple lines. Other fields (conventions, invariants,
  // verifySteps, runCommands, additionalContext, oneLiner) intentionally
  // accept embedded newlines and are left untouched.
  if (typeof p.projectName === 'string') p.projectName = stripNewlines(p.projectName);
  if (typeof p.stack === 'string') p.stack = stripNewlines(p.stack);
  return p;
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
        brand:        { label: DEFAULTS.brandLabel },
        loginField:   { ...DEFAULTS.loginField },
        credentials:  [],
        journey:      [],
        preamble:     null,
        rtl:          DEFAULTS.rtl,
        visible:      DEFAULTS.visible,
        alwaysVisible: DEFAULTS.alwaysVisible,
        hotkey:       DEFAULTS.hotkey,
        captureHotkey: DEFAULTS.captureHotkey,
        captureContext: DEFAULTS.captureContext,
      },
      warnings,
    };
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    warnings.push('config: expected an object — using defaults');
    return {
      config: {
        namespace:    DEFAULTS.namespace,
        brand:        { label: DEFAULTS.brandLabel },
        loginField:   { ...DEFAULTS.loginField },
        credentials:  [],
        journey:      [],
        preamble:     null,
        rtl:          DEFAULTS.rtl,
        visible:      DEFAULTS.visible,
        alwaysVisible: DEFAULTS.alwaysVisible,
        hotkey:       DEFAULTS.hotkey,
        captureHotkey: DEFAULTS.captureHotkey,
        captureContext: DEFAULTS.captureContext,
      },
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  // namespace
  const namespace = isNonEmptyString(raw['namespace'])
    ? (raw['namespace'] as string).trim()
    : DEFAULTS.namespace;

  // theme — removed in Qapture 0.3.0. Kept-but-ignored: warn, do not resolve.
  if (raw['theme'] !== undefined) {
    warnings.push(
      'theme: custom themes were removed in Qapture 0.3.0 — the widget now ships one fixed, self-contained design. The "theme" key is ignored; remove it from your qa.config to silence this warning.'
    );
  }

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
  const captureHotkey = isNonEmptyString(raw['captureHotkey'])
    ? (raw['captureHotkey'] as string).trim()
    : DEFAULTS.captureHotkey;
  const captureContext = typeof raw['captureContext'] === 'boolean'
    ? raw['captureContext']
    : DEFAULTS.captureContext;

  // visible: true | false | undefined (sentinel for dev-only)
  let visible: boolean | undefined = DEFAULTS.visible;
  if (raw['visible'] !== undefined) {
    if (typeof raw['visible'] === 'boolean') {
      visible = raw['visible'];
    } else {
      warnings.push('visible: expected boolean — using default (dev-only)');
    }
  }

  warnMissingArabic(loginField, credentials, journey, warnings);

  return {
    config: {
      namespace,
      brand: { label: brandLabel },
      loginField,
      credentials,
      journey,
      preamble,
      rtl,
      visible,
      alwaysVisible,
      hotkey,
      captureHotkey,
      captureContext,
    },
    warnings,
  };
}
