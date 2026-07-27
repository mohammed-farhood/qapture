# v0.3.0 "Graphite" — Interface Contract (build-time coordination doc)

Every implementation agent codes against THIS document. Do not invent names not listed here.
If you need something not in the contract, note it in your final report — do NOT edit files you don't own.
Full plan: `/Users/m2farhood/.claude/plans/tranquil-herding-scone.md`.

Rules for all agents:
- Repo: `/Users/m2farhood/Desktop/CODES/03-Ecommerce-Stores/qa-studio`, branch `v0.3-graphite` (already checked out).
- Edit ONLY the files you own (ownership map at bottom). No `git commit`, no `npm install`, no `npm publish`.
- The repo will NOT typecheck until all agents land — that is expected. Ensure YOUR file is internally correct and matches this contract exactly.
- Match existing code style (qa- class prefix, `t('key')` i18n calls, logical RTL utilities `qa-ms-*`/`qa-me-*`, `qa-tap` touch targets, `data-qa-overlay` for light-DOM escapes).
- Preserve: RTL/Arabic support, touch/iPad paths, focus trap, `.qa-print-hidden`, `--qa-tap` mechanism, `.qa-z-10093`/`.qa-z-10094`/`.qa-tab-indicator` class names (browser-test asserts them).

## 1. Design tokens (defined once in `:host` block of QA_CSS in styles.ts)

Surfaces: `--qa-surface-0:#101215` `--qa-surface-1:#181B20` `--qa-surface-2:#20242B` `--qa-surface-3:#2A2F37`
Ink: `--qa-ink-hi:#F4F5F7` `--qa-ink-mid:#A8AEB8` `--qa-ink-lo:#6B717C` `--qa-ink-faint:#4A4F58`
Accent: `--qa-accent:#4D9CFF` `--qa-accent-hover:#6FB0FF` `--qa-accent-active:#3B84E6` `--qa-on-accent:#0A0C10` `--qa-accent-tint:rgba(77,156,255,0.14)` `--qa-accent-border:rgba(77,156,255,0.45)`
Semantic: `--qa-danger:#FF6B6B` `--qa-danger-tint:rgba(255,107,107,0.14)` `--qa-warn:#FBBF24` `--qa-warn-tint:rgba(251,191,36,0.14)` `--qa-success:#34D399` `--qa-success-tint:rgba(52,211,153,0.14)` `--qa-neutral:#5B616B`
Borders: `--qa-border-subtle:rgba(255,255,255,0.08)` `--qa-border-strong:rgba(255,255,255,0.14)`
Scrims: `--qa-scrim-dialog:rgba(8,9,12,0.50)` `--qa-scrim-capture:rgba(8,9,12,0.32)` `--qa-scrim-spot:rgba(8,9,12,0.55)`
Elevation: `--qa-sheen:inset 0 1px 0 rgba(255,255,255,0.06)` `--qa-elev-1:0 1px 2px rgba(0,0,0,0.40)` `--qa-elev-2:0 8px 24px -8px rgba(0,0,0,0.55)` `--qa-elev-3:0 24px 60px -16px rgba(0,0,0,0.65)`
Radius: `--qa-radius-sm:6px` `--qa-radius-md:10px` `--qa-radius-lg:14px`
Fonts: `--qa-font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"` · `--qa-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace`. Same stack for Arabic. `:host { font-family: var(--qa-font); color: var(--qa-ink-hi); }`
Motion: `--qa-dur-1:120ms` `--qa-dur-2:180ms` `--qa-dur-3:240ms` `--qa-ease:cubic-bezier(0.4,0,0.2,1)` `--qa-ease-out:cubic-bezier(0.16,1,0.3,1)` + `prefers-reduced-motion` kill block.
Z: `--qa-z-fab:9990` `--qa-z-panel:9995` `--qa-z-capture-dim:10090` `--qa-z-capture-highlight:10092` `--qa-z-capture-region-move:10093` `--qa-z-capture-region-handle:10094` `--qa-z-capture-hint:10095` `--qa-z-capture-ui:10096` `--qa-z-toast:10097`. Light-DOM flash box: literal 10098.
Touch: keep `--qa-tap` (0px / 44px coarse) verbatim.

