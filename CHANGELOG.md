# Changelog

All notable changes to `qapture2` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
