/**
 * styles.ts — Shadow-DOM stylesheet for qapture.
 *
 * All class names carry a `qa-` prefix to avoid collision with the host app.
 *
 * v0.3.0 "Graphite": qapture no longer supports custom theming. Every colour
 * the widget uses is a fixed design token defined once, below, in the `:host`
 * block — surfaces, ink, accent, semantic (danger/warn/success), borders,
 * scrims, elevation, radius, fonts, motion, and the z-index scale. Components
 * never receive colours as props; they reach for a token (`var(--qa-*)`) or
 * one of the semantic utility classes below (`qa-bg-2`, `qa-text-danger`, …).
 * `applyThemeVars`/`QaTheme` are gone from this file — see ShadowMount.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AVAILABLE CLASS NAMES (for the component agent):
 *
 * DESIGN TOKENS (custom properties on :host — see the `:host` block in
 * QA_CSS for the authoritative values)
 *   Surfaces   --qa-surface-0/1/2/3
 *   Ink        --qa-ink-hi/mid/lo/faint
 *   Accent     --qa-accent  --qa-accent-hover  --qa-accent-active
 *              --qa-on-accent  --qa-accent-tint  --qa-accent-border
 *   Semantic   --qa-danger(-tint)  --qa-warn(-tint)  --qa-success(-tint)
 *              --qa-neutral
 *   Borders    --qa-border-subtle  --qa-border-strong
 *   Scrims     --qa-scrim-dialog  --qa-scrim-capture  --qa-scrim-spot
 *   Elevation  --qa-sheen  --qa-elev-1/2/3
 *   Radius     --qa-radius-sm/md/lg
 *   Fonts      --qa-font  --qa-font-mono
 *   Motion     --qa-dur-1/2/3  --qa-ease  --qa-ease-out
 *              (killed under prefers-reduced-motion)
 *   Z-index    --qa-z-fab  --qa-z-panel  --qa-z-capture-dim
 *              --qa-z-capture-highlight  --qa-z-capture-region-move
 *              --qa-z-capture-region-handle  --qa-z-capture-hint
 *              --qa-z-capture-ui  --qa-z-toast
 *              (light-DOM flash box in highlight.ts uses a literal 10098 —
 *              it lives outside the shadow root, so host-scoped vars can't
 *              reach it)
 *
 * SEMANTIC UTILITIES (Graphite — components should prefer these over the
 * legacy Tailwind-ish names below where both would do)
 *   qa-bg-0  qa-bg-1  qa-bg-2  qa-bg-3
 *   qa-bg-accent (bg accent + on-accent text; :hover → accent-hover)
 *   qa-bg-accent-tint  qa-bg-danger-tint  qa-bg-warn-tint  qa-bg-success-tint
 *   qa-text-hi  qa-text-mid  qa-text-lo  qa-text-faint
 *   qa-text-accent  qa-text-on-accent  qa-text-danger  qa-text-warn  qa-text-success
 *   qa-border-subtle  qa-border-strong  qa-border-accent  (colour only — combine with .qa-border)
 *   qa-elev-1  qa-elev-2  qa-elev-3  (box-shadow incl. --qa-sheen)
 *   qa-hover-bg-2 (:hover → surface-2)
 *   qa-focus-ring (now :focus-visible → 2px solid accent outline)
 *   qa-toast-viewport  qa-toast  qa-toast-in
 *   qa-skeleton (surface-2 + qaShimmer pulse)
 *
 * RESET
 *   qa-box       — box-sizing: border-box on element
 *
 * POSITION
 *   qa-fixed     qa-absolute    qa-relative    qa-sticky
 *   qa-inset-0
 *   qa-top-0     qa-top-4       qa-top-auto
 *   qa-bottom-0  qa-bottom-4
 *   qa-left-0    qa-left-half   (left: 50%)
 *   qa-right-0
 *   qa-z-1       qa-z-50        qa-z-100
 *   qa-z-10090   qa-z-10092     qa-z-10093     qa-z-10094     qa-z-10095   qa-z-10096
 *
 * DISPLAY / FLEX
 *   qa-flex       qa-inline-flex    qa-block      qa-inline-block   qa-hidden
 *   qa-flex-1     qa-flex-col       qa-flex-wrap
 *   qa-items-center  qa-items-start  qa-items-end
 *   qa-justify-center  qa-justify-between  qa-justify-start  qa-justify-end
 *   qa-shrink-0   qa-grow
 *   qa-ms-auto    qa-me-auto
 *   qa-gap-1      qa-gap-1\.5    qa-gap-2       qa-gap-2\.5     qa-gap-3
 *   qa-gap-x-3    qa-gap-y-1
 *   qa-space-y-1   qa-space-y-2   qa-space-y-2\.5  qa-space-y-3
 *
 * SIZE
 *   qa-w-full     qa-h-full
 *   qa-w-px       qa-h-px
 *   qa-w-2        qa-h-2
 *   qa-w-2\.5     qa-h-2\.5
 *   qa-w-3        qa-h-3
 *   qa-w-3\.5     qa-h-3\.5
 *   qa-w-4        qa-h-4
 *   qa-w-5        qa-h-5
 *   qa-w-6        qa-h-6
 *   qa-h-1        qa-h-1\.5
 *   qa-min-w-0    qa-min-h-0
 *   qa-max-w-xs   (256px)   qa-max-w-sm  (320px)  qa-max-w-md   (384px)
 *   qa-max-h-28   (112px)   qa-max-h-32  (128px)
 *   qa-min-h-16   (64px)
 *   qa-overflow-hidden   qa-overflow-y-auto   qa-overflow-x-hidden
 *   qa-resize-y
 *
 * SPACING — padding
 *   qa-p-0   qa-p-1   qa-p-2   qa-p-2\.5   qa-p-3   qa-p-4
 *   qa-px-1  qa-px-1\.5  qa-px-2  qa-px-3  qa-px-4
 *   qa-py-0\.5  qa-py-1  qa-py-1\.5  qa-py-2  qa-py-4  qa-py-8
 *   qa-ps-6  qa-pe-2
 *
 * SPACING — margin
 *   qa-m-0   qa-mb-1   qa-mb-2   qa-mb-3   qa-mt-1   qa-mt-1\.5   qa-mt-2
 *   qa-ms-1  qa-ms-1\.5   qa-ms-auto
 *   qa-me-1
 *
 * BORDER
 *   qa-border        qa-border-2       qa-border-0
 *   qa-border-dashed
 *   qa-border-t      qa-border-b
 *   qa-border-white  qa-border-white-40  (→ border-strong token)
 *
 * ROUNDED
 *   qa-rounded       qa-rounded-md     qa-rounded-lg     qa-rounded-xl
 *   qa-rounded-full
 *
 * SHADOWS
 *   qa-shadow-sm     qa-shadow-lg      qa-shadow-2xl
 *
 * TYPOGRAPHY
 *   qa-text-10       (10px)
 *   qa-text-11       (11px)
 *   qa-text-xs       (12px)
 *   qa-text-sm       (14px)
 *   qa-text-base     (16px)
 *   qa-font-normal   qa-font-medium    qa-font-semibold   qa-font-bold
 *   qa-font-mono
 *   qa-leading-relaxed
 *   qa-truncate      qa-whitespace-pre-wrap    qa-break-words
 *   qa-text-start    qa-text-center    qa-text-end
 *   qa-select-all
 *
 * TOUCH / DENSITY
 *   --qa-tap      (custom prop on :host — 0px default, 44px under @media (pointer: coarse))
 *   qa-tap        — min-height: var(--qa-tap)
 *   qa-tap-icon   — min-width/height: var(--qa-tap); inline-flex, centered (icon-only buttons)
 *   qa-touch-none — touch-action: none
 *   qa-touch-pan  — touch-action: pan-x pan-y
 *   (also bumps qa-text-10/qa-text-11 by +1px under @media (pointer: coarse))
 *
 * COLORS — text (legacy names, restyled onto Graphite tokens in place)
 *   qa-text-white     qa-text-current
 *   qa-text-slate-300 (→ ink-faint)  qa-text-slate-400 (→ ink-lo)  qa-text-slate-500 (→ ink-mid)
 *   qa-text-green-600 (→ success)
 *   qa-text-red-500   qa-text-red-600   (→ danger)
 *
 * COLORS — background (legacy names, restyled onto Graphite tokens in place)
 *   qa-bg-white       (→ surface-1)     qa-bg-white-25    (→ surface-3)    qa-bg-transparent
 *   qa-bg-black-3     (subtle graphite tint)
 *   qa-bg-black-5     (subtle graphite tint, one step stronger)
 *
 * OPACITY
 *   qa-opacity-0   qa-opacity-30   qa-opacity-40   qa-opacity-50
 *   qa-opacity-55  qa-opacity-80   qa-opacity-100
 *
 * INTERACTIONS / STATE
 *   qa-cursor-crosshair   qa-cursor-default   qa-cursor-pointer
 *   qa-pointer-events-none
 *   qa-focus-ring         (:focus-visible → 2px solid accent outline)
 *   qa-disabled           (opacity 0.4, pointer-events none — via [disabled])
 *   qa-hover-bg-black-3:hover  → handled by qa-hover-bg-black-3
 *   qa-hover-bg-white-15 (hover → surface-2)
 *   qa-hover-opacity-80  (hover: opacity 0.8)
 *   qa-hover-opacity-100 (hover: opacity 1.0)
 *   qa-hover-text-red    (hover → danger)
 *   qa-hover-text-slate-600 (hover → ink-hi)
 *   qa-group             (for group-hover triggers)
 *   qa-group-hover-opacity-80
 *
 * TRANSITIONS
 *   qa-transition        qa-transition-all
 *
 * ANIMATIONS
 *   qa-animate-spin      (uses @keyframes qaSpin — for Loader2)
 *   qa-animate-pulse-accent (uses @keyframes qaPulse — uses var(--qa-accent))
 *
 * PRINT
 *   qa-print-hidden      (display:none in @media print)
 *
 * TRANSFORM
 *   qa-translate-x-neg-half  (translateX(-50%) — for centering)
 *   qa-translate-y-neg-full  (translateY(-100%) — for flip-above placement)
 *
 * MISC
 *   qa-w-320             (width: 320px — annotation card)
 *   qa-dir-ltr           (direction: ltr)
 * ─────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// The static stylesheet
// ---------------------------------------------------------------------------

export const QA_CSS = `
/* ── Reset ─────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

/* The note list is a <ul> of cards, not prose: the UA's default bullets and
   inline-start padding rendered a stray dot beside every saved note. (v0.4) */
