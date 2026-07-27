# Changelog

All notable changes to `qapture2` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] "Graphite" — Unreleased

A breaking release. The widget's chrome is rebuilt on a fixed, self-contained
dark design ("Graphite") with custom themes removed entirely, and a batch of
tester-facing capability is added on top: a guided walkthrough mode, note
severity/status, a runtime-evidence buffer attached to every note, a
"Copy as agent prompt" shortcut, and an undo-capable delete/clear system.

### Breaking

- **Custom themes are removed.** The widget no longer accepts a `theme`
  override — it ships one fixed, self-contained dark design. `QaConfig.theme`
  and the `QaTheme` type are still exported (marked `@deprecated`) purely so
  existing config objects keep type-checking; `validateConfig` now ignores a
  `theme` key after pushing this exact warning:

  > theme: custom themes were removed in Qapture 0.3.0 — the widget now ships
  > one fixed, self-contained design. The "theme" key is ignored; remove it
  > from your qa.config to silence this warning.

  `DEFAULT_THEME`, `coerceTheme`, and `ResolvedConfig.theme` are deleted from
  the schema/defaults layer; `ShadowMount.ts` no longer applies theme CSS
  variables to the shadow host at all (`applyThemeVars()` is gone). Both
  bundled examples (`examples/minimal.config.ts`,
  `examples/stitch-and-sell.config.ts`) have had their `theme` block deleted
  outright — not commented out.
- **The CLI no longer detects or generates a theme block.** The Tailwind/CSS
  colour-extracting `detectTheme.ts` detector is deleted; `genConfig.ts` never
  emits a `theme:` key into a scaffolded `qa.config`.
- **`highlight.ts`'s `flashLocate()` no longer accepts a `colors` param** — the
  locate-flash always uses the fixed Graphite highlight colours now that
  there's no per-consumer theme to read them from.
- **`src/index.ts` re-exports `QaTheme` as a type only**, with an `@deprecated`
  JSDoc pointing at this entry — it carries no runtime behaviour any more.

### Added

- **Runtime context capture** (`src/lib/contextBuffer.ts`, new). Wraps
  `console.error`/`console.warn`, uncaught `error`/`unhandledrejection`
  events, `fetch`, and `XMLHttpRequest` behind a 75-event ring buffer, plus an
  environment snapshot (viewport, language, timezone, online state, optional
  page-load/JS-heap figures) and per-element forensics (truncated outerHTML,
  key computed styles, coarse accessibility facts). Every new note carries
  this as its `context` field unless disabled via `captureContext: false`.
  Query strings are redacted from every recorded URL; request/response
  bodies and headers, cookies, storage, and form values are never read. Full
  guarantees documented in `SECURITY.md`.