## 2. Semantic utility classes (styles.ts adds; components use)

`.qa-bg-0` `.qa-bg-1` `.qa-bg-2` `.qa-bg-3` `.qa-bg-accent` (bg accent + color on-accent; `:hover` → accent-hover) `.qa-bg-accent-tint` `.qa-bg-danger-tint` `.qa-bg-warn-tint` `.qa-bg-success-tint`
`.qa-text-hi` `.qa-text-mid` `.qa-text-lo` `.qa-text-faint` `.qa-text-accent` `.qa-text-on-accent` `.qa-text-danger` `.qa-text-warn` `.qa-text-success`
`.qa-border-subtle` `.qa-border-strong` `.qa-border-accent` (border-color only; combine with existing `.qa-border`)
`.qa-elev-1` `.qa-elev-2` `.qa-elev-3` (each box-shadow includes `--qa-sheen` layered on the elev shadow)
`.qa-hover-bg-2:hover` (background surface-2) · `.qa-focus-ring` restyled to `:focus-visible { outline:2px solid var(--qa-accent); outline-offset:2px; }`
`.qa-toast-viewport` `.qa-toast` `.qa-toast-in` (enter anim translateY(8px)+fade, dur-2/ease-out)
`.qa-skeleton` (surface-2 base + `@keyframes qaShimmer` opacity pulse)
Existing color-bearing utilities are RESTYLED in place (same class names): `qa-text-slate-300/400/500`→ink levels, `qa-text-red-*`→danger, `qa-text-green-600`→success, `qa-bg-white`→surface-1, `qa-bg-black-3/5`→surface-2 hover equivalents, `qa-bg-white-25`/`qa-border-white-40`/`qa-hover-bg-white-15`→graphite equivalents. Components may keep using those names.

## 3. Shared types & function signatures

```ts
// src/lib/capture.ts
export type CaptureOutcome =
  | { status: 'ok'; blob: Blob }
  | { status: 'empty' }     // SSR or degenerate rect — nothing attempted
  | { status: 'failed' };   // threw / timed out / toBlob null
export function captureRegion(rect: QaRect, scroll?: { x: number; y: number }): Promise<CaptureOutcome>;
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null>; // unchanged signature, timer cleared via .finally

// src/lib/scrollLock.ts — unchanged API: lockPageScroll(): void / unlockPageScroll(): void (ref-counted; adds scrollbar-width padding compensation, RTL-aware)

// src/lib/highlight.ts — colors param REMOVED (fixed Graphite constants inside):
export function flashLocate(target: QaTarget): void;

// src/lib/idb.ts
put(record: object): Promise<boolean>;   // true=persisted, false=failed (no throw). SSR no-op adapter returns true.

// src/lib/contextBuffer.ts (NEW)
export type QaContextEvent =
  | { t: number; kind: 'console'; level: 'error' | 'warn'; message: string; stack?: string }
  | { t: number; kind: 'error'; message: string; stack?: string }
  | { t: number; kind: 'network'; method: string; url: string; status: number | null; durationMs: number; error?: string };
export type QaEnvSnapshot = {
  url: string; route: string; viewportW: number; viewportH: number; dpr: number;
  userAgent: string; language: string; online: boolean; timezone: string;
  pageLoadMs?: number; memoryUsedMB?: number;
};
export type QaTargetForensics = {
  html?: string;                              // truncated (~600 chars) escaped outerHTML
  styles?: Record<string, string>;            // display, position, overflow, z-index, font-size, color, background-color
  a11y?: { role?: string; hasAccessibleName: boolean; tabReachable: boolean; contrastFlag?: 'low' | 'ok' | 'unknown' };
};
export type QaNoteContext = { events: QaContextEvent[]; env: QaEnvSnapshot; forensics?: QaTargetForensics };
export function installContextCapture(): void;      // idempotent; wraps console.error/warn, window error/unhandledrejection, fetch+XHR. Ring cap 75. Redacts URL query strings. Never bodies/headers/storage values.
export function uninstallContextCapture(): void;    // restores originals
export function drainSinceLastNote(): QaContextEvent[];  // returns [] when not installed
export function collectEnvSnapshot(route: string): QaEnvSnapshot;  // safe uninstalled
export function collectTargetForensics(el: Element): QaTargetForensics;

// src/lib/journeyMatch.ts (NEW)
export function matchRouteToSteps(journey: QaJourneyLane[], route: string): Array<{ laneId: string; path: string }>; // exact match first, then :param-normalized segments

// src/lib/noteMarkdown.ts (NEW)
export function noteToMarkdown(note: QaNote, opts?: { brand?: string; index?: number }): string;
// Single-note agent-ready markdown: description, route/url, target (selector/tag/text/pos), severity/status,
// runtime-context fenced block (events + env), screenshot file reference note.
```

