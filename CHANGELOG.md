# Changelog

All notable changes to `qapture2` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.7.3] "Only What's There" — 2026-08-16

Corrects a regression shipped in 0.7.2, and answers the complaint underneath
it. No breaking changes. **Anyone on 0.7.2 should update.**

### Fixed

- **0.7.2 made captures of clipped elements far worse.** 0.7.2 taught the
  capture to chase an element's whole bounding box so a tall element would no
  longer be truncated at the fold. That is right only when the whole box is
  drawn somewhere in the document — and inside a scroll container it is not.
  A dashboard, calendar, table, chat list or sidebar scrolls an inner
  `overflow:auto` box, so a 3000px column inside a 700px box exists as 700px
  of pixels and 2300px of nothing at all. Chasing the full box rendered that
  nothing.

  Measured on a fixture matching a real dashboard: the capture came out
  **23.3% element and 76.7% empty page background** — and because the stored
  shot is capped on its *longest* edge, the part the tester actually cared
  about was squeezed from 1040px wide down to **312px**. It read as "the
  screenshots are broken", and it was.

  Captures are now clipped to what the browser genuinely paints: the picked
  element's box intersected with every ancestor that clips it (any `overflow`
  other than `visible`, on either axis, up to `<html>`). The viewport is
  deliberately *not* treated as a clipper, so a long form on an ordinary
  scrolling page still captures in full — the thing 0.7.2 got right is kept.
  Same fixture after the fix: **100% element, at its full 1040×1400.** The
  hover outline is clipped the same way, so the highlight is a promise the
  screenshot can keep.

- **The render memory ceiling was counted in the wrong unit.** It budgeted CSS
  pixels while the canvas costs `width × height × scale²`, so on a retina
  screen the real allocation was four times what the budget implied. It is now
  an explicit device-pixel ceiling (~64 MB).

### Changed

- **"It looks simulated" is now something the tool admits and offers to fix.**
  The default engine re-draws the page with html2canvas rather than
  photographing it, so fonts shift, shadows and gradients flatten, and
  `<canvas>`/video come out blank — testers read that as a fake screenshot and
  stop trusting the tool. The pixel-exact engine that solves it has existed
  since 0.4, as a small pill in the hint bar that nobody ever noticed.

  A redrawn capture now says so directly under the preview — "This is a redraw
  of the page, not a real photo" — with a one-tap **Use real screenshots** that
  grants the permission and immediately re-shoots the same selection. Offered
  at the moment the tester is looking at an image that seems wrong, which is
  the only moment the offer means anything. Chromium desktop only; where the
  browser cannot do it, nothing is shown rather than a dead promise.

## [0.7.2] "All of It" — 2026-08-16

One defect, reported from a real app as *"it only takes part of the screenshot
— but when I drag a region it's fine."* No breaking changes.

### Fixed

- **Clicking an element captured only the part of it that was on screen.** A
  dragged region is clamped inside the viewport before it is ever captured, so
  the crop can never be asked for pixels that were not rendered. An element
  *pick* had no such clamp: `getBoundingClientRect()` happily describes a box
  that starts above the fold, ends below it, or runs off the side — which is
  the normal shape of a table column, a sidebar, a long form, or a wide
  toolbar. The capture rendered the viewport and nothing more, so the tester
  filed a fragment of the thing they pointed at.

  Worse, the same code failed a second way that does not look like a failure at
  all. When the element started *above* the viewport (a negative `top`), the
  crop origin was clamped to zero while its height was not, so the capture slid
  down the page to fill itself: the right size, of the wrong content. The note
  showed something the tester never selected, with nothing to indicate it.

  The capture now renders the union of the live viewport and the selection, so
  an element that leaves the screen in any direction is rendered in full and
  the crop always has real pixels to take. The viewport stays inside that
  union, which keeps `position: fixed` chrome and pinned sticky elements where
  the tester sees them. Selections are followed up to 4000px per side and the
  render scale drops rather than the framing once a capture would cost more
  than four viewports of canvas, so a click on a page-sized wrapper cannot
  exhaust the tab's memory.

  The exact (screen-share) engine cannot photograph off-screen pixels at any
  price, so there it trims the selection to the visible part instead — a
  correctly framed fragment, never displaced content.

  Measured, not asserted: `scripts/element-capture-test.mjs` drives real Chrome
  against colour fixtures that overflow the viewport upward, downward and
  sideways, and reads the stored screenshot back pixel by pixel. Before the
  fix, the below-fold half of a tall element scored 0.0% and the
  above-the-fold case was 50% content the tester never selected; after, all
  three land on the exact expected mix.