- **Guided walkthrough ("test-along")**. `startTestAlong()` turns the journey
  config into a step-by-step mode: a new `TestAlongHud` bottom bar (replacing
  the panel while active) shows the current step's instructions and optional
  `expect` text, Back/Next navigation, Pass/Fail grading (`guideFailed` mirrors
  `guideChecked`'s persistence), a "Capture here" action that auto-links any
  note taken to the current step, and Exit. The Guide tab gained a
  "Start walkthrough" entry point and per-step evidence badges.
- **`journeyMatch.ts`** (new) — `matchRouteToSteps()` auto-links a captured
  note to the journey step matching the current route (`:param`/`[param]`
  aware, exact matches preferred over parameterised ones), even outside
  test-along.
- **Severity and status on notes.** Every note can carry a `severity`
  (`bug` default, `question`, `polish`) and a `status` (`open` default,
  `verified`), both optional and requiring no IndexedDB migration. Set from a
  chip row on the quick-note form and the capture-mode annotation card;
  status toggles with one tap on each note card.
- **"Copy as agent prompt."** `noteMarkdown.ts` (new) renders a single note as
  the exact same agent-ready Markdown used per-point in the exported ZIP;
  a new button on each note card copies it straight to the clipboard, so a
  single finding can be handed to a terminal agent without a full export.
- **Notices and undo-capable deletes.** A small toast queue (`notices`/
  `notify`/`dismissNotice`, capped at 3) now surfaces background outcomes —
  storage-full, export success/failure, copy success/failure, a failed
  screenshot's Retry action. `deleteNote()`/`clearNotes()` are soft: the note
  (or the whole list) disappears from the UI immediately, but the real
  IndexedDB write is deferred 5 seconds behind an Undo action on the toast; a
  `beforeunload`/unmount flush guarantees a closed tab can't silently
  resurrect — or silently lose — a pending change.
- **`QaJourneyStep.expect`** (optional) — bilingual "what a pass looks like"
  text, shown alongside a step's instructions in both the Guide tab and the
  test-along HUD.
- **`QaConfig.captureContext`** (optional boolean, default `true`) — the
  single on/off switch for runtime context capture, described above.
- New icons: `Bug`, `AlertTriangle`, `RotateCcw`, `ChevronLeft`, `ChevronRight`,
  `Play`.
- 29 new i18n keys added to `src/lib/strings.ts` in both English and Arabic
  for all of the above (capture retry, severity/status labels, walkthrough
  copy, notices, copy-prompt, etc.).
- **Orchestration protocol for the hosting agent** (`SKILL.md`,
  `AGENTS_SECTION.md`). The hosting AI is now instructed to triage the whole
  batch of points before touching code — clustering points that share a root
  cause via their runtime-context evidence into one fix instead of N — then
  orchestrate rather than work serially: spawn one Sonnet subagent per
  point/cluster (model pinned explicitly, effort chosen per task, parallel
  only across points touching disjoint files), reproduce each issue live
  before fixing it, and treat forensics (contrast/accessibility flags) as
  objective acceptance criteria alongside the tester's own description.
  Supervision is by reality-check (read what a subagent's report claims,
  always read RED-zone diffs directly, run the project's own verify command
  independently) rather than rereading every diff. Adjacent improvements the
  agent notices are always welcome as suggestions in the final report;
  whether they may be implemented without being asked follows the same
  red/amber/green gating as any other change.

### Fixed

- **Screenshots came out with a transparent background.** `captureRegion()`
  now resolves the real page background colour instead of passing `null` to
  `html2canvas`, so a capture over a page with no explicit background no
  longer renders as a see-through PNG.
- **`<Qapture>`'s unmount could throw a React StrictMode error.** The effect
  cleanup now defers `instance.destroy()` via `queueMicrotask` instead of
  calling it synchronously, avoiding a teardown-during-render conflict when
  StrictMode double-invokes effects in development.
- **`withTimeout()` could leave a dangling timer** after its promise settled
  first; the timer is now always cleared via `.finally()`.
- **`ShadowMount.ts`'s light-DOM flash-box cleanup could remove a live,
  just-mounted widget host.** The `[data-qa-overlay]` sweep in `destroy()` is
  now scoped with `:not(qapture-overlay)`, so a `destroy()` call that runs
  after a replacement instance has already mounted (StrictMode remounts, the
  deferred teardown above) can no longer tear out that still-live host.

## [0.2.4] — 2026-07-08

A correctness batch: 29 bugs found via multi-pass code review, fixed, and
verified with a red/green (revert-then-restore) protocol against real
regression tests — jsdom-based unit/fixture tests for library and CLI logic,
and real headless-Chrome tests (via Puppeteer) for shadow-DOM/touch/UI
behavior. No breaking API changes; safe for existing `^0.2.0` consumers.

### Fixed — correctness / data integrity

- **Locate-on-page theme colors never applied.** The flash highlight always
  used hardcoded purple instead of your configured `theme.primary`/`accent` —
  the shadow host and the flash box live in different parts of the DOM tree,
  so a CSS-custom-property read could never have worked. Colors are now
  passed explicitly.
- **`deleteQaDatabase()` (full uninstall helper) silently did nothing.** It
  never closed the live IndexedDB connection or attached completion
  callbacks, so the documented uninstall path no-op'd. It's now also
  correctly re-exported from the package's main entry point (it wasn't).
- **Region-note "Locate on page" landed in the wrong spot** once the page had
  scrolled since capture — the flash box now corrects for scroll drift using
  a persisted capture-time snapshot.
