# qapture2 v0.3.0 "Graphite" — ultracode build prompt

> Paste everything below the line into an **ultracode** session opened in
> `/Users/m2farhood/Desktop/CODES/03-Ecommerce-Stores/qa-studio`.
> Opus planned it; Sonnet agents execute it.

---

ultracode

You are building **qapture2 v0.3.0 "Graphite"** in this repo. The full interface
contract already exists at `docs/V03-CONTRACT.md` — **read it first and treat it
as binding**. It fixes every token value, type signature, i18n key, icon name,
and file-ownership boundary. Do not invent names that aren't in it.

## Ground rules (non-negotiable)

- **Every `agent()` call passes `{ model: 'sonnet' }` explicitly.** An omitted
  `model` silently inherits the session model. There are no exceptions — if a
  stage seems to want a stronger model, raise `effort` instead.
- **Never run `npm publish`, `npm version`, or `git push`.** The owner ships.
  Committing locally is fine.
- Match existing house style: `qa-` class prefix, `t('key')` for all user-facing
  text, logical RTL utilities (`qa-ms-*`/`qa-me-*`, never `ml-`/`pl-`),
  `qa-tap` touch targets, `data-qa-overlay` on every light-DOM escape.
- **Preserve** RTL/Arabic, the touch/iPad paths, the capture focus trap,
  `.qa-print-hidden`, the `--qa-tap` mechanism, and the class names
  `.qa-z-10093` / `.qa-z-10094` / `.qa-tab-indicator` — `scripts/browser-test.mjs`
  asserts on them.
- **Done means a command exited 0**, and the agent that verifies is never the
  agent that built. `npm run verify` and `npm run browser-test` must both pass
  before you report success.
- **Kill any stray dev server before verifying.** `npm run browser-test` spawns
  its own vite on :5183; a leftover `npm run play` on :5180 sharing the same
  build cache causes phantom failures. `lsof -ti:5180 | xargs kill -9` first.

## Where the repo actually is right now

Branch **`v0.3-graphite`**, and it is **green** — `npm run verify` passes. Two
commits already landed on top of 0.2.4:

1. `fix: opaque screenshots + safe StrictMode teardown` — two real defects found
   by driving the widget in real Chrome:
   - `captureRegion()` passed `backgroundColor: null` to html2canvas against
     `document.body`. Sites paint their background on `<html>`, so captures came
     out with transparent pixels — a dragged region over whitespace exported a
     **fully blank PNG**. Now resolves the real page background
     (body → documentElement → white). Verified: corner pixels went from
     `[0,0,0,0]` to opaque white, `transparent: 0` across all pixels.
   - `<Qapture>`'s effect cleanup called `root.unmount()` synchronously, firing
     React's "Attempted to synchronously unmount a root while React was already
     rendering" in **every StrictMode consumer** (the Next/CRA dev default).
     Teardown is now deferred to a microtask, and ShadowMount's flash-box sweep
     is scoped `:not(qapture-overlay)` so a deferred destroy can't rip out a
     replacement instance's live host.
   - This commit also already landed: `CaptureOutcome`
     (`'ok'|'empty'|'failed'`) + the Retry affordance in `CaptureMode`,
     `withTimeout` clearing its timer via `.finally`, **all 29 Graphite i18n
     keys in both en and ar**, and the six new icons
     (`Bug`, `AlertTriangle`, `RotateCcw`, `ChevronLeft`, `ChevronRight`, `Play`).
     **Contract §7 and §8 are therefore DONE — do not redo them.**

2. `feat: v0.3 groundwork` — three complete, unused new libs plus the optional
   `QaNote` fields:
   - `src/lib/contextBuffer.ts` — console/error/network ring buffer (cap 75),
     `collectEnvSnapshot`, `collectTargetForensics`, query-string redaction.
     Complete and matches contract §3. **Nothing calls it yet.**
   - `src/lib/journeyMatch.ts` — `matchRouteToSteps`, exact matches before
     `:param`/`[param]` matches. Complete.
   - `src/lib/noteMarkdown.ts` — `noteToMarkdown(note, {brand, index})`.
     Complete.
   - `QaNote` in `QaContext.tsx` gained optional
     `severity` / `status` / `journeyRef` / `context`. **Types only — nothing
     populates them yet.**

So: **contract §3 (new libs), §7 (i18n) and §8 (icons) are done.** Everything
else in the contract is untouched. `QaContext.tsx` is otherwise still the 0.2.4
version — it still exposes `theme`, still has `clearAll` (not `clearNotes`), and
has none of the notices / test-along / undo work.