## [0.7.1] "Any Browser" — 2026-08-16

Three defects found in real use, all of which made a whole feature unusable
rather than merely awkward. No breaking changes.

### Fixed

- **Screenshots failed completely on modern apps.** html2canvas@1.4.1 carries
  its own CSS colour parser, and that parser predates CSS Color 4. Handed
  `oklch(...)` it does not skip the element or degrade — it throws, and the
  throw aborts the entire render. The tester got "Screenshot failed" and a
  Retry button that re-ran the identical render, so it could never succeed.

  This is not an edge case. Tailwind CSS v4 emits `oklch()` for its whole
  default palette, and shadcn/ui inherits that for every theme token, so any
  app on that stack could never take a single screenshot, on any page. `lab()`,
  `lch()`, `oklab()`, `color()` and `color-mix()` failed the same way.

  Colours are now rewritten to plain sRGB inside the document html2canvas
  renders — the throwaway clone, never the real page. The conversion is done by
  painting the colour onto a 1×1 canvas and reading the pixel back, **not** by
  reading `fillStyle` as a string: Chrome round-trips `oklch(...)` as
  `oklch(...)`, so a string swap silently handed the parser the same value it
  chokes on. Colours inside gradients and shadows are rewritten in place, and a
  render that still throws is retried once with decoration stripped, because a
  flat screenshot beats none.

- **The Retry button looked disabled.** It was the only button in the capture
  card with no background or cursor style, so it fell back to the user agent's
  grey `buttonface` — which in a dark panel reads as "you cannot press this".
  The one control offered after a failure looked broken.

- **The Guide was a blank page** whenever a project shipped no `journey` — it
  rendered its own title, centred, over nothing. That is the common case,
  because whoever installs the widget is focused on making it appear. The
  tester was silently asked to invent a test plan and handed empty space to do
  it on. The Guide now falls back to a generic plan that fits any web app
  (first look, moving around, the main task, when it goes wrong, on a phone),
  clearly labelled as generic with a pointer to `qa.config`, so the tab always
  says something useful. A project that defines its own journey is unaffected.

### Added

- **Folder saving now works on Safari, Firefox and phones.** It was previously
  refused outright with "needs Chrome, Edge or Brave" — the tester lost the
  entire idea, not just the live-writing part of it.

  Safari has never shipped `showDirectoryPicker` (its only filesystem API is
  the Origin Private File System, a sandbox the tester cannot see), so writing
  into a folder they picked is genuinely impossible there. But the valuable
  part of this feature was never the liveness — it was the STRUCTURE: ten
  projects, each with named campaigns, each campaign a readable folder.

  So there are now two engines behind one feature. Chromium writes each note
  the instant it is saved, as before. Everywhere else, the identical tree is
  assembled and delivered as a ZIP whose internal paths are
  `<Project>/<Campaign>/…` — unzip it into the QA folder and the result is the
  same layout, the same filenames and the same sequence numbers Chromium
  writes live. It refreshes itself every few points rather than waiting to be
  asked, and a "Save folder now" button covers the tester about to close their
  laptop.

  The engine is chosen by feature detection, never by sniffing the user agent,
  so Safari upgrades itself to live writing if WebKit ever ships the picker.

  Stopping a campaign and restarting it keeps its numbering, so a later ZIP
  never disagrees with one already sitting in the tester's folder.

## [0.7.0] "Walk" — 2026-08-15

The Guide stops being a piece of paper. Everything in this release is about a
tester being *taken* to the work instead of being told where it is — plus two
bugs reported from real use.

No breaking changes.

### Fixed