## 4. QaNote / schema additions (all optional — no IDB migration)

```ts
// QaContext.tsx QaNote gains:
severity?: 'bug' | 'question' | 'polish';   // UI default 'bug'
status?: 'open' | 'verified';               // UI default 'open'
journeyRef?: { laneId: string; path: string };
context?: QaNoteContext;                    // import type from lib/contextBuffer

// schema.ts:
QaJourneyStep.expect?: QaBilingual;         // optional "what pass looks like"; coerceJourney copies valid bilinguals
QaConfig.captureContext?: boolean;          // ResolvedConfig.captureContext: boolean, default true
// theme: keep QaConfig.theme?: Partial<QaTheme> + QaTheme type, mark @deprecated; validateConfig warns+ignores:
// "theme: custom themes were removed in Qapture 0.3.0 — the widget now ships one fixed, self-contained design. The \"theme\" key is ignored; remove it from your qa.config to silence this warning."
// DELETE: DEFAULT_THEME, coerceTheme, ResolvedConfig.theme. defaults.ts: drop theme block + DEFAULT_THEME re-export. index.ts: keep `export type { QaTheme }` with @deprecated JSDoc.
```

## 5. QaContext contract (QaContextValue additions / removals)

REMOVED: `theme` (and `QaTheme` import). Components must not read `theme` from `useQa()`.

ADDED:
```ts
// notices
export type QaNoticeTone = 'info' | 'success' | 'error';
export type QaNotice = { id: string; message: string; tone: QaNoticeTone; action?: { label: string; onAction: () => void }; duration: number };
notices: QaNotice[];
notify: (message: string, opts?: { tone?: QaNoticeTone; action?: { label: string; onAction: () => void }; duration?: number; id?: string }) => string;
// defaults: tone 'info'; duration 4000 (error 6000, undo uses 5000); id replaces existing notice+timer; queue cap 3 (drop oldest)
dismissNotice: (id: string) => void;

notesLoading: boolean;                 // true until initial IDB load settles
namespace: string;                     // resolved config namespace

// addNote input widened (internally attaches journeyRef + context):
addNote(input: { description: string; screenshot?: Blob; target?: QaTarget;
                 severity?: 'bug'|'question'|'polish'; status?: 'open'|'verified';
                 forensics?: QaTargetForensics }): Promise<void>;
updateNote(id, patch) additionally accepts severity/status.
// deleteNote(id) becomes soft-delete: removes from state, commits idb.delete after 5s, fires notify with Undo action (restores at original index). clearNotes() same pattern (snapshot + delayed idb.clear), keeps its existing inline confirm in QaPanel.
// beforeunload + provider unmount flush pending deletes.

// test-along
export type QaTestAlongStep = { key: string; laneId: string; laneRole: string; color: string;
  path: string; what: QaBilingual; expect?: QaBilingual; risk: 'red'|'amber'|'green' };
testAlong: { active: boolean; index: number };
testAlongSteps: QaTestAlongStep[];              // memoized flatten of journey lanes in order; key = `${laneId}::${path}`
startTestAlong: () => void;                     // sets active, index 0, closes panel
exitTestAlong: () => void;
gotoStep: (index: number) => void;              // clamped
gradeStep: (key: string, grade: 'pass' | 'fail') => void;  // pass→guideChecked+remove from failed; fail→guideFailed+remove from checked
guideFailed: Set<string>;                       // persisted `${namespace}:guideFailed` (mirrors guideChecked storage pattern)
evidenceByStep: Map<string, QaNote[]>;          // memoized from notes[].journeyRef, key `${laneId}::${path}`, oldest→newest
```

