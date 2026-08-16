# Qapture

> Drop-in, AI-aware, 100% client-side QA capture widget — ships **zero AI**.

A human tester walks your live web app, annotates elements or regions (auto-screenshot + note), follows a **graded testing journey** (red / amber / green risk zones), and exports a ZIP. That ZIP leads with an **induction preamble** your **own** terminal coding agent (Claude Code, Cursor, Windsurf, …) reads so it already knows your project — locating code from each point's CSS selector + screenshot, making the change, verifying it, and grading RED-zone coverage.

No model is bundled. No API keys. No network calls. The widget is 100% client-side and keyless; notes live in the tester's browser (IndexedDB) until they export. The CLI scaffolder is deterministic and AI-free. **The AI is yours.**

```bash
npm install qapture2
```

---

## Contents

- [What's new in v0.7 "Walk"](#whats-new-in-v07-walk)
- [What's new in v0.6 "Elbow Room"](#whats-new-in-v06-elbow-room)
- [What's new in v0.5 "Loop"](#whats-new-in-v05-loop)
- [What's new in v0.4 "Ledger"](#whats-new-in-v04-ledger)
- [Breaking Changes (v0.3.0 "Graphite")](#breaking-changes-v030-graphite)
- [Quick Start](#quick-start)
- [Steps to reproduce, recorded for you](#steps-to-reproduce-recorded-for-you)
- [Screenshots: two engines](#screenshots-two-engines)
- [Saving to a folder](#saving-to-a-folder)
- [Where notes live, and what "storage full" means](#where-notes-live-and-what-storage-full-means)
- [Config Reference](#config-reference)
- [Graded Risk Model](#graded-risk-model)
- [Guided Walkthrough (Test-Along)](#guided-walkthrough-test-along)
- [Severity, Status, and Copy as Agent Prompt](#severity-status-and-copy-as-agent-prompt)
- [Export and AI Handoff](#export-and-ai-handoff)
- [Runtime Context Capture](#runtime-context-capture)
- [Notices and Undo](#notices-and-undo)
- [CLI](#cli)
- [Launcher Gating](#launcher-gating)
- [Browser and SSR Support](#browser-and-ssr-support)
- [Isolation and Known Limitations](#isolation-and-known-limitations)
- [Uninstall](#uninstall)
- [License](#license)

---

## What's new in v0.7 "Walk"

| | |
|---|---|
| **The Walk** | One guided sequence over either your test plan or your notes, with a **Take me there** button that actually navigates. Pressing a Guide step now walks from it. |
| **Walk the re-test queue** | Filter to Re-test, press Walk: each stop takes you to the page, lights up the spot, re-shoots it and takes your verdict. |
| **A link that starts it** | `?qa=walk:retest` opens the app with the re-test round already running — send that instead of instructions. |
| **"Doesn't apply"** | A third grade for plan steps that aren't relevant to this build. Removed from coverage totals rather than counted either way. |
| **Alt+1/2/3** | Set severity while typing a note. |
| **Session summary** | The export leads with "12 points · 5 bugs · 4 pages · over 38 minutes". |

**Two fixes from real use:** the widget could be hidden underneath an app's own high-z-index chrome (it now sits above everything, in its own stacking context, without ever swallowing a click), or removed outright by a framework clearing `<body>` (it now puts itself back). And the panel's open state, tab and walk position survive a reload — the notes always did, the *place in the work* didn't.

---

## What's new in v0.6 "Elbow Room"

| | |
|---|---|
| **Bulk actions** | Select many notes → mark them Open / Re-test / Verified, or delete them, in one pass with a single undo. |
| **Compact list** | One line per note, expanding in place — for when a session has thirty of them. |
| **Move the panel** | Dock it to the other edge, or collapse it to its header strip, so it stops covering the app you're testing. |
| **Whole-screen capture** | Grab everything visible without dragging a box across the screen. |

---

## What's new in v0.5 "Loop"

Not a breaking release. Notes from 0.3.x and 0.4.x read back unchanged.

| | |
|---|---|
| **Steps to reproduce, written for you** | Every note now carries what the tester clicked, typed into, toggled and navigated on the way to it. Never what they typed — see [below](#steps-to-reproduce-recorded-for-you). |
| **Draw on the screenshot** | Tap the shot, add an arrow / box / pen mark in one of four colours. Burned into the image, so it survives everywhere the screenshot goes. Never interrupts the capture flow. |
| **A capture shortcut** | `Alt+Shift+C` (`Option+Shift+C` on macOS) jumps straight into capture from anywhere; press again to back out. Configurable via `captureHotkey`. |
| **A re-test queue** | Note status is now Open → **Re-test** → Verified. "Re-test" is the state that tells a tester what to check on the next build, with a filter chip and a header badge so the queue can't be missed. |
| **Automatic backups** | A backup ZIP downloads every 5 notes, for everyone who can't use folder saving (Safari, Firefox, phones). Pauses itself while folder saving is on. |
| **Catches what you miss** | When the page throws an error or a request fails, Qapture offers a one-tap capture with the error already written in — the bug nobody reported because nobody saw it. |
| **Before / after on a re-test** | A note in the re-test queue gets a "Re-test now" button that re-shoots the same target, so "is it actually fixed?" is answered with a picture. |
| **Share (phones)** | Hands the campaign ZIP to the OS share sheet — WhatsApp, Mail, Files, AirDrop — because a "download" on a phone lands where nobody finds it. |
| **A welcome card** | Three lines, shown once, for someone who was just handed a beta link. |

---

## What's new in v0.4 "Ledger"

v0.4 is **not** a breaking release — every 0.3.x config, note and export keeps
working, and each new feature is off until someone turns it on.

| | |
|---|---|
| **Screenshots frame the right thing** | Capture mode's own scroll lock used `overflow:hidden`, which **unstuck every `position: sticky` header** just before the screenshot was rendered — measured at 20px of wrongness in a 40px capture, now 0.0px. See [Screenshots: two engines](#screenshots-two-engines). |
| **Pixel-exact capture (opt-in)** | A real photograph of the tab rather than a redraw — so canvas/WebGL, video, cross-origin iframes and exotic CSS all come out right. One prompt per session, Chromium desktop. |
| **Save straight to a folder** | Pick a QA folder once; every note is written to disk as it's saved, organised `Project / Campaign / notes + screenshots + REPORT.md`. See [Saving to a folder](#saving-to-a-folder). |
| **Storage that explains itself** | A real usage meter, WebP screenshots (~10× smaller), a request to stop the browser evicting your data, and a "drop screenshots, keep findings" recovery valve. |
| **A usable notes list** | Severity/status filter chips with counts, text search, and a "this page" toggle. |
| **Simple mode** | Hides Logins and Guide for a tester who was just handed a link. |
| **Minimized capture** | A small box next to your selection instead of the full card — type, Enter, move on. |

---

## Breaking Changes (v0.3.0 "Graphite")

**v0.3.0 is a breaking release.**

- **Custom themes are removed.** The widget now ships one fixed, self-contained
  dark design ("Graphite") — there is no more per-project colour override. A
  `theme` key left in `qa.config` is no longer read; `validateConfig` ignores
  it and pushes this exact warning:

  > theme: custom themes were removed in Qapture 0.3.0 — the widget now ships
  > one fixed, self-contained design. The "theme" key is ignored; remove it
  > from your qa.config to silence this warning.

  Delete the `theme` block from your config — see the updated
  [`examples/minimal.config.ts`](./examples/minimal.config.ts) and
  [`examples/stitch-and-sell.config.ts`](./examples/stitch-and-sell.config.ts),
  both of which had their `theme` block removed entirely. The `QaTheme` type
  is still exported so old config objects keep type-checking, but it is
  `@deprecated` and has no runtime effect — see [`QaTheme`](#qatheme-deprecated).
- **New:** a guided, step-by-step walkthrough over your journey ("test-along"),
  severity + status on notes, a one-click "Copy as agent prompt", and an
  undo-capable delete/clear system. See the sections below.
- **New, and worth reading if you care about privacy:** an (on-by-default,
  opt-out) runtime context capture that records recent console errors and
  failed network calls into each note. See
  [Runtime Context Capture](#runtime-context-capture) and
  [SECURITY.md § Runtime context capture](./SECURITY.md#runtime-context-capture).

Full details: [CHANGELOG.md](./CHANGELOG.md#030-graphite--unreleased).

---

## Quick Start

### React (any)

```tsx
import { Qapture } from 'qapture2';
import type { QaConfig } from 'qapture2';

const config: QaConfig = {
  namespace: 'my-app',
  brand:     { label: 'My App QA' },
  hotkey:    'shift+alt+q',
};

// Render once near your app root.
// Dev-only by default — invisible in production unless alwaysVisible is set.
function App() {
  return (
    <>
      <RouterAndLayout />
      <Qapture config={config} />
    </>
  );
}
```

`<Qapture>` renders `null` on the server and is SSR-safe. On mount it attaches an isolated Shadow DOM host to `document.body`; on unmount it tears it down cleanly. Config is read once at mount time — changes to the prop after mount are ignored.

### Next.js App Router

`qapture2/next` re-exports the same component but ships with a `'use client'` directive prepended to its bundle output — no extra wrapper file needed:

```tsx
// app/layout.tsx
import { Qapture } from 'qapture2/next';
import config from '../qa.config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Qapture config={config} />
      </body>
    </html>
  );
}
```

### Standalone (non-React)

For apps without React — plain HTML, Vue, Svelte, Astro islands, etc. Use the imperative `initQaStudio()` from `qapture2/standalone`:

```js
import { initQaStudio } from 'qapture2/standalone';

const instance = initQaStudio({ namespace: 'my-app', brand: { label: 'My App' } });

// Later, to unmount and clean up:
instance.destroy();
```

Or use the registered `<qapture-widget>` custom element — accepts a `config` attribute (JSON string) or a `.config` property:

```html
<script type="module" src="/dist/standalone.js"></script>

<!-- attribute-based config -->
<qapture-widget config='{"namespace":"my-app"}'></qapture-widget>

<!-- or property-based config (full object, no JSON serialization needed) -->
<qapture-widget id="qa"></qapture-widget>
<script>
  document.getElementById('qa').config = {
    namespace: 'my-app',
    brand: { label: 'My App' },
  };
</script>
```

---

## Steps to reproduce, recorded for you

The hardest part of a bug report is the part testers skip: *how do I get to
this?* They skip it because they were busy testing, and by the time anyone
asks, the sequence is gone.

So every note now carries the run-up automatically:

```
**Steps before this** (recorded automatically, oldest first)

1. [-18.2s] clicked “Sign in”
2. [-14.9s] typed in “Email”
3. [-13.1s] typed in “password field”
4. [-11.4s] clicked “Continue”
5. [-9.8s]  went to /checkout
6. [-2.1s]  clicked “Place order”
```

It appears in the note, in `notes.md`, in the folder report, and in "Copy as
agent prompt" — right under the tester's own words, above the runtime console
and network context, because it is what a human reads first.

### What it will not record

This is the most sensitive thing Qapture touches, because interactions happen
directly on the data. The rules are deliberately strict:

- **What was typed is never recorded.** An edit records only *that* a field
  was edited, named by its visible label. The value is never read. A password
  field records as `password field`.
- **A dropdown's chosen option is not recorded** — only that it changed. An
  option's text is routinely a customer name or an address.
- **Character keys are ignored entirely**, so no keystroke trail can be
  reassembled into typed text. Only Enter, Escape, Tab, Backspace, Delete and
  the arrows are noted.
- Checkboxes and radios record `on`/`off` — interface state, not content.
- Navigation is path-only; query strings are redacted to `?…` like every other
  URL.
- Qapture's own UI is excluded, so your steps are yours, not clicks on the
  widget.
- 25 steps are kept, 12 travel with a note, labels cap at 60 characters, and
  repeats collapse (typing twenty characters is one step, not twenty).

Set `captureContext: false` to switch this off along with all other runtime
capture — no listener is installed at all. The complete guarantees are in
[SECURITY.md](SECURITY.md#interaction-steps-steps-before-this).

---

## Screenshots: two engines

Qapture can produce a screenshot two different ways. Both crop the exact
viewport rectangle you selected; they differ in where the pixels come from.

### `dom` — the default, works everywhere

html2canvas **re-renders a clone** of your DOM into an offscreen frame and
rasterises it. No permission prompt, works in every browser, and it is the
only option on Firefox, Safari and mobile.

Because it is a reconstruction rather than a photograph, it has limits worth
knowing:

- `<canvas>` / WebGL, `<video>` and cross-origin `<iframe>` content cannot be
  read and render blank or approximated;
- CSS the cloner doesn't implement (some `backdrop-filter`, `mask`, exotic
  gradients) renders differently;
- anything the clone lays out differently is a shot that doesn't match.

That last category is what v0.4 fixed. The culprit was Qapture's own scroll
lock: freezing the page with `overflow: hidden` on `<html>` takes away the
scrollport that `position: sticky` elements stick to, so every stuck header
and toolbar jumped back to its natural document position in the instant
between you choosing a rectangle and the screenshot being rendered. The lock
now swallows scroll events instead of touching CSS, and stuck elements are
additionally pinned in html2canvas's clone (it doesn't implement sticky
either).

You can measure this yourself — `npm run capture-accuracy-test` captures a
rectangle straddling a colour boundary and reports the error in pixels. It
reads 0.0px on 0.4.0 and 20px (of a 40px capture) on 0.3.1.

**v0.7.1 fixed a second, much louder failure: no screenshot at all.**
html2canvas ships its own CSS colour parser, and it predates CSS Color 4.
Handed `oklch(...)` it throws, and the throw aborts the whole render — so the
tester saw "Screenshot failed" and a Retry that re-ran the identical render and
could never succeed. Tailwind v4 emits `oklch()` for its entire default
palette and shadcn/ui inherits it, so on those stacks screenshots never worked
at all, on any page. `lab()`, `lch()`, `oklab()`, `color()` and `color-mix()`
failed the same way.

Qapture now rewrites those colours to plain sRGB inside the clone html2canvas
renders — never in your page. The conversion paints each colour onto a 1×1
canvas and reads the pixel back rather than reading `fillStyle` as a string,
because Chrome round-trips `oklch(...)` unchanged. Gradients and shadows are
rewritten in place, and a render that still throws is retried once with
decoration stripped. `npm run modern-css-test` proves it, and proves itself:
it first asserts that raw html2canvas *still* dies on the same fixture.

**v0.7.2 fixed the last of the mis-framing: clicking an element only captured
the part of it that was on screen.** Dragged regions are clamped into the
viewport before capture, so they were always safe — but an element *pick* is a
raw `getBoundingClientRect()`, and a table column, a sidebar, a long form or a
wide toolbar routinely extends past the fold. You got a fragment. And when the
element started *above* the viewport, the crop slid down the page to fill its
height, so the screenshot was the right size showing the wrong content — a
failure with nothing on screen to reveal it.

Captures now render the union of the viewport and the selection, so an element
that leaves the screen in any direction is rendered whole, up to 4000px per
side (past a four-viewport render budget the scale drops, not the framing).
The exact engine can't photograph off-screen pixels, so there the selection is
trimmed to the visible part instead — cropped, never displaced. `npm run
element-capture-test` measures all three overflow directions.

### `exact` — opt-in, pixel-for-pixel

Uses the Screen Capture API to photograph **this tab's real composited
pixels**, then crops your rectangle out arithmetically. Nothing is
re-rendered, so it cannot mis-frame, and everything above renders correctly
because it was never re-drawn in the first place.

- **Turn it on** from the capture hint bar ("Pixel-exact shots") or Settings.
- The browser asks once per session to share this tab. Nothing leaves the
  device — the frames are cropped locally and never uploaded.
- The QA overlay is hidden for the captured frame, so the scrim, the selection
  outline and the annotation card never appear in the image.
- **Chromium desktop only** (Chrome, Edge, Brave, Opera), because it depends
  on `preferCurrentTab`. Elsewhere the picker would let a tester share a
  screen or another window, whose pixels have nothing to do with our
  coordinate space — so the option isn't offered, and if a shared surface
  somehow isn't this tab (wrong `displaySurface`, or a frame whose aspect
  ratio doesn't match the viewport), Qapture falls back to `dom` rather than
  returning a confidently wrong image.

---

## Saving to a folder

Export-at-the-end only works if nothing goes wrong before the end. Folder
sync writes each note to disk **the moment it is saved**.

Open **Settings → Save to a folder**, pick a folder once, then name the
project and campaign. From then on:

```
<chosen folder>/
  Project X/
    2026-08-14 smoke test/
      REPORT.md          # the whole campaign, agent-ready, rewritten live
      campaign.json      # metadata + the note→file index
      notes/
        0001-checkout-button-stays-enabled.md
        0002-arabic-labels-clipped.md
      screenshots/
        0001-checkout-button-stays-enabled.webp
        0002-arabic-labels-clipped.webp
```

Ten projects become ten folders, each holding its named campaigns. Nothing
needs a browser to read.

Behaviour worth knowing:

- **Existing notes are mirrored** when you open a campaign, so the folder is
  complete rather than "everything from now on".
- **Editing a note renames its file** and removes the old one — no orphans.
- **Deleting a note** removes its files after the 5-second undo window, not
  before.
- **Reloading resumes the same campaign** and continues the numbering, because
  the note index lives in `campaign.json`.
- **The folder is remembered across sessions.** Browsers intentionally drop
  write permission between visits, so you get a one-click *Reconnect* rather
  than having to find the folder again.
- Export is unchanged and still works; this is a second, always-on copy.

**Everywhere, by one of two routes (v0.7.1).** Writing into a folder the
tester picked is the File System Access API, which is Chromium desktop only —
Safari has never shipped `showDirectoryPicker`, and its only filesystem API is
a sandbox the tester cannot see.

So on Safari, Firefox and phones the same feature runs a second way: name the
project and campaign as usual, and Qapture assembles the identical tree and
hands it over as a **ZIP whose internal paths are `<Project>/<Campaign>/…`**.
Unzip it into your QA folder and you get the same layout, the same filenames
and the same sequence numbers Chromium writes live. It refreshes itself every
few points, and **Save folder now** grabs it on demand.

The engine is chosen by feature detection rather than by sniffing the browser,
so Safari upgrades itself to live writing the day WebKit ships the picker.
Stopping a campaign and restarting it keeps its numbering, so a later ZIP never
disagrees with one already in your folder.

---

## Where notes live, and what "storage full" means

Notes and screenshots are stored **in the tester's own browser**
(IndexedDB) — never on the server your app is deployed from. That is what
makes Qapture keyless and offline, and it is also why a tester on a shared
beta link can see:

> Storage full — this note may not survive a reload

Every browser caps how much a single origin may store: usually a share of
free disk, but as little as a few hundred MB on a busy phone. Safari
additionally **evicts** data from sites not visited for a week. When the cap
is hit, the write is refused and the note exists only in the open tab.

v0.4 addresses this from four directions:

1. **Screenshots are ~10× smaller** — WebP at quality 0.92, capped at 1800px
   on the long edge (PNG fallback where WebP is unsupported). Screenshots are
   essentially all of the footprint, so this alone moves the ceiling a long way.
2. **You get warned at 70% of quota**, not at the moment a write fails, with a
   usage meter in Settings showing the origin total and Qapture's own share.
   (They differ: `navigator.storage.estimate()` reports the whole origin, so on
   a real app most of it is the host's caches and service worker.)
3. **"Ask browser to keep my notes"** calls `navigator.storage.persist()`,
   which stops eviction where the browser supports it.
4. **Folder sync** is the real answer for "I cannot lose this" — a file on
   disk is subject to no browser quota at all.

If a tester is stuck mid-session, **Settings → "Free space: drop screenshots,
keep notes"** removes every stored image while keeping all findings — and if
folder sync is on, those images are already safe on disk.

---

## Config Reference

All fields are optional. Passing an empty object (or no config at all) produces a valid, usable widget with sensible defaults.

### `QaConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | `'qapture'` | Prefix for IndexedDB (`${namespace}-db`) and localStorage keys (`${namespace}:*`). Use a unique value per project to avoid storage collisions on the same origin. |
| `theme` | `Partial<QaTheme>` (**deprecated, ignored**) | — | **Removed in v0.3.0.** `validateConfig` ignores this key (after pushing a warning) — the widget always renders the fixed Graphite design. Delete it from your config. See [Breaking Changes](#breaking-changes-v030-graphite). |
| `brand` | `{ label?: string }` | `{ label: 'Qapture' }` | Panel heading label. |
| `loginField` | `{ en: string; ar?: string }` | `{ en: 'Username', ar: 'اسم المستخدم' }` | Display label for the login column in the Credentials tab. |
| `credentials` | `QaCredential[]` | `[]` | DEV/TEST/SEED login rows shown in the Credentials tab. |
| `journey` | `QaJourneyLane[]` | `[]` | Role-grouped testing journey shown in the Guide tab. **If you leave this empty, the Guide falls back to a built-in generic plan** (see below) rather than rendering an empty tab. |
| `preamble` | `QaPreamble` | `null` | AI agent handoff context block embedded in the export. |
| `rtl` | `boolean` | `false` | When `true`, the UI initialises in Arabic / RTL mode. |
| `visible` | `boolean \| undefined` | `undefined` | `true` = always show; `false` = always hide; `undefined` = dev-only (hidden in production). |
| `alwaysVisible` | `boolean` | `false` | When `true`, overrides `visible` and shows the panel even in production. |
| `hotkey` | `string` | `'shift+alt+q'` |
| `captureHotkey` | `string` | `'shift+alt+c'` — jumps straight into capture mode | Keyboard shortcut that toggles the panel open/closed. |
| `captureContext` | `boolean` | `true` | Whether to record ambient runtime context (recent console errors/warnings, uncaught errors, failed network calls, and an environment snapshot) into each note as it's captured. Set to `false` to disable entirely. See [Runtime Context Capture](#runtime-context-capture). |

### `QaTheme` (deprecated)

> **Removed in v0.3.0.** The widget no longer accepts a custom theme — it
> ships one fixed, self-contained dark design ("Graphite") built into the
> stylesheet itself. `QaTheme` and `QaConfig.theme` are still exported so
> pre-0.3 config objects continue to type-check without edits, but both are
> marked `@deprecated` and have **no effect** on the rendered UI. Nine colour
> tokens (`primary`, `primaryDark`, `accent`, `accentDark`, `sage`, `cream`,
> `mauve`, `surface`, `ink`) used to be overridable here; there is nothing to
> configure in their place.

### `QaCredential`

| Field | Type | Required | Description |
|---|---|---|---|
| `role` | `string` | yes | English role label (also used as the stable tracker key). |
| `roleAr` | `string` | no | Arabic role label. |
| `login` | `string` | yes | Username / email / phone shown in the table. |
| `password` | `string` | yes (may be empty) | Password shown in the table. |
| `seeded` | `boolean` | no | `false` renders the row muted to indicate the credential is not yet seeded. |
| `hint` | `{ en: string; ar?: string }` | no | Short contextual note shown next to the row. |

Credentials are for **DEV / TEST / SEED environments only** — see [Security](#security-model) below.

### `QaJourneyLane`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | yes | Stable identifier; combined with `step.path` to form the checked-step key `${lane.id}::${step.path}`. |
| `role` | `QaBilingual` | yes | Role label — a plain string or `{ en: string; ar?: string }`. |
| `steps` | `QaJourneyStep[]` | yes | Ordered list of steps for this lane. |
| `color` | `string` | no | Accent color for the lane header (any CSS color string). |

### `QaJourneyStep`

| Field | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | yes | Route or logical screen identifier (e.g. `/checkout`, `/admin (Users)`). |
| `what` | `QaBilingual` | yes | Tester instructions — a plain string or `{ en: string; ar?: string }`. |
| `risk` | `'red' \| 'amber' \| 'green'` | no | Risk classification. Omitted steps count as `'green'` in coverage calculations. |
| `riskWhy` | `string` | no | One-line explanation of why the step is risky, shown in the Guide tab and embedded in the export Coverage Report. |

### `QaBilingual`

```ts
type QaBilingual = string | { en: string; ar?: string };
```

A plain string is language-neutral and displayed in both languages. An object enables the panel's EN/AR language toggle.

### `QaPreamble`

Freeform AI handoff context embedded verbatim in the export. All fields are optional; extra keys beyond the listed ones are also allowed.

| Field | Type | Description |
|---|---|---|
| `projectName` | `string` | Project name shown as the preamble heading. |
| `oneLiner` | `string` | One-sentence description embedded as a blockquote. |
| `stack` | `string` | Tech stack description (framework, ORM, database, etc.). |
| `runCommands` | `string \| string[]` | Commands to start the dev server and seed the database. |
| `conventions` | `string \| string[]` | Numbered codebase conventions for the agent to follow. |
| `invariants` | `string \| string[]` | Rules the agent must never violate (e.g. "prices must be >= 0"). |
| `verifySteps` | `string \| string[]` | Steps to verify a fix in the running app. |
| `additionalContext` | `string` | Freeform context not covered by the fields above. |

Array fields also accept a plain newline-separated string; the export normalises both forms before rendering.

---

## Graded Risk Model

**If you define no journey at all (v0.7.1),** the Guide shows a built-in
generic plan instead of an empty page — first look, moving around, the main
task, when it goes wrong, on a phone. It is labelled in the UI as generic, with
a pointer to `qa.config`, so nobody mistakes it for coverage of *your* app; it
exists because an empty checklist taught the tester nothing and silently asked
them to invent one. Define `journey` and it disappears.

Each journey step carries a `risk` value. The Guide tab shows a coloured dot beside every step; the export leads with a coverage report scored on RED steps.

| Risk | When to use | Verification rule |
|---|---|---|
| `red` | Payment, checkout, authentication, order state mutations, refunds, payouts, user data changes — anything **irreversible or financial** | Must verify; uncovered reds are flagged by the receiving agent before it acts on any points |
| `amber` | Important flows that are **recoverable** — cart, product CRUD, seller dashboard, messaging, search | Change carefully; verify end-to-end |
| `green` | Informational / display only — static pages, labels, copy, colour, analytics views, tooltips | Change freely; quick smoke test |

Use `riskWhy` to document the specific reason a step is `red`. This text is embedded in the export's Coverage Report so the receiving agent understands the invariants before touching any code.

### Coverage tiers

Coverage is **scored on RED steps only**. The Guide tab shows `RED N/M covered`; the export includes the tier label.

| Tier | Red score |
|---|---|
| Minimal | < 50% of red steps covered |
| Adequate | 50–79% covered |
| Full | 80–99% covered |
| Complete | 100% covered |

When there are no red steps the score is vacuously Complete. The receiving agent is instructed to flag uncovered RED steps before acting on any annotation in the export.

---

## Guided Walkthrough (Test-Along)

Ticking journey steps one at a time in the Guide tab works, but on a long journey it's easy to lose your place. **Test-along** turns the same `journey` config into a guided, step-by-step mode:

1. Open the **Guide** tab and press **"Start walkthrough"** (`start_walkthrough`). The panel closes and is replaced by a compact bottom bar — the Notes/Logins/Guide panel is hidden while a walkthrough is active.
2. The bar shows **"Step *n* of *m*"** (`step_of`), the current step's instructions (`what`), and — when the step defines one — its `expect` text (`expected_label`): what a pass actually looks like.
3. **"Back" / "Next"** (`prev_step` / `next_step`) move between steps; the buttons are direction-aware (their chevrons flip in RTL).
4. **"Pass" / "Fail"** (`mark_pass` / `mark_fail`) grade the current step. A pass adds the step to the same `guideChecked` set the Guide tab shows; a fail records it in a parallel `guideFailed` set (persisted the same way, under `${namespace}:guideFailed`) so a step can be visibly flagged red without losing its place in the checklist.
5. **"Capture here"** (`capture_here`) starts a capture without leaving the walkthrough. Any note captured while test-along is active is **automatically linked** to the current step — no manual tagging, no picking a route from a dropdown.
6. **"Exit"** (`exit_walkthrough`) closes the walkthrough and returns to the normal panel.

Back in the Guide tab, each step shows an evidence badge — **"{n} attached"** (`evidence_n`) when notes are linked to it, or, if the step was marked Pass with nothing ever captured against it, **"ticked, no capture"** (`no_evidence`, shown in the warn tint) as a gentle nudge that a checked box isn't the same thing as an annotation the receiving agent can act on.

---

## Severity, Status, and Copy as Agent Prompt

Every note (quick note or captured point) can now carry:

- **Severity** — `bug` (default), `question`, or `polish` (`sev_bug` / `sev_question` / `sev_polish`), set from a chip row shown both on the quick-note form and on the capture-mode annotation card.
- **Status** — `open` (default) or `verified` (`status_open` / `status_verified`), toggled with a single tap directly on each note's card in the Notes tab — useful for marking a point re-checked without deleting it.

Both fields ride along into the export: each `## Point N` in `notes.md` gets a `Severity` and `Status` line (see [ZIP layout](#export-and-ai-handoff) below), and a note linked to a journey step (by test-along or by route match — see below) gets a `Journey step` line too.

**Copy as agent prompt** (`copy_prompt`) puts a *single* note on the clipboard, rendered through the exact same Markdown template used for each point in the exported ZIP (`noteToMarkdown()`), including its runtime context block. Use it to hand one finding to a terminal agent without doing a full export. A `copied` / `copy_failed` toast confirms the result.

Outside test-along, a captured note is also auto-linked to a journey step whenever the current route matches one: `matchRouteToSteps()` checks the page's route against every step's `path` (treating `:param` / `[param]` segments as wildcards), preferring an exact match over a parameterised one.

---

## Export and AI Handoff

### The workflow

1. **Capture** — click an element or drag a region on the live page (or press "Capture here" mid-[walkthrough](#guided-walkthrough-test-along)). Qapture auto-screenshots the visible page and opens the note editor. Write a description, optionally set severity, save.
2. **Guide** — tick steps in the journey as you walk through them, or run the guided [Test-Along](#guided-walkthrough-test-along) walkthrough instead. The Guide tab tracks red-zone coverage and shows the current tier.
3. **Export** — click Export in the panel. A `qa-notes-<timestamp>.zip` downloads to your machine. Give it a meaningful name. (For a single finding, "Copy as agent prompt" on any note skips the ZIP entirely — see [above](#severity-status-and-copy-as-agent-prompt).)
4. **Handoff** — drop the ZIP into your terminal coding agent's context. If you use Claude Code, the `.claude/skills/qapture/SKILL.md` the CLI generated (or the `AGENTS.md` snippet) primes the agent automatically when the ZIP is attached.
5. **Agent acts** — the agent reads `notes.md`, internalises the preamble (project context, dev credentials, red-zone coverage, invariants), flags any uncovered RED steps, then works through each `## Point N` annotation: locates the code via the selector + screenshot, reads the severity/status/runtime-context evidence, makes the change, verifies it in the running app, and produces a graded summary.

### ZIP layout

```
qa-notes-<timestamp>.zip
├── notes.md
└── screenshots/
    ├── point-1.webp
    ├── point-2.webp
    └── ...
```

Since v0.4 screenshots are WebP where the browser supports it (PNG
otherwise). The extension in `screenshots/` and the one referenced from
`notes.md` come from the same helper, so they always agree.

### `notes.md` structure

```
<!-- Qapture Export Preamble — read before acting on any point. -->

# Project — QA Handoff
> one-liner

## Project       (name, stack, run commands)
## Conventions   (numbered codebase rules)
## Login Context (DEV/TEST/SEED credentials table + warning)
## Coverage Report (red/amber/green totals + uncovered RED list)
## How to Verify a Fix
## Invariants (Do Not Break)
## Additional Context

---NOTES---

# Brand Testing Notes

## Point 1
- **Page:** /some-route
- **Full URL:** https://…               (only when it differs from Page)
- **When:** <timestamp>
- **Severity:** bug                     (bug | question | polish)
- **Status:** open                      (open | verified)
- **Journey step:** buyer → /checkout   (when linked — test-along or route match)
- **Target:** element
- **Selector:** `#element-id`
- **Screenshot:** screenshots/point-1.png

Tester's note text...

<details><summary>Runtime context at capture</summary>

```
viewport   1440×900 @2x
language   en-US
timezone   Asia/Baghdad
online     true
pageLoad   842ms
userAgent  Mozilla/5.0 …

events (3, most recent last):
  [-2.1s] console.error: TypeError: Cannot read properties of undefined (reading 'total')
  [-1.8s] POST https://example.com/api/checkout?… → 500 (340ms)
  [-0.2s] uncaught: TypeError: Cannot read properties of undefined (reading 'total')
```

**Element forensics**

```
html    <button class="checkout-btn" disabled>Place order</button>
display inline-flex
…
a11y    accessibleName=true tabReachable=true contrast=ok
```

</details>

---

## Point 2
...
```

(The **Theme Tokens** section from pre-0.3.0 exports is gone — v0.3.0 has no per-project theme to embed. The runtime-context block is present only when [Runtime Context Capture](#runtime-context-capture) is enabled and something was recorded.)

The preamble degrades gracefully — sections with no data are marked `(not provided)` rather than omitted, so the agent always receives the full structure.

---

## Runtime Context Capture

Every note (unless disabled) automatically carries a small slice of what the browser was doing right before it: recent `console.error`/`console.warn` calls, uncaught errors and unhandled promise rejections, and failed or slow `fetch`/`XMLHttpRequest` calls — plus a one-time environment snapshot (viewport, language, timezone, online state, page-load time, and, where available, JS heap size). It turns "the button does nothing" into "the button does nothing, and here's the console error and the 500 that happened at that moment" — see [`src/lib/contextBuffer.ts`](./src/lib/contextBuffer.ts).

This is genuinely new privacy-relevant surface, and it is documented in full — including the exact guarantees (query strings redacted, bodies/headers/cookies/storage never touched, ring buffer capped at 75 events) — in **[SECURITY.md § Runtime context capture](./SECURITY.md#runtime-context-capture)**. Read it before shipping this to a tester on a real project.

Disable it entirely with:

```ts
const config: QaConfig = {
  captureContext: false,
};
```

With this set, nothing is ever wrapped or recorded, and no runtime-context block appears in the export or in "Copy as agent prompt".

---

## Notices and Undo

Deleting a note or clearing all notes is no longer instant and irreversible. Both actions remove the item from the UI immediately, but the real IndexedDB write is deferred 5 seconds behind a toast with an **Undo** (`undo`) button — press it inside that window and the note (or the whole list) comes back at its original position. Closing the tab, or the host app unmounting `<Qapture>`, flushes any pending deletes right away, so nothing is ever silently lost or silently resurrected after the fact.

The same toast system (`notices`) reports a handful of other outcomes that previously had no UI to surface through: a full IndexedDB quota (`persist_failed`), export success/failure (`export_done` / `export_failed`), clipboard copy success/failure (`copied` / `copy_failed`), and a failed screenshot with a `retry` action. At most 3 toasts queue at once; a 4th drops the oldest.

---

## CLI

The CLI scaffolds `qa.config`, the agent skill, and `AGENTS.md` into any repository. It is **deterministic, AI-free, and network-free** — no model call, no network request, no `require()`-ing of target project files.

```bash
npx qapture2 init [target-dir] [--force]
npx qapture2 version
```

`target-dir` defaults to the current directory. `--force` overwrites existing `qa.config.*` and `qa.preamble.md` (SKILL.md is always refreshed regardless).

### What it detects and generates

| Step | What happens |
|---|---|
| Route detection | Scans `src/`, `app/`, `pages/` for route files; generates journey lanes with placeholder `'green'` steps for you to grade |
| Credential detection | Scans `.env.example` and seeder/seed files for test logins. **Never reads `.env`, `.env.local`, `.env.production`, or any real secrets file** — enforced by a hard blocklist |
| `qa.config.js` / `.ts` | Generated based on detections; contains TODO comments for manual grading. No `theme` block is emitted — v0.3.0 removed custom themes entirely (see [Breaking Changes](#breaking-changes-v030-graphite)) |
| `qa.preamble.md` | Starter preamble file; fill with project context and paste into `config.preamble` |
| `.claude/skills/qapture/SKILL.md` | Claude Code agent skill (always refreshed — this is a vendor artifact) |
| `AGENTS.md` | Idempotent merge with sentinel guards; safe to run repeatedly |

All generated files are idempotent — existing `qa.config.*` and `qa.preamble.md` are skipped unless `--force` is passed.

### IDE notes

After `init`, copy the agent instructions into your IDE's rules directory:

- **Cursor** — copy the `qapture` block from `AGENTS.md` into `.cursor/rules/qapture.md`
- **Windsurf** — append the `qapture` block from `AGENTS.md` to `.windsurf/rules.md`

---

## Launcher Gating

By default the widget is **dev-only** — hidden when `NODE_ENV === 'production'`.

| Config | Behaviour |
|---|---|
| `visible: undefined` (default) | Dev-only — hidden in production builds |
| `visible: false` | Always hidden (useful for a temporary disable) |
| `visible: true` | Always shown |
| `alwaysVisible: true` | Always shown — overrides `visible` |

The **hotkey** (default: `Shift+Alt+Q`) toggles the panel open/closed regardless of `visible`. Change it via `hotkey: 'ctrl+shift+q'` or any `modifier+key` combination recognised by the browser `keydown` event.

The **capture hotkey** (default: `Shift+Alt+C`, i.e. `Option+Shift+C` on macOS) jumps straight into capture mode from anywhere on the page, and pressing it again backs out. Change it via `captureHotkey`.

> Why Alt/Option rather than Cmd/Ctrl: the obvious chords belong to things a web page cannot and must not override — Cmd/Ctrl+C is copy, and on macOS Cmd+Q quits the browser at the OS level, before the page ever sees the key. Alt/Option combinations are the only family a page can claim safely, and the same physical keys behave identically on macOS and Windows.

---

## Browser and SSR Support

- **Peer dependencies:** React >= 18, ReactDOM >= 18.
- **SSR-safe:** `Qapture`, `initQaStudio()`, and `<qapture-widget>` all guard `typeof window` and return no-ops on the server. Nothing is rendered server-side.
- **Next.js App Router:** use `qapture2/next` (which has `'use client'` baked into its bundle output) rather than `qapture2` directly. This prevents the "attempted to call a Client Component from the Server" error.
- **Node >= 18** required for the CLI.
- Heavy dependencies (`jszip`, `html2canvas`) are loaded as **lazy code-split chunks** — they do not affect initial page load and are only fetched when the user triggers a capture or export action.

### Feature availability by browser (v0.4)

| Feature | Chromium desktop | Firefox / Safari desktop | Mobile |
|---|---|---|---|
| Capture, notes, export | ✅ | ✅ | ✅ |
| `dom` screenshots (default) | ✅ | ✅ | ✅ |
| Pixel-exact screenshots | ✅ opt-in | — | — |
| Save to a folder, live | ✅ opt-in | — | — |
| Save to a folder, as a zip | ✅ | ✅ | ✅ |
| Storage meter | ✅ | ✅ (Safari reports coarse numbers) | ✅ |
| Persistent storage request | ✅ | Firefox prompts; Safari ignores | varies |

Nothing here is required. Where a feature is unavailable the UI says so and
points at the path that always works (Export), and no capability is assumed
without a runtime check.

---

## Isolation and Known Limitations

### What works everywhere

- **Shadow DOM isolation** — the widget chrome (CSS, events) lives inside an open shadow root attached to `<body>`. The host app's CSS frameworks (Tailwind, Bootstrap, etc.) cannot leak into the widget, and the widget's styles cannot leak out. Works with no Tailwind installed in the host.
- **React peer independence** — the widget's React tree lives inside the shadow root; it does not conflict with the host app's React version or tree.
- **Storage degradation** — IndexedDB and localStorage both degrade silently to in-memory storage in private browsing mode or SSR environments. Notes will not persist between sessions in private mode, but the current session works normally.

### Known limitations

- **html2canvas captures the visible light DOM only.** Content inside *other* custom elements that have their own shadow roots (not qapture's own) will not appear in screenshots. This is a limitation of html2canvas, not qapture.
- **`position: fixed` may shift on transformed ancestors.** If any ancestor of `document.body` has a CSS `transform`, `perspective`, or `will-change` property applied, `position: fixed` elements — including the QA panel — may be offset from their expected position. This is standard CSS containment behaviour.
- **Next.js App Router requires `qapture2/next`.** Importing from `qapture2` in a Server Component context will produce a "use client" error. Use the `/next` entry point.
- **Config changes after mount are ignored.** `<Qapture>` mounts once on first render (`useEffect` with `[]` deps) and ignores subsequent prop changes. To apply a new config, destroy the instance and remount.
- **One instance per page.** Calling `initQaStudio()` or rendering `<Qapture>` multiple times without calling `destroy()` first will append multiple widget hosts to `<body>`.

---

## Security model

- **Zero AI, zero network, zero keys.** No model is bundled; no API calls are made; no telemetry is collected.
- **Data stays in the browser** until the tester explicitly exports a ZIP. Nothing is ever transmitted.
- **Runtime context capture** (new in v0.3.0) records recent console/network events into each note for the receiving agent — query strings are redacted, bodies/headers/cookies/storage are never touched, and it can be disabled entirely with `captureContext: false`. See [Runtime Context Capture](#runtime-context-capture) and [SECURITY.md § Runtime context capture](./SECURITY.md#runtime-context-capture).
- **Credentials are DEV/TEST/SEED only.** The `credentials` config field and the Login Context in the export are intended exclusively for non-production environments.
- **The CLI never reads real secrets.** A hard path blocklist prevents the CLI from reading `.env`, `.env.local`, `.env.production`, certificate files, or any file under `/secrets/`, `/keys/`, `/credentials/`. Only `.env.example` and seeder files are scanned.

See [SECURITY.md](./SECURITY.md) for the full security model and vulnerability reporting instructions.

---

## Uninstall

1. Remove `<Qapture />` (or `initQaStudio()` calls) from your codebase.
2. Uninstall the package: `npm uninstall qapture2`.
3. Optionally delete the IndexedDB left behind — open the browser console on your app's origin and run:

```js
indexedDB.deleteDatabase('qapture-db'); // replace 'qapture' with your namespace value
```

4. Optionally delete scaffolded files: `qa.config.*`, `qa.preamble.md`, `.claude/skills/qapture/`, and the `qapture` block in `AGENTS.md`.

---

## License

MIT. Icon path data derived from [Lucide](https://lucide.dev) (ISC).