- **"The tool doesn't appear on some pages."** Two separate causes, both real:

  1. *It was there, underneath something.* Every visible part of the widget
     lived at z-index ~9990–10097 in the page's own stacking context, and a
     z-index arms race is normal in real apps — sticky headers, drawers,
     cookie banners and modal libraries routinely sit at 99999 or
     2147483647. The host element is now a 0×0 fixed box at z-index
     2147483000 with its own stacking context, which lifts the whole widget
     above the page in one step while preserving the internal ordering. It is
     `pointer-events: none`, so it can never swallow a click meant for the
     app; each surface inside re-enables events for itself.
  2. *Something removed it.* Frameworks and page transitions do occasionally
     clear the contents of `<body>` — a hydration mismatch, a router that
     swaps the whole tree, a library that resets innerHTML. React never
     re-runs its mount effect for that, because from React's point of view
     nothing changed. A MutationObserver now watches for the host being
     detached and puts it straight back.

  Also: mounting is deferred until `<body>` exists (a synchronous script in
  `<head>` used to throw and silently never mount), and when the widget is
  hidden by the dev-only default it now says so once in the console, with the
  one-line fix, instead of leaving "why can't I see it?" unanswerable.

- **"It doesn't survive reloading."** The notes always did — but the *place in
  the work* did not. Whether the panel was open, which tab you were on, and
  (new in this release) where you were in a walk are now all restored after a
  reload. Testing is full of reloads: you refresh to re-check a fix, the app
  redeploys under you, a navigation is a hard load. Every one of them used to
  dump the tester back to a closed widget on the default tab, which reads as
  the tool having reset itself.

### Added

- **The Walk.** One guided sequence, two kinds of stop, replacing the old
  test-along HUD:

  - **Plan** — a step from the testing journey: what to check, what passing
    looks like, and a grade.
  - **Notes** — something already captured: its words, the spot lit up on the
    page, and for anything awaiting a re-test, re-shoot plus a verdict.

  Every stop has a **Take me there** button that actually navigates. Pressing
  a line in the Guide now walks from that step, which is what a checklist
  entry naming a page always implied. The notes walk walks *whatever the list
  is showing*, so filtering to Re-test and walking IS the re-test round —
  one mechanism rather than a third mode.

  Navigation is soft (pushState + popstate, which every history-based router
  listens for, keeping app state alive) with a reload button always visible
  beside it — not as a fallback for an error we can detect, but because no
  soft navigation can be *guaranteed* to move a given app's router, and the
  tester must never be stuck.

  **The walk survives navigation**, including full page loads. Without that
  the feature would die at its first stop.

- **A link that starts the walk.** `?qa=walk`, `?qa=walk:notes` or
  `?qa=walk:retest` in the URL opens the app with the walk already running —
  the last one filters to the re-test queue first. Sending a tester a link is
  already how this tool gets used; now the link can carry the instruction
  ("re-check these") instead of a paragraph explaining it. The parameter is
  consumed on arrival so a later reload resumes the tester's real position
  rather than restarting from the top.

- **"Doesn't apply" as a third grade.** Real test plans always contain steps
  that don't apply to the build in front of you; with only pass/fail a tester
  had to either lie or leave it blank, and a blank is indistinguishable from
  "haven't got to it". N/A steps are removed from the coverage totals
  entirely rather than counted either way — calling them covered would
  inflate the number, calling them uncovered would leave a red zone
  permanently unanswerable.

- **Alt+1 / Alt+2 / Alt+3 set severity** while writing a note, without
  reaching for the chips. Deliberately modifier-based: bare digits are text
  the tester is trying to type.

- **A session summary at the top of the export** — "12 points · 5 bugs · 2
  questions · 3 verified · 4 pages · over 38 minutes". The first question
  anyone opening a handoff asks is what they are looking at.

### Tests

- New **`npm run walk-test`** — real Chrome, 14 assertions: a Guide step opens
  the walk at that step, "Take me there" genuinely changes the page (and is
  correctly absent when the stop is the page you are already on), **the walk
  is still on the same step after a full page reload**, "doesn't apply"
  persists and counts as neither pass nor fail, the notes walk offers a
  verdict rather than pass/fail, and `?qa=walk:retest` opens the re-test round
  and consumes its parameter.
- `browser-test`'s panel-opening helper is now idempotent, because the panel's
  open state persists across pages and reloads — "click the FAB" is no longer
  the same thing as "open the panel".