## What to build

Everything in `docs/V03-CONTRACT.md` sections **1, 2, 4, 5, 6, 9** — plus the
integration work. The owner has explicitly approved the **breaking** removal of
custom themes; do not soften it or keep a compatibility shim beyond the
deprecation warning the contract specifies verbatim.

Suggested phase structure (adapt if you see better, but keep the barriers where
a later file genuinely needs an earlier file's exported names):

**Phase 1 — Foundation (parallel, one agent per bullet):**
- F1 styles: `src/lib/styles.ts` (rewrite to Graphite tokens + semantic
  utilities per §1–§2, restyling existing colour-bearing class names *in place*
  so components keep compiling), `src/mount/ShadowMount.ts` (drop
  `applyThemeVars`; wire `installContextCapture()` / `uninstallContextCapture()`
  per resolved `config.captureContext`), `src/lib/coverage.ts` (RISK_COLORS
  only), `src/lib/highlight.ts` (fixed colours, drop the `colors` param).
- F2 context: `src/context/QaContext.tsx` + new `src/components/NoticeHost.tsx`
  + `src/lib/idb.ts` (`put` returns `boolean`). This is the biggest single file
  — §5 in full: notices, `notesLoading`, `namespace`, widened `addNote` that
  attaches `journeyRef` + `context`, `updateNote` accepting severity/status,
  soft-delete with a 5s undo window, `clearNotes`, `beforeunload` + unmount
  flush of pending deletes, and all the test-along state.
- F6 schema: `src/config/schema.ts`, `src/defaults.ts`, `src/index.ts` — §4.
- F7 cli: `src/bin/init.ts`, `src/bin/generators/genConfig.ts`, **delete**
  `src/bin/detectors/detectTheme.ts`, update `src/bin/detectors/detectRoutes.ts`
  and `scripts/cli-detectors-smoke.mjs` so no generated config emits a `theme`
  block.

**Phase 2 — Components (parallel, after Phase 1 lands):** §6, exactly the
ownership split in §9 (C1–C6). Note `CaptureMode` already has `captureError` +
Retry from the earlier commit — that agent's remaining job is the severity chip
row, `collectTargetForensics` on element selection, and `clampRegionRect()`.

**Phase 3 — Integration (parallel):** `src/lib/exportZip.ts` delegating each
point's body to `noteToMarkdown` and carrying severity/status/context; docs
(`README.md`, `docs/ARCHITECTURE.md`, `SECURITY.md`, `src/artifacts/SKILL.md`,
`src/artifacts/AGENTS_SECTION.md`, `examples/*`, `CHANGELOG.md`); tests
(`scripts/browser-test.mjs`, and `playground/src/App.tsx` — strip its `theme`
block and add `console.error` + failing-`fetch` fixtures so the context buffer
has something real to record).

**Phase 4 — Verify (serial, single agent, must not be a builder from earlier
phases):** run `npm run verify` and `npm run browser-test`, fix whatever fails,
re-run until both exit 0.

## SECURITY.md must be updated, not just touched

`contextBuffer.ts` is a genuinely new privacy surface: it wraps `console.error`,
`console.warn`, `fetch` and `XMLHttpRequest`, and its output ships inside the
tester's ZIP. The existing guarantees it upholds — **query strings redacted,
never bodies, never headers, never storage/cookie values, ring capped at 75** —
must be written into `SECURITY.md` explicitly, alongside how to disable it
(`captureContext: false`).

## Adversarial review before you call it done

After Phase 4 is green, fan out Sonnet reviewers over the diff with **distinct
lenses**, not redundant copies:
- **Money/data-loss lens:** can the soft-delete undo window ever lose a note the
  tester meant to keep, or resurrect one they meant to delete? Check the
  `beforeunload` path and provider unmount specifically.
- **Leak lens:** does any URL, header, body, or storage value reach
  `notes.md` that the tester didn't type? Grep the actual generated export, do
  not reason about it from source.
- **Regression lens:** RTL/Arabic, iPad touch capture, the focus trap, and the
  `.qa-z-*` class names the browser test asserts on.
- **Consumer lens:** a 0.2.x app upgrading in place — old notes in IndexedDB
  must still load and export, and a stale `theme` key must warn without
  throwing.

Have each finding independently verified by a second agent before you report it;
kill anything that a skeptic can refute.

## Report back

A short summary of: what shipped, what `npm run verify` + `npm run browser-test`
printed, every behaviour change a consumer would notice, and anything in the
contract you deliberately did **not** build (with the reason). Do not write the
owner's sign-off for them.