- **`storage.ts` silently dropped writes** after a localStorage quota/write
  failure — reads now correctly fall through to the in-memory fallback.
- **Generated CSS selectors could collide** and silently highlight/target the
  wrong element — selectors are now checked for uniqueness before use, with
  a fallback chain.
- **Quick-note image attachments leaked memory** — an unmount-cleanup effect
  was capturing a stale (always-null) value, so the actual attached image's
  blob URL was never revoked.
- **CLI credential detector fabricated cross-file pairings** — a heuristic
  clustered matches purely by line-number proximity with no per-file
  boundary, occasionally pairing an email from one seeder file with an
  unrelated password from another.
- **CLI route classifier misclassified real routes** like `/registered-users`,
  `/authors`, `/administrator-guide` as auth/admin routes (bare prefix match,
  no path-segment boundary) and silently dropped them from the generated
  journey.
- **CLI secret guard's exact-basename blocklist was case-sensitive** — a
  literal `.ENV` bypassed a check every other rule in the file enforced
  case-insensitively.
- **CLI credential detector missed camelCase/SCREAMING_SNAKE_CASE fields**
  like `const adminPassword = '...'` — only plain object-literal style was
  matched.

### Fixed — reliability / edge cases

- IndexedDB `open()` had no `onblocked` handler — a cross-tab version
  upgrade could hang every operation indefinitely with no feedback.
- The locate-flash could paint mid-animation on pages using
  `scroll-behavior: smooth`, landing at a stale position; it now waits for
  the scroll to actually settle.
- A hung `html2canvas()` call left capture mode stuck indefinitely; it's now
  bounded by a timeout.
- Config strings containing an embedded newline (credential fields, theme
  tokens, journey roles) could corrupt the exported `notes.md` Markdown
  table; newlines are now sanitized.
- Overlapping capture/lock calls could have one caller's `unlock` prematurely
  release a lock another caller still needed (now reference-counted).
- CLI Tailwind theme detection couldn't see the common nested-shade config
  shape (`primary: { 500: '#...' }`) and reported no theme for most real
  projects.
- The export panel's naming/delete-confirmation dialogs could resurface
  stale after closing and reopening the panel mid-dialog.
- Escape-cancelling a capture while a screenshot was still processing could
  leak an object URL.
- On touch devices, a small finger wobble during tap-to-select could be
  swallowed by native page scrolling instead of registering the tap.

### Fixed — accessibility / polish

- `CSS.escape` unavailability (old Safari/IE) fallback didn't escape quotes,
  which could break generated selectors.
- Tab focus could escape the capture overlay into the dimmed host page
  underneath (no focus trap).
- The active-tab underline in the panel didn't reposition after switching
  between English and Arabic.
- A drag-repositioned FAB could stay clamped to stale bounds after a device
  rotation.
- A `<qapture-widget>` custom element connected-then-disconnected before its
  lazy module import resolved could silently never mount.
- Credential/journey list items keyed only by `role`/`(lane, path)` could
  silently collapse if a config had duplicate values.
- Corrected a doc comment overclaiming the error boundary catches
  event-handler exceptions (it doesn't — React never routes those through
  `componentDidCatch`).
- Added a show/hide toggle for credential passwords in the UI (previously
  always plaintext with no way to mask during a shared screen).

### Changed — tooling

- `src/bin/**` (the CLI) was previously excluded from `tsc --noEmit`
  entirely and had zero automated coverage. Added `typecheck:bin`, a CLI
  invocation smoke test, and a fixture-based detector regression suite, all
  wired into `npm run verify`.
- `scripts/browser-test.mjs`'s Chrome path is no longer hardcoded to macOS —
  it honors `PUPPETEER_EXECUTABLE_PATH`/`CHROME_PATH` first.

### Not changed (evaluated, kept as-is by design)

- Exported ZIP credentials remain plaintext in `notes.md` — this is
  intentional: the export exists specifically so a coding agent/tester can
  use those credentials to test login flows.
- A full keyboard-driven element/region picker was considered out of scope
  for this patch (a focus trap was added instead); tracked as a future
  enhancement.