## [0.6.0] "Elbow Room" — 2026-08-15

Small things, all of them about the tool staying out of the way once a session
gets real: dozens of notes, a panel sitting on the thing you're testing, and
batches of findings that need the same edit.

No breaking changes.

### Added

- **Bulk actions.** Select several notes and change or delete them in one
  pass: Open / Re-test / Verified, or Delete. "Select all" takes everything
  *currently visible*, so filtering to Re-test and selecting all is the
  natural way to close out a batch after a fix round. A bulk delete gets a
  single undo for the whole batch, not one per note, and applies one state
  update, one toast and one folder-sync pass rather than N of each.

- **A compact list.** One line per note — number, severity colour, first
  words, status — with the full card opening in place when tapped. At thirty
  notes the card list was a scrolling marathon; this turns "find that note"
  back into a glance. Remembered per browser.

- **The panel gets out of the way.** It can now be moved to the other edge in
  one tap, and collapsed to just its header strip. It sits over the app under
  test, and which side is in the way depends entirely on the app — so both are
  one-tap controls in the header rather than settings. Uses logical inset
  properties, so "the near edge" is the left in English and the right in
  Arabic.

- **Whole-screen capture.** A "Whole screen" button in the capture bar takes
  everything visible without dragging a box corner to corner — awkward on a
  laptop, and often the thing you actually wanted.

### Fixed

- **The annotation card could land off-screen for a full-viewport selection.**
  Placement anchored the card above or below the selected rectangle; a
  selection that fills the viewport leaves room for neither, and the card was
  pushed off the top with its Save button unreachable — the same failure 0.3.1
  fixed for tall cards, arriving by a different route. When neither side has
  room the card now floats near the top of the viewport instead. Found by the
  new whole-screen test rather than by a person, which is the point of it.

## [0.5.0] "Loop" — 2026-08-15

Where 0.4 was about not losing anything, 0.5 is about closing the loop: a
finding that carries its own steps to reproduce, can be drawn on, and comes
back around for a re-test after someone fixes it.

No breaking changes. Notes written by 0.3.x and 0.4.x read back unchanged, and
every new field is optional.

### Added