ul, ol { list-style: none; margin: 0; padding: 0; }

/* Extra spacing steps used by the settings sheet (v0.4). */
.qa-space-y-4 > * + * { margin-top: 1rem; }
.qa-mt-3 { margin-top: 0.75rem; }
.qa-mb-4 { margin-bottom: 1rem; }

/* ── Design tokens (Graphite — v0.3.0) ───────────────────────────────
   Single source of truth for every colour, shadow, radius, font, motion
   duration, and z-index the widget uses. Nothing here is themeable —
   qapture 0.3.0 ships one fixed, self-contained design. */
:host {
  /* Surfaces */
  --qa-surface-0: #101215;
  --qa-surface-1: #181B20;
  --qa-surface-2: #20242B;
  --qa-surface-3: #2A2F37;

  /* Ink */
  --qa-ink-hi: #F4F5F7;
  --qa-ink-mid: #A8AEB8;
  --qa-ink-lo: #6B717C;
  --qa-ink-faint: #4A4F58;

  /* Accent */
  --qa-accent: #4D9CFF;
  --qa-accent-hover: #6FB0FF;
  --qa-accent-active: #3B84E6;
  --qa-on-accent: #0A0C10;
  --qa-accent-tint: rgba(77,156,255,0.14);
  --qa-accent-border: rgba(77,156,255,0.45);

  /* Semantic */
  --qa-danger: #FF6B6B;
  --qa-danger-tint: rgba(255,107,107,0.14);
  --qa-warn: #FBBF24;
  --qa-warn-tint: rgba(251,191,36,0.14);
  --qa-success: #34D399;
  --qa-success-tint: rgba(52,211,153,0.14);
  --qa-neutral: #5B616B;

  /* Borders */
  --qa-border-subtle: rgba(255,255,255,0.08);
  --qa-border-strong: rgba(255,255,255,0.14);

  /* Scrims */
  --qa-scrim-dialog: rgba(8,9,12,0.50);
  --qa-scrim-capture: rgba(8,9,12,0.32);
  --qa-scrim-spot: rgba(8,9,12,0.55);

  /* Elevation */
  --qa-sheen: inset 0 1px 0 rgba(255,255,255,0.06);
  --qa-elev-1: 0 1px 2px rgba(0,0,0,0.40);
  --qa-elev-2: 0 8px 24px -8px rgba(0,0,0,0.55);
  --qa-elev-3: 0 24px 60px -16px rgba(0,0,0,0.65);

  /* Radius */
  --qa-radius-sm: 6px;
  --qa-radius-md: 10px;
  --qa-radius-lg: 14px;

  /* Fonts (same stack for Arabic — no separate Arabic typeface) */
  --qa-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --qa-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;

  /* Motion */
  --qa-dur-1: 120ms;
  --qa-dur-2: 180ms;
  --qa-dur-3: 240ms;
  --qa-ease: cubic-bezier(0.4,0,0.2,1);
  --qa-ease-out: cubic-bezier(0.16,1,0.3,1);

  /* Z-index scale */
  --qa-z-fab: 9990;
  --qa-z-panel: 9995;
  --qa-z-capture-dim: 10090;
  --qa-z-capture-highlight: 10092;
  --qa-z-capture-region-move: 10093;
  --qa-z-capture-region-handle: 10094;
  --qa-z-capture-hint: 10095;
  --qa-z-capture-ui: 10096;
  --qa-z-toast: 10097;

  font-family: var(--qa-font);
  color: var(--qa-ink-hi);
}