addNote journeyRef resolution: if `testAlong.active` → current step's `{laneId, path}`; else first `matchRouteToSteps(journey, route)` hit; else undefined.
addNote context assembly (when resolved config.captureContext !== false): `{ events: drainSinceLastNote(), env: collectEnvSnapshot(route), forensics: input.forensics }`.

## 6. Component behavior contract

- **QaRoot.tsx**: split `widgetShown` (whole widget) from panel `isOpen`. Hotkey: if hidden → show + open panel; else toggle panel only (FAB never disappears). Mounts `<NoticeHost/>` and, when `testAlong.active`, `<TestAlongHud/>` inside QaRootInner. QaPanel is suppressed (not rendered/open) while test-along active.
- **NoticeHost.tsx** (NEW, owned by context agent): bottom-center fixed, `z:var(--qa-z-toast)`, aria-live polite + assertive region for errors, `dir` from useQa, pointer-events none on container / auto on buttons, `data-qa-overlay` + `qa-print-hidden`. Toast look: surface-2, border-subtle, radius-md, elev-2, ink-hi 13px; variant icon colors (info→accent, success→success, error→danger).
- **TestAlongHud.tsx** (NEW): compact bottom bar (replaces panel while active): "Step n of m" + step `what` (+`expect` if present, ink-mid), Back/Next (dir-aware chevrons), Pass (success) / Fail (danger), "Capture here" (accent, calls startCapture — note auto-links via context), Exit. Position like panel (safe-area insets), `--qa-tap` targets, surface-1 + border-subtle + elev-3. On step change: if evidenceByStep has notes for current step, `flashLocate(latestNote.target)`.
- **QaPanel.tsx**: global capture icon button (Crosshair) in header next to Export → `startCapture()`. Export dialog: backdrop onClick dismiss + stopPropagation on card + document-level Escape while open. Clear-all routes through undo-capable clearNotes. Header = flat surface-1 strip (no gradient), wordmark = accent 6px square + 13px/600 sans (no Cormorant).
- **NoteList.tsx**: skeleton rows (3 × `.qa-skeleton`) while `notesLoading && !notes.length`; severity chip + status one-tap toggle on cards; "Copy as agent prompt" button (Copy icon) → `noteToMarkdown(note)` → clipboard, notify copied/copy_failed.
- **NoteEditor.tsx**: capture CTA solid accent (no gradient); severity chip row (bug/question/polish, default bug) on quick-note form.
- **CaptureMode.tsx**: Bug B UI — `captureError` state; failed → `t('capture_failed')` + Retry button (re-runs capture with same selection); empty keeps `no_shot`. Severity chip row in annotation card, passed to addNote. On element selection: `collectTargetForensics(el)` → pass `forensics` to addNote. `clampRegionRect()` (min 8×8, clamp to viewport) applied at drag normalization + touch resize/move; tiny-both-axes drag → element click fallback.
- **CredentialsSection.tsx**: clipboard success/fail toasts via notify (pass notify/t down to CopyField).
- **QaFab.tsx**: `${namespace}:fabpos` key (from context) with one-time legacy `'qapture:fabpos'` migration; graphite disc restyle.
- **GuideSection.tsx**: "Start walkthrough" button in banner → startTestAlong(); per-step evidence badge (`evidence_n`), fail state from guideFailed (danger), "ticked, no evidence" flag (`no_evidence`, warn tint).

## 7. i18n keys (strings agent adds ALL of these to LangMap + en + ar; others use exactly these names)