- **Steps before this — recorded automatically.** Every note now carries the
  handful of things the tester did on the way to it: what they clicked, which
  fields they edited, what they toggled or submitted, and where they
  navigated, with timings, rendered as a numbered list in the note, the
  export and the folder report. A bug report without steps to reproduce is a
  riddle; testers rarely write them because they were busy testing, and by the
  time anyone asks, the sequence is gone.

  **What was typed is never recorded** — only *that* a field was edited, named
  by its visible label. A `<select>`'s chosen option isn't recorded either
  (option text is routinely a customer name), only that it changed. Character
  keys are ignored entirely, so no keystroke trail can be reassembled into
  typed text; only Enter/Escape/Tab/arrows are noted. Qapture's own UI is
  excluded, 25 steps are kept, 12 ride along with a note, and repeated
  interactions collapse into one entry with a count. It is part of runtime
  context capture, so `captureContext: false` switches it off with everything
  else. Full rules in [SECURITY.md](SECURITY.md#interaction-steps-steps-before-this).

- **Draw on the screenshot.** Tap the screenshot — in the capture card or when
  editing a saved note — and mark it up with an arrow, a box or a pen in one
  of four colours, with undo and clear. "This bit, right here" is the hardest
  thing to say in words and the easiest thing to draw. Marks are flattened
  into the image on save, so they survive into the note, the folder, the ZIP
  and an agent's context with no viewer and no second file. It never
  interrupts: capture is exactly as fast as before, and drawing is something
  you opt into on an image you already have in front of you.

- **A capture shortcut.** `Alt+Shift+C` (`Option+Shift+C` on a Mac) drops
  straight into capture mode from anywhere on the page, and again backs out —
  no hunting for the button first, which a tester otherwise does dozens of
  times a session. Configurable via `captureHotkey`.

  Why not a Cmd/Ctrl chord: the obvious candidates are taken by things a web
  page cannot and must not override. Cmd/Ctrl+C is copy; and on macOS Cmd+Q
  quits the browser at the OS level, before the page ever sees the keystroke.
  Alt/Option chords are the only family a page can claim safely, and the same
  physical keys work identically on macOS and Windows.

- **A re-test queue.** Note status gained a third state: Open → **Re-test** →
  Verified, cycled by tapping the status pill. `Re-test` is the missing middle
  — someone says it's fixed, nobody has checked — and it is what a tester
  coming back to a patched build needs in order to know what to look at.
  There's a filter chip for it and a badge in the panel header, so a queue
  can't sit there unnoticed.

- **Catch what the tester didn't notice.** When the page throws an uncaught
  error or a request fails outright (or comes back 5xx), Qapture offers a
  one-tap capture — with the error already written into the note, so the
  tester adds context instead of transcribing a stack trace. The buffer has
  always *seen* these; until now it only attached them to notes someone
  thought to file, and the most valuable bug is the one nobody reported
  because nobody saw it: a crash behind a spinner, a failed background save.

  Restraint is the design: `console.error` is excluded (apps log to it
  constantly, often on purpose), never fires while the tester is already
  capturing, never repeats the same message, and at most one prompt per 45
  seconds. Off switch in Settings.

- **Re-test evidence — before and after.** A note sitting in the re-test queue
  gets a **Re-test now** button: it finds the same target again (by its stored
  CSS selector, falling back to the captured rectangle), re-shoots it, and
  stores the new image beside the original. "Is it actually fixed?" is
  answered with a picture instead of memory, and both images travel into the
  export (`point-N.webp` and `point-N-after.webp`) and the campaign folder.

- **Share, for phones.** Where the platform can hand a file to the OS share
  sheet, the export dialog gains a **Share** button that sends the campaign
  ZIP straight to WhatsApp, Mail, Files or AirDrop. On a phone a "download"
  lands somewhere the tester will never find it, which quietly made phone
  testing useless. Sharing is subject to the browser's user-gesture rule and
  building a ZIP is slow, so a share refused for a stale gesture is treated as
  normal: the archive is kept and a "Share now" button appears, one fresh tap
  away. Where sharing isn't available at all, it falls back to a download.

- **A welcome card.** Three lines, once, for someone who was handed a beta
  link and has no idea what the floating button is: what this is, how to
  report something, and that their work saves itself. Deliberately does not
  explain severity, journeys, folders or export — a wall of instructions is
  how a tester decides the tool is someone else's problem.

- **Automatic backups.** A backup ZIP downloads every 5 notes. Folder saving
  (0.4) solves this properly but only exists on Chromium desktop; a tester on
  Safari, Firefox or a phone was still one closed tab away from losing
  everything, with "remember to hit Export" as the only defence — and someone
  testing another person's beta does not remember. It needs no permission and
  no setup, pauses on its own while folder saving is running (two copies of
  the same session helps nobody), and can be switched off in Settings.

### Tests

- New **`npm run loop-features-test`** — real Chrome, 33 assertions across
  every feature in this release, asserting on the stored data rather than the
  UI: the shortcut enters and leaves capture mode; the step trail records the
  right things in the right order **and provably does not contain a secret
  typed into a field**; the status pill cycles all three states and raises the
  header badge; a backup download fires on the 5th note; a drawn mark ends up
  in the saved screenshot's pixels; the welcome card appears once and stays
  gone across a reload; a failed request produces a capture prompt whose note
  opens pre-filled with the error; re-testing stores a real "after" image and
  renders both; and Share hands over exactly one genuine `.zip` File.

## [0.4.0] "Ledger" — 2026-08-14

The theme of this release is **not losing anything**: not the region you
framed, not the session you captured, not the notes a tester filed on a
laptop that then ran out of browser storage.

No breaking changes. Every 0.3.x config, note and export keeps working; each
new feature is off until someone turns it on.

### Fixed

- **Screenshots captured the wrong part of the page — caused by Qapture's own
  scroll lock.** This was measured, not guessed: a new real-browser test
  (`npm run capture-accuracy-test`) captures a rectangle straddling a colour
  boundary and reports the misalignment in pixels. On 0.3.1 a capture next to
  a sticky header came back **20px wrong out of 40** — half the image was of
  somewhere else. On 0.4.0 the same fixture measures **0.0px**.

  The mechanism: capture mode froze scrolling with `overflow: hidden` on
  `<html>`/`<body>` — the standard modal trick, and exactly wrong here,
  because it runs *between* the tester choosing a rectangle and the
  screenshot rendering. Making the root a non-scrolling box takes away the
  scrollport that `position: sticky` elements stick to, so every stuck
  header, toolbar and sidebar **jumped back to its natural position** in the
  document before the render. With the page scrolled to 1200px, a stuck
  header measured `getBoundingClientRect().top === 0` before the lock and
  `-1200` after it. Since sticky headers are in nearly every modern app, this
  read as "the screenshots are just wrong".

  The lock no longer touches CSS at all: it swallows `wheel` and `touchmove`
  in the capture phase, so nothing in the page's box model moves. Removing
  the scrollbar also widened the layout viewport by ~15px on platforms with
  classic scrollbars (Windows, Linux, macOS with "always show scrollbars"),
  shifting centred and responsive layouts sideways — that goes away with the
  same change.

  Two supporting fixes:
  - html2canvas doesn't implement `position: sticky` either, so stuck
    elements are now pinned at their on-screen offset in its `onclone` hook.
  - Cropping moved out of html2canvas's own `x/y/width/height` options into a
    plain 2D-canvas crop of a viewport-sized render, so the arithmetic is
    ours and checkable.

  Checked and found already correct in html2canvas@1.4.1, so deliberately
  *not* changed: inner `overflow:auto` scroll offsets (it restores those
  itself) and captures on a scrolled page (measured at 0.0px).

- **Deleting a note could silently fail to delete it.** `deleteNote`,
  `clearNotes` and `updateNote` read the pre-change list by assigning to a
  local variable from *inside* a `setNotes(prev => …)` updater and using it on
  the next line. That only works because React sometimes evaluates an updater
  eagerly inside `dispatchSetState` as a bail-out optimisation — and it stops
  doing so as soon as any other state update is pending on the same
  component. When it didn't run, the entire soft-delete was skipped: no
  durable `pendingDeleteIds` marker, no commit timer, no IndexedDB delete, so
  the note reappeared on the next reload. Latent in 0.3.x and triggered
  reliably by v0.4's extra state; all three now derive their before/after
  lists from a ref via a small `applyNotes` helper, with no ordering
  assumptions. Covered by the existing browser test's soft-delete-commit
  assertion.

### Added

- **Pixel-exact screenshots (opt-in).** A second capture engine that uses the
  Screen Capture API to photograph this tab's real composited pixels and crop
  the rect out arithmetically. Because nothing is re-rendered, it cannot
  mis-frame, and it captures what html2canvas fundamentally cannot: canvas and
  WebGL, video, cross-origin iframes, `backdrop-filter`, and any CSS the
  cloner doesn't implement. One permission prompt per session, offered on the
  capture hint bar and in Settings. Chromium desktop only, validated at
  runtime (`displaySurface` + frame aspect ratio) so a tester who shares the
  wrong surface silently falls back rather than getting a confidently wrong
  image. The QA overlay is hidden for the frame, so the scrim and card never
  appear in the shot.
- **Live folder sync.** Pick a QA folder once, name a project and a campaign,
  and every note is written to disk the moment it is saved:

      <chosen folder>/Project X/2026-08-14 smoke/
        REPORT.md        ← the whole campaign, agent-ready, rewritten live
        campaign.json    ← metadata + the note→file index
        notes/0001-checkout-button-dead.md
        screenshots/0001-checkout-button-dead.webp

  Ten projects become ten folders of named campaigns, readable without a
  browser. Editing a note renames its file (no orphans); deleting one removes
  it after the undo window; reloading resumes the same campaign and continues
  the numbering. The folder handle survives across sessions (stored in
  IndexedDB), needing one click to re-grant write access. Chromium desktop
  only — the File System Access API has no equivalent elsewhere; other
  browsers keep using Export.
- **Storage that explains itself.** A usage meter with real numbers (origin
  total, and Qapture's own share), `navigator.storage.persist()` to ask the
  browser to stop evicting the data, and a recovery valve that drops
  screenshots while keeping every finding.
- **Note filters.** Severity and status chips with live counts, a text
  search, and a "this page" toggle over the same single list — so a
  forty-point session can answer "just the red flags" without scrolling.
- **Simple mode.** Hides the Logins and Guide tabs for testers who were handed
  a link and only need to capture, review and export.
- **Minimized capture.** A small box next to the selection instead of the full
  card: type, hit Enter, move on. The screenshot and location are still
  captured; one click expands to the full card for a single note, and the
  preference is remembered.

### Changed

- **Screenshots are stored as WebP (quality 0.92) and capped at 1800px on the
  long edge**, falling back to PNG where WebP isn't supported. Typical notes
  shrink by roughly an order of magnitude, which is the direct fix for testers
  on deployed betas hitting "storage full". Export filenames and the
  `notes.md` reference both follow the blob's real type, from one shared
  helper, so an image link can never point at the wrong extension.
- **The "Storage full" toast now says what happened and offers a way out**
  (Export) instead of dead-ending, and a warning now fires at 70% of quota
  rather than only at the moment a write fails.
- `idb.ts` gained `getMeta`/`setMeta`/`deleteMeta` over the existing `meta`
  store (v2 schema, no migration) — a directory handle is a structured-
  cloneable object, so localStorage cannot hold it.
- The note list no longer renders a stray UA bullet beside every card: the
  widget's stylesheet now resets `ul`/`ol` (scoped to the shadow root, so the
  host page is untouched).

### Tests

- New **`npm run capture-accuracy-test`** — a real-Chrome test that answers
  "is the screenshot the region I selected?" numerically. It captures a
  rectangle straddling a colour boundary and converts the colour split into a
  pixel offset, across three fixtures: a scrolled page, a sticky header, and a
  scrolled `overflow:auto` container. It is deliberately discriminating —
  running it against 0.3.1 reports the sticky case as misaligned by 20px,
  which is how the root cause above was found. Not part of `npm run verify`
  (which stays browser-free); run it alongside `npm run browser-test`.
- New `fs-sync-smoke` drives the whole folder-sync flow against an in-memory
  fake of the File System Access API and asserts the resulting tree: path
  segments, filenames, the campaign index, REPORT.md content, rename-on-edit
  cleanup, numbering across a reload, and delete. Added to `npm run verify`.
- `capture-timeout-smoke` gained coverage for the shared screenshot-extension
  helper that keeps `notes.md` links and ZIP filenames in agreement.
- The scroll-lock regression test in `smoke` now asserts the lock's ref-count
  *and* that it never mutates layout — the property whose absence caused the
  screenshot bug.

## [0.3.1] — 2026-07-28

Two real bugs found within hours of 0.3.0 shipping, by actually installing it
into a live project rather than only the playground.

### Fixed

- **The capture-mode annotation card could render partially off-screen with
  no way to reach it.** Its above/below placement guessed a fixed ~220px
  card height to decide which side had room; the card has grown well past
  that since (severity chips, forensics, screenshot preview), so the guess
  was routinely wrong, and the card had no internal scroll of its own — with
  page scroll locked during capture, the Save button could be genuinely
  unreachable. Fixed two ways: the placement now picks whichever side
  (above/below the selected element) has more room instead of guessing a
  height, and — independent of that heuristic ever being right — the card is
  now capped to whatever room is actually available and scrolls internally,
  so no part of it can ever be stuck beyond both the viewport and the page's
  own (locked) scroll.
- **A bilingual field silently missing its Arabic translation had no
  signal at all.** `QaBilingual` (`journey[].steps[].what`/`expect`,
  `credentials[].hint`, etc.) accepts a plain string or an `{en}`-only
  object as a language-neutral fallback — correct for a project that never
  uses Arabic, but silent and easy to miss in a bilingual one, where it just
  reads as "this text was never translated" to whoever switches the widget
  to Arabic. `validateConfig` now detects when a config clearly supports
  Arabic elsewhere (`loginField.ar`, a journey role, a credential's
  `roleAr`/`hint.ar`) and, only then, warns with the exact list of fields
  still missing their `ar` half. Silent for English-only configs — nothing
  to act on there.



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