/* Respect the user's OS-level motion preference: kill durations everywhere,
   including the token defaults so any var(--qa-dur-*)-based rule inherits
   the kill for free. */
@media (prefers-reduced-motion: reduce) {
  :host {
    --qa-dur-1: 0ms;
    --qa-dur-2: 0ms;
    --qa-dur-3: 0ms;
  }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* ── Position ──────────────────────────────────────────────────────── */
.qa-fixed    { position: fixed; }
.qa-absolute { position: absolute; }
.qa-relative { position: relative; }
.qa-sticky   { position: sticky; }
.qa-inset-0  { inset: 0; }
.qa-top-0    { top: 0; }
.qa-top-4    { top: 1rem; }
.qa-top-auto { top: auto; }
.qa-bottom-0 { bottom: 0; }
.qa-bottom-4 { bottom: 1rem; }
.qa-left-0   { left: 0; }
.qa-left-half { left: 50%; }
.qa-right-0  { right: 0; }

/* z-index — values mirror the --qa-z-* tokens above; class NAMES are kept
   verbatim (scripts/browser-test.mjs string-matches .qa-z-10093/.qa-z-10094). */
.qa-z-1     { z-index: 1; }
.qa-z-50    { z-index: 50; }
.qa-z-100   { z-index: 100; }
.qa-z-10090 { z-index: var(--qa-z-capture-dim); }
.qa-z-10092 { z-index: var(--qa-z-capture-highlight); }
/* region-handle layering */
.qa-z-10093 { z-index: var(--qa-z-capture-region-move); }
.qa-z-10094 { z-index: var(--qa-z-capture-region-handle); }
.qa-z-10095 { z-index: var(--qa-z-capture-hint); }
.qa-z-10096 { z-index: var(--qa-z-capture-ui); }

/* ── Display / Flex ─────────────────────────────────────────────────── */
.qa-flex          { display: flex; }
.qa-inline-flex   { display: inline-flex; }
.qa-block         { display: block; }
.qa-inline-block  { display: inline-block; }
.qa-hidden        { display: none; }
.qa-flex-1        { flex: 1 1 0%; }
.qa-flex-col      { flex-direction: column; }
.qa-flex-wrap     { flex-wrap: wrap; }
.qa-items-center  { align-items: center; }
.qa-items-start   { align-items: flex-start; }
.qa-items-end     { align-items: flex-end; }
.qa-justify-center  { justify-content: center; }
.qa-justify-between { justify-content: space-between; }
.qa-justify-start   { justify-content: flex-start; }
.qa-justify-end     { justify-content: flex-end; }
.qa-shrink-0  { flex-shrink: 0; }
.qa-grow      { flex-grow: 1; }
.qa-ms-auto   { margin-inline-start: auto; }
.qa-me-auto   { margin-inline-end: auto; }

/* gap */
.qa-gap-1    { gap: 0.25rem; }
.qa-gap-1\\.5  { gap: 0.375rem; }
.qa-gap-2    { gap: 0.5rem; }
.qa-gap-2\\.5  { gap: 0.625rem; }
.qa-gap-3    { gap: 0.75rem; }
.qa-gap-x-3  { column-gap: 0.75rem; }
.qa-gap-y-1  { row-gap: 0.25rem; }

/* space-y (margin-top on siblings) */
.qa-space-y-1   > * + * { margin-top: 0.25rem; }
.qa-space-y-2   > * + * { margin-top: 0.5rem; }
.qa-space-y-2\\.5 > * + * { margin-top: 0.625rem; }
.qa-space-y-3   > * + * { margin-top: 0.75rem; }

/* ── Size ───────────────────────────────────────────────────────────── */
.qa-w-full  { width: 100%; }
.qa-h-full  { height: 100%; }
.qa-w-px    { width: 1px; }
.qa-h-px    { height: 1px; }
.qa-w-2     { width: 0.5rem; }
.qa-h-2     { height: 0.5rem; }
.qa-w-2\\.5   { width: 0.625rem; }
.qa-h-2\\.5   { height: 0.625rem; }
.qa-w-3     { width: 0.75rem; }
.qa-h-3     { height: 0.75rem; }
.qa-w-3\\.5   { width: 0.875rem; }
.qa-h-3\\.5   { height: 0.875rem; }
.qa-w-4     { width: 1rem; }
.qa-h-4     { height: 1rem; }
.qa-w-5     { width: 1.25rem; }
.qa-h-5     { height: 1.25rem; }
.qa-w-6     { width: 1.5rem; }
.qa-h-6     { height: 1.5rem; }
.qa-h-1     { height: 0.25rem; }
.qa-h-1\\.5   { height: 0.375rem; }
.qa-min-w-0 { min-width: 0; }
.qa-min-h-0 { min-height: 0; }
.qa-max-w-xs  { max-width: 16rem; }   /* 256px */
.qa-max-w-sm  { max-width: 20rem; }   /* 320px */
.qa-max-w-md  { max-width: 24rem; }   /* 384px */
.qa-max-h-28  { max-height: 7rem; }   /* 112px */
.qa-max-h-32  { max-height: 8rem; }   /* 128px */
.qa-min-h-16  { min-height: 4rem; }   /* 64px */
.qa-overflow-hidden   { overflow: hidden; }
.qa-overflow-y-auto   { overflow-y: auto; }
.qa-overflow-x-hidden { overflow-x: hidden; }
.qa-resize-y          { resize: vertical; }

/* ── Spacing — padding ──────────────────────────────────────────────── */
.qa-p-0    { padding: 0; }
.qa-p-1    { padding: 0.25rem; }
.qa-p-2    { padding: 0.5rem; }
.qa-p-2\\.5  { padding: 0.625rem; }
.qa-p-3    { padding: 0.75rem; }
.qa-p-4    { padding: 1rem; }
.qa-px-1   { padding-inline: 0.25rem; }
.qa-px-1\\.5 { padding-inline: 0.375rem; }
.qa-px-2   { padding-inline: 0.5rem; }
.qa-px-3   { padding-inline: 0.75rem; }
.qa-px-4   { padding-inline: 1rem; }
.qa-py-0\\.5 { padding-block: 0.125rem; }
.qa-py-1   { padding-block: 0.25rem; }
.qa-py-1\\.5 { padding-block: 0.375rem; }
.qa-py-2   { padding-block: 0.5rem; }
.qa-py-4   { padding-block: 1rem; }
.qa-py-8   { padding-block: 2rem; }
.qa-ps-6   { padding-inline-start: 1.5rem; }
.qa-pe-2   { padding-inline-end: 0.5rem; }

/* ── Spacing — margin ───────────────────────────────────────────────── */
.qa-m-0      { margin: 0; }
.qa-mb-1     { margin-bottom: 0.25rem; }
.qa-mb-2     { margin-bottom: 0.5rem; }
.qa-mb-3     { margin-bottom: 0.75rem; }
.qa-mt-1     { margin-top: 0.25rem; }
.qa-mt-1\\.5   { margin-top: 0.375rem; }
.qa-mt-2     { margin-top: 0.5rem; }
.qa-ms-1     { margin-inline-start: 0.25rem; }
.qa-ms-1\\.5   { margin-inline-start: 0.375rem; }
.qa-ms-auto  { margin-inline-start: auto; }
.qa-me-1     { margin-inline-end: 0.25rem; }

/* ── Border ─────────────────────────────────────────────────────────── */
.qa-border         { border-width: 1px; border-style: solid; }
.qa-border-2       { border-width: 2px; border-style: solid; }
.qa-border-0       { border: none; }
.qa-border-dashed  { border-style: dashed; }
.qa-border-t       { border-top-width: 1px; border-top-style: solid; }
.qa-border-b       { border-bottom-width: 1px; border-bottom-style: solid; }
.qa-border-white   { border-color: #ffffff; }
.qa-border-white-40 { border-color: var(--qa-border-strong); }

/* Semantic border colour (combine with .qa-border for width+style) */
.qa-border-subtle { border-color: var(--qa-border-subtle); }
.qa-border-strong { border-color: var(--qa-border-strong); }
.qa-border-accent  { border-color: var(--qa-accent-border); }

/* ── Rounded ────────────────────────────────────────────────────────── */
.qa-rounded      { border-radius: 0.25rem; }
.qa-rounded-md   { border-radius: 0.375rem; }
.qa-rounded-lg   { border-radius: 0.5rem; }
.qa-rounded-xl   { border-radius: 0.75rem; }
.qa-rounded-full { border-radius: 9999px; }

/* ── Shadows ────────────────────────────────────────────────────────── */
.qa-shadow-sm  { box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.1); }
.qa-shadow-lg  { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
.qa-shadow-2xl { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }

/* Semantic elevation — each layers --qa-sheen (a 1px inner highlight) on top
   of the matching --qa-elev-* drop shadow, so raised surfaces read as
   subtly lit from above rather than flat dark rectangles. */
.qa-elev-1 { box-shadow: var(--qa-elev-1), var(--qa-sheen); }
.qa-elev-2 { box-shadow: var(--qa-elev-2), var(--qa-sheen); }
.qa-elev-3 { box-shadow: var(--qa-elev-3), var(--qa-sheen); }

/* ── Typography ─────────────────────────────────────────────────────── */
.qa-text-10   { font-size: 10px; }
.qa-text-11   { font-size: 11px; }
.qa-text-xs   { font-size: 0.75rem;  line-height: 1rem; }
.qa-text-sm   { font-size: 0.875rem; line-height: 1.25rem; }
.qa-text-base { font-size: 1rem;     line-height: 1.5rem; }
.qa-font-normal   { font-weight: 400; }
.qa-font-medium   { font-weight: 500; }
.qa-font-semibold { font-weight: 600; }
.qa-font-bold     { font-weight: 700; }
.qa-font-mono  { font-family: var(--qa-font-mono); }
.qa-leading-relaxed { line-height: 1.625; }
.qa-truncate   { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-whitespace-pre-wrap { white-space: pre-wrap; }
.qa-break-words { overflow-wrap: break-word; word-break: break-word; }
.qa-text-start  { text-align: start; }
.qa-text-center { text-align: center; }
.qa-text-end    { text-align: end; }
.qa-select-all  { user-select: all; }

/* ── Touch density tokens ────────────────────────────────────────────── */
:host { --qa-tap: 0px; }
@media (pointer: coarse) {
  :host { --qa-tap: 44px; }
  .qa-text-10 { font-size: 11px; }
  .qa-text-11 { font-size: 12px; }
}
.qa-tap      { min-height: var(--qa-tap); }
.qa-tap-icon { min-width: var(--qa-tap); min-height: var(--qa-tap); display: inline-flex; align-items: center; justify-content: center; }

/* ── Colors — text ──────────────────────────────────────────────────── */
.qa-text-white      { color: #ffffff; }
.qa-text-current    { color: currentColor; }
/* legacy slate scale, restyled onto the ink levels in place */
.qa-text-slate-300  { color: var(--qa-ink-faint); }
.qa-text-slate-400  { color: var(--qa-ink-lo); }
.qa-text-slate-500  { color: var(--qa-ink-mid); }
.qa-text-green-600  { color: var(--qa-success); }
.qa-text-red-500    { color: var(--qa-danger); }
.qa-text-red-600    { color: var(--qa-danger); }

/* Semantic text levels */
.qa-text-hi        { color: var(--qa-ink-hi); }
.qa-text-mid       { color: var(--qa-ink-mid); }
.qa-text-lo        { color: var(--qa-ink-lo); }
.qa-text-faint     { color: var(--qa-ink-faint); }
.qa-text-accent    { color: var(--qa-accent); }
.qa-text-on-accent { color: var(--qa-on-accent); }
.qa-text-danger    { color: var(--qa-danger); }
.qa-text-warn      { color: var(--qa-warn); }
.qa-text-success   { color: var(--qa-success); }

/* ── Colors — background ────────────────────────────────────────────── */
/* legacy names, restyled onto Graphite tokens in place — components keep
   using these class names unchanged. */
.qa-bg-white        { background-color: var(--qa-surface-1); }
.qa-bg-white-25     { background-color: var(--qa-surface-3); }
.qa-bg-transparent  { background-color: transparent; }
/* These two were 3%/5% black tints for a light theme, which is inert on a
   dark surface. Restyled as low-alpha WHITE lifts of the same two
   intensities — still legible as a step above the base surface. */
.qa-bg-black-3      { background-color: rgba(255,255,255,0.03); }
.qa-bg-black-5      { background-color: rgba(255,255,255,0.05); }

/* Semantic surfaces */
.qa-bg-0 { background-color: var(--qa-surface-0); }
.qa-bg-1 { background-color: var(--qa-surface-1); }
.qa-bg-2 { background-color: var(--qa-surface-2); }
.qa-bg-3 { background-color: var(--qa-surface-3); }

.qa-bg-accent {
  background-color: var(--qa-accent);
  color: var(--qa-on-accent);
}
.qa-bg-accent:hover { background-color: var(--qa-accent-hover); }

.qa-bg-accent-tint  { background-color: var(--qa-accent-tint); }
.qa-bg-danger-tint  { background-color: var(--qa-danger-tint); }
.qa-bg-warn-tint    { background-color: var(--qa-warn-tint); }
.qa-bg-success-tint { background-color: var(--qa-success-tint); }

/* ── Opacity ────────────────────────────────────────────────────────── */
.qa-opacity-0   { opacity: 0; }
.qa-opacity-30  { opacity: 0.30; }
.qa-opacity-40  { opacity: 0.40; }
.qa-opacity-50  { opacity: 0.50; }
.qa-opacity-55  { opacity: 0.55; }
.qa-opacity-80  { opacity: 0.80; }
.qa-opacity-100 { opacity: 1; }

/* ── Pointer-events handoff from the light-DOM host (v0.6) ───────────
   The <qapture-overlay> host is a 0x0, top-of-the-range fixed box with
   pointer-events none, so it can never swallow a click meant for the app
   underneath (see ShadowMount.ts). Every top-level surface inside the widget
   therefore has to switch pointer events back ON for itself. Declared BEFORE
   the .qa-pointer-events-none utility below so that anything explicitly
   marked "don't take clicks" (the selection outline, decorative overlays)
   still wins on source order at equal specificity. */
.qa-fixed,
.qa-absolute,
.qa-toast-viewport,
.qa-fab-btn { pointer-events: auto; }

/* ── Interactions / State ───────────────────────────────────────────── */
.qa-cursor-crosshair    { cursor: crosshair; }
.qa-cursor-default      { cursor: default; }
.qa-cursor-pointer      { cursor: pointer; }
.qa-pointer-events-none { pointer-events: none; }
.qa-touch-none { touch-action: none; }
.qa-touch-pan  { touch-action: pan-x pan-y; }

/* Restyled onto :focus-visible (was :focus) so a mouse click no longer
   leaves a persistent ring — only keyboard/AT focus does. */
.qa-focus-ring:focus-visible {
  outline: 2px solid var(--qa-accent);
  outline-offset: 2px;
}

button:disabled,
input:disabled,
.qa-disabled {
  opacity: 0.40;
  pointer-events: none;
}

/* Hover helpers */
.qa-hover-bg-black-3:hover  { background-color: var(--qa-surface-2); }
.qa-hover-bg-black-5:hover  { background-color: var(--qa-surface-3); }
.qa-hover-bg-white-15:hover { background-color: var(--qa-surface-2); }
.qa-hover-bg-2:hover        { background-color: var(--qa-surface-2); }
.qa-hover-opacity-80:hover  { opacity: 0.80; }
.qa-hover-opacity-100:hover { opacity: 1; }
.qa-hover-text-red:hover    { color: var(--qa-danger); }
.qa-hover-text-slate-600:hover { color: var(--qa-ink-hi); }

/* Group-hover (child uses .qa-group-hover-opacity-80 inside a .qa-group parent) */
.qa-group .qa-group-hover-opacity-80 { opacity: 0.40; }
.qa-group:hover .qa-group-hover-opacity-80 { opacity: 0.80; }

/* last-child margin reset */
.qa-last-mb-0:last-child { margin-bottom: 0; }

/* ── Transitions ────────────────────────────────────────────────────── */
.qa-transition     { transition-property: color,background-color,border-color,opacity,box-shadow,transform; transition-duration: 150ms; transition-timing-function: cubic-bezier(0.4,0,0.2,1); }
.qa-transition-all { transition: all 150ms cubic-bezier(0.4,0,0.2,1); }

/* ── Animations ─────────────────────────────────────────────────────── */
@keyframes qaSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes qaPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; box-shadow: 0 0 0 8px transparent; }
}

@keyframes qaShimmer {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}

.qa-animate-spin {
  animation: qaSpin 1s linear infinite;
}

.qa-animate-pulse-accent {
  animation: qaPulse 2s ease-in-out infinite;
  color: var(--qa-accent);
}

/* Loading placeholder rows (NoteList while notesLoading && !notes.length) */
.qa-skeleton {
  background-color: var(--qa-surface-2);
  border-radius: var(--qa-radius-sm);
  animation: qaShimmer 1.4s ease-in-out infinite;
}

/* ── Print ──────────────────────────────────────────────────────────── */
@media print {
  .qa-print-hidden { display: none !important; }
}

/* ── Transform ──────────────────────────────────────────────────────── */
.qa-translate-x-neg-half  { transform: translateX(-50%); }
.qa-translate-y-neg-full  { transform: translateY(-100%); }

/* ── Misc ───────────────────────────────────────────────────────────── */
.qa-w-320  { width: 320px; }
.qa-dir-ltr { direction: ltr; }

/* ── Panel size ─────────────────────────────────────────────────────── */
.qa-w-panel    { width: min(93vw, 420px); }
.qa-max-h-74vh { max-height: 74vh; max-height: min(74vh, 74dvh); }

/* ── Extra rounded ──────────────────────────────────────────────────── */
.qa-rounded-2xl { border-radius: 1rem; }

/* ── Extra padding (top / bottom) ───────────────────────────────────── */
.qa-pt-1  { padding-top: 0.25rem; }
.qa-pt-2  { padding-top: 0.5rem; }
.qa-pt-3  { padding-top: 0.75rem; }
.qa-pb-1  { padding-bottom: 0.25rem; }
.qa-pb-2  { padding-bottom: 0.5rem; }
.qa-pb-3  { padding-bottom: 0.75rem; }

/* ── Extra margin-top ───────────────────────────────────────────────── */
.qa-mt-0\\.5 { margin-top: 0.125rem; }

/* ── Panel slide-in / slide-out animation ───────────────────────────── */
.qa-panel-anim {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
  transition: opacity 200ms cubic-bezier(0.4,0,0.2,1),
              transform 200ms cubic-bezier(0.4,0,0.2,1);
}
.qa-panel-anim.qa-panel-in {
  opacity: 1;
  transform: translateY(0) scale(1);
}

/* ── Capture-card fade-in animation ────────────────────────────────── */
.qa-card-anim {
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 140ms ease, transform 140ms ease;
}
.qa-card-anim.qa-card-in {
  opacity: 1;
  transform: scale(1);
}

/* ── FAB button interactions ────────────────────────────────────────── */
.qa-fab-btn {
  transition: transform 150ms cubic-bezier(0.4,0,0.2,1),
              box-shadow 150ms cubic-bezier(0.4,0,0.2,1);
  cursor: pointer;
  border: none;
}
.qa-fab-btn:hover  { transform: scale(1.06); }
.qa-fab-btn:active { transform: scale(0.94); }
.qa-fab-btn:focus-visible {
  outline: 3px solid rgba(255,255,255,0.6);
  outline-offset: 2px;
}

/* ── Tab indicator bar ──────────────────────────────────────────────── */
.qa-tab-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  border-radius: 9999px;
  transition: left 200ms cubic-bezier(0.4,0,0.2,1),
              width 200ms cubic-bezier(0.4,0,0.2,1);
  pointer-events: none;
}

/* ── brightness hover (capture / note buttons) ──────────────────────── */
.qa-hover-brightness-105:hover { filter: brightness(1.05); }

/* ── Extra space-y ──────────────────────────────────────────────────── */
.qa-space-y-1\\.5 > * + * { margin-top: 0.375rem; }

/* ── Toast (NoticeHost) ──────────────────────────────────────────────── */
.qa-toast-viewport {
  position: fixed;
  inset-inline: 0;
  bottom: 1rem;
  z-index: var(--qa-z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  pointer-events: none;
}
.qa-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  max-width: min(92vw, 360px);
  padding: 0.625rem 0.75rem;
  background-color: var(--qa-surface-2);
  border: 1px solid var(--qa-border-subtle);
  border-radius: var(--qa-radius-md);
  box-shadow: var(--qa-elev-2), var(--qa-sheen);
  color: var(--qa-ink-hi);
  font-size: 13px;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity var(--qa-dur-2) var(--qa-ease-out),
              transform var(--qa-dur-2) var(--qa-ease-out);
}
.qa-toast.qa-toast-in {
  opacity: 1;
  transform: translateY(0);
}
`;

// ---------------------------------------------------------------------------
// Style injection
// ---------------------------------------------------------------------------

/**
 * Inject QA_CSS into a Shadow root.
 * Uses adoptedStyleSheets (modern browsers) with a <style> element fallback.
 */
export function injectStyles(root: ShadowRoot): void {
  if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in Document.prototype) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(QA_CSS);
      root.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // fall through to <style> fallback
    }
  }
  // Fallback: append a <style> element to the shadow root.
  const style = document.createElement('style');
  style.textContent = QA_CSS;
  root.appendChild(style);
}