| key | en | ar |
|---|---|---|
| capture_failed | Screenshot failed | فشل التقاط الصورة |
| retry | Retry | إعادة المحاولة |
| persist_failed | Storage full — this note may not survive a reload | مساحة التخزين ممتلئة — قد لا تبقى هذه الملاحظة بعد إعادة التحميل |
| note_deleted | Note deleted | تم حذف الملاحظة |
| notes_cleared | All notes cleared | تم مسح جميع الملاحظات |
| undo | Undo | تراجع |
| export_done | Export downloaded | تم تنزيل الملف |
| export_failed | Export failed | فشل التصدير |
| copied | Copied | تم النسخ |
| copy_failed | Copy failed | فشل النسخ |
| copy_prompt | Copy as agent prompt | نسخ كموجّه للوكيل |
| severity_label | Severity | الأهمية |
| sev_bug | Bug | خلل |
| sev_question | Question | سؤال |
| sev_polish | Polish | تحسين |
| status_open | Open | مفتوح |
| status_verified | Verified | تم التحقق |
| context_attached | {n} runtime events attached | {n} من أحداث التشغيل مرفقة |
| start_walkthrough | Start walkthrough | ابدأ الجولة |
| step_of | Step {n} of {m} | الخطوة {n} من {m} |
| next_step | Next | التالي |
| prev_step | Back | السابق |
| mark_pass | Pass | نجاح |
| mark_fail | Fail | فشل |
| capture_here | Capture here | التقط هنا |
| exit_walkthrough | Exit | خروج |
| evidence_n | {n} attached | {n} مرفق |
| no_evidence | ticked, no capture | مُعلّم بدون التقاط |
| expected_label | Expected | المتوقع |

## 8. Icons (strings/icons agent adds to IconName union + ICONS map; same stroke style as existing)

`Bug`, `AlertTriangle`, `RotateCcw` (undo), `ChevronLeft`, `ChevronRight`, `Play`. Everything else reuses existing icons (Crosshair, Copy, Check, Trash2, X, Loader2, ChevronDown…).

## 9. File ownership map

FOUNDATION (parallel):
- F1 styles: `src/lib/styles.ts` (rewrite), `src/mount/ShadowMount.ts` (drop applyThemeVars; add installContextCapture()/uninstall wiring per resolved config.captureContext), `src/lib/coverage.ts` (RISK_COLORS only), `src/lib/highlight.ts` (fixed colors, drop colors param)
- F2 context: `src/context/QaContext.tsx`, `src/components/NoticeHost.tsx` (new), `src/lib/idb.ts`
- F3 strings: `src/lib/strings.ts`, `src/icons/Icon.tsx`
- F4 capture: `src/lib/capture.ts`, `src/lib/scrollLock.ts`
- F5 newlibs: `src/lib/contextBuffer.ts`, `src/lib/journeyMatch.ts`, `src/lib/noteMarkdown.ts` (all new)
- F6 schema: `src/config/schema.ts`, `src/defaults.ts`, `src/index.ts`
- F7 cli: `src/bin/init.ts`, `src/bin/generators/genConfig.ts`, delete `src/bin/detectors/detectTheme.ts`, `src/bin/detectors/detectRoutes.ts`, `scripts/cli-detectors-smoke.mjs`

COMPONENTS (parallel, after foundation):
- C1: `src/components/CaptureMode.tsx`
- C2: `src/components/QaPanel.tsx`
- C3: `src/components/QaFab.tsx`, `src/components/QaRoot.tsx`
- C4: `src/components/NoteList.tsx`, `src/components/NoteEditor.tsx`
- C5: `src/components/GuideSection.tsx`, `src/components/CredentialsSection.tsx`, `src/components/LocationReveal.tsx`
- C6: `src/components/TestAlongHud.tsx` (new)

INTEGRATION (parallel, after components):
- I1: `src/lib/exportZip.ts` (+ may refactor to delegate per-note body to noteMarkdown), `scripts/export-smoke.mjs`, `scripts/smoke.mjs`
- I2 docs: `README.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`, `src/artifacts/SKILL.md`, `src/artifacts/AGENTS_SECTION.md`, `examples/*`, `CHANGELOG.md`
- I3 tests: `scripts/browser-test.mjs`, `playground/src/App.tsx` (strip theme; add console.error + failing-fetch fixtures)

VERIFY (serial): whole repo — runs `npm run verify` + `npm run browser-test`, fixes anything.
