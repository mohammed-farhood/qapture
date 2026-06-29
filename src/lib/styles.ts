/**
 * styles.ts — Shadow-DOM stylesheet for qapture.
 *
 * All class names carry a `qa-` prefix to avoid collision with the host app.
 * Brand colours travel as inline `style` props in components; this file
 * handles structure, layout, typography, and the two animation keyframes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AVAILABLE CLASS NAMES (for the component agent):
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
 *   qa-z-10090   qa-z-10092     qa-z-10095     qa-z-10096
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
 *   qa-border-white  qa-border-white-40
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
 * COLORS — text
 *   qa-text-white     qa-text-current
 *   qa-text-slate-300 qa-text-slate-400 qa-text-slate-500
 *   qa-text-green-600
 *   qa-text-red-500   qa-text-red-600
 *
 * COLORS — background
 *   qa-bg-white       qa-bg-white-25    qa-bg-transparent
 *   qa-bg-black-3     (rgba 0,0,0,0.03)
 *   qa-bg-black-5     (rgba 0,0,0,0.05)
 *
 * OPACITY
 *   qa-opacity-0   qa-opacity-30   qa-opacity-40   qa-opacity-50
 *   qa-opacity-55  qa-opacity-80   qa-opacity-100
 *
 * INTERACTIONS / STATE
 *   qa-cursor-crosshair   qa-cursor-default   qa-cursor-pointer
 *   qa-pointer-events-none
 *   qa-focus-ring         (outline + ring on :focus)
 *   qa-disabled           (opacity 0.4, pointer-events none — via [disabled])
 *   qa-hover-bg-black-3:hover  → handled by qa-hover-bg-black-3
 *   qa-hover-bg-white-15 (hover: bg rgba(255,255,255,0.15))
 *   qa-hover-opacity-80  (hover: opacity 0.8)
 *   qa-hover-opacity-100 (hover: opacity 1.0)
 *   qa-hover-text-red    (hover: color #ef4444)
 *   qa-hover-text-slate-600 (hover: color #475569)
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

import type { QaTheme } from '../config/schema';

// ---------------------------------------------------------------------------
// The static stylesheet
// ---------------------------------------------------------------------------

export const QA_CSS = `
/* ── Reset ─────────────────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

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

/* z-index */
.qa-z-1     { z-index: 1; }
.qa-z-50    { z-index: 50; }
.qa-z-100   { z-index: 100; }
.qa-z-10090 { z-index: 10090; }
.qa-z-10092 { z-index: 10092; }
.qa-z-10095 { z-index: 10095; }
.qa-z-10096 { z-index: 10096; }

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
.qa-border-white-40 { border-color: rgba(255,255,255,0.40); }

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
.qa-font-mono  { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.qa-leading-relaxed { line-height: 1.625; }
.qa-truncate   { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qa-whitespace-pre-wrap { white-space: pre-wrap; }
.qa-break-words { overflow-wrap: break-word; word-break: break-word; }
.qa-text-start  { text-align: start; }
.qa-text-center { text-align: center; }
.qa-text-end    { text-align: end; }
.qa-select-all  { user-select: all; }

/* ── Colors — text ──────────────────────────────────────────────────── */
.qa-text-white      { color: #ffffff; }
.qa-text-current    { color: currentColor; }
.qa-text-slate-300  { color: #cbd5e1; }
.qa-text-slate-400  { color: #94a3b8; }
.qa-text-slate-500  { color: #64748b; }
.qa-text-green-600  { color: #16a34a; }
.qa-text-red-500    { color: #ef4444; }
.qa-text-red-600    { color: #dc2626; }

/* ── Colors — background ────────────────────────────────────────────── */
.qa-bg-white        { background-color: #ffffff; }
.qa-bg-white-25     { background-color: rgba(255,255,255,0.25); }
.qa-bg-transparent  { background-color: transparent; }
.qa-bg-black-3      { background-color: rgba(0,0,0,0.03); }
.qa-bg-black-5      { background-color: rgba(0,0,0,0.05); }

/* ── Opacity ────────────────────────────────────────────────────────── */
.qa-opacity-0   { opacity: 0; }
.qa-opacity-30  { opacity: 0.30; }
.qa-opacity-40  { opacity: 0.40; }
.qa-opacity-50  { opacity: 0.50; }
.qa-opacity-55  { opacity: 0.55; }
.qa-opacity-80  { opacity: 0.80; }
.qa-opacity-100 { opacity: 1; }

/* ── Interactions / State ───────────────────────────────────────────── */
.qa-cursor-crosshair    { cursor: crosshair; }
.qa-cursor-default      { cursor: default; }
.qa-cursor-pointer      { cursor: pointer; }
.qa-pointer-events-none { pointer-events: none; }

.qa-focus-ring:focus {
  outline: 2px solid var(--qa-primary, #4f46e5);
  outline-offset: 2px;
}

button:disabled,
input:disabled,
.qa-disabled {
  opacity: 0.40;
  pointer-events: none;
}

/* Hover helpers */
.qa-hover-bg-black-3:hover  { background-color: rgba(0,0,0,0.03); }
.qa-hover-bg-black-5:hover  { background-color: rgba(0,0,0,0.05); }
.qa-hover-bg-white-15:hover { background-color: rgba(255,255,255,0.15); }
.qa-hover-opacity-80:hover  { opacity: 0.80; }
.qa-hover-opacity-100:hover { opacity: 1; }
.qa-hover-text-red:hover    { color: #ef4444; }
.qa-hover-text-slate-600:hover { color: #475569; }

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

.qa-animate-spin {
  animation: qaSpin 1s linear infinite;
}

.qa-animate-pulse-accent {
  animation: qaPulse 2s ease-in-out infinite;
  color: var(--qa-accent, #7c3aed);
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
.qa-max-h-74vh { max-height: 74vh; }

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

// ---------------------------------------------------------------------------
// Theme variable application
// ---------------------------------------------------------------------------

/**
 * Set QA CSS custom properties on the shadow host element so that
 * `var(--qa-primary)` etc. resolve correctly inside the shadow tree.
 */
export function applyThemeVars(host: HTMLElement, theme: QaTheme): void {
  host.style.setProperty('--qa-primary',      theme.primary);
  host.style.setProperty('--qa-primary-dark',  theme.primaryDark);
  host.style.setProperty('--qa-accent',        theme.accent);
  host.style.setProperty('--qa-accent-dark',   theme.accentDark);
  host.style.setProperty('--qa-sage',          theme.sage);
  host.style.setProperty('--qa-cream',         theme.cream);
  host.style.setProperty('--qa-mauve',         theme.mauve);
  host.style.setProperty('--qa-surface',       theme.surface);
  host.style.setProperty('--qa-ink',           theme.ink);
}
