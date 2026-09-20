# Changelog

All notable changes to `qapture2` are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.10.0] "Own Camera" — 2026-09-20

The browser was never going to stop asking. So the camera moved out of it.

### Added

- **`npx qapture2 shots` — real screenshots that never prompt.** A loopback
  server that drives `/usr/sbin/screencapture`, the binary behind Cmd+Shift+4.
  Leave it running next to your dev server and every capture is a real
  photograph, in any browser, with no permission dialog and no OS capture
  pipeline left warm between shots.

  This is the fix for "my laptop gets hot and it feels like it is recording
  continuously". It was not a leak — the stream really was stopped every time —
  it was `getDisplayMedia` working as designed. That API prompts on **every**
  call, deliberately and unconditionally, and each prompt restarts the capture
  pipeline. Qapture already asked as rarely as it honestly could (one grant per
  screenful, held until the page moved). The only move left was to stop asking
  the browser.

  macOS asks your terminal for Screen Recording permission once. Never again.

  The widget finds the helper by itself and prefers it over everything else.
  Nothing to switch on in Settings, because there is nothing to opt into: with
  no prompt and no battery cost, there is no trade to offer you. The Settings
  section says so instead of showing a button that would do nothing.

  Security: loopback-only bind, an origin allowlist (loopback dev servers by
  default, anything else named with `--allow`), refusal with **no CORS headers**
  for everyone else so the browser blocks it before the page reads a reply,
  rectangle validation, and the temp file unlinked before the response is
  written. `SECURITY.md` has the full model, and
  `scripts/shot-server-smoke.mjs` holds it to it as part of `npm run verify`.

- **`shotPort` config key**, for when 7017 is taken.

### Changed

- **Bug / Design / Enhance is visible to everyone.** The chips in the capture
  card, and the 1/2/3 shortcuts, were behind developer mode. The reasoning was
  sound — a client cannot grade their own complaint — but it hid the tags from
  the person who *can*: the owner testing their own app, who then re-tagged
  every note afterwards from the list. The row has a default already selected,
  so anyone who does not care can still ignore it and file a `bug`. The
  quick-note form has shown the same row to everyone since 0.4; capture now
  agrees with it.

- **Exports are named after the project.** `qa-notes-2026-09-20.zip` is now
  `ibn-sina-erp-qa-2026-09-20-1432.zip`, from `preamble.projectName` plus the
  time. Both facts needed to identify an archive were already known and thrown
  away, so a second export in one day landed as `… (1).zip` and whoever opened
  it had to guess which app it came from. The name suggested in the dialog and
  the name the file actually gets now come from one function — they were two
  separate `qa-notes-<date>` literals in two files, which is how they could
  disagree at all.

- **Calibration is measured once a session, not once a capture.** On the native
  path the marker-card flash is cached against the window's geometry and only
  re-measured when the window actually moves, resizes, zooms or changes display.

- **A held still is no longer reused on the native path.** Reuse only ever
  existed to dodge a permission prompt. With no prompt, a fresh photograph is
  strictly more truthful and costs about the same.

### Removed

- **`src/defaults.ts`.** It exported a `DEFAULT_CONFIG` that nothing imported —
  `schema.ts` carries its own defaults table and says so in a comment. Two
  tables that had to agree, one of which was never read.

- Dead exports: `walkShallow`, `fileExists`, `voiceSupported`,
  `isContextCaptureInstalled`, `getFsSyncRootName`, `getExactCaptureMode` (and
  the `lastMode` it read). `intersectViewport`, `isCoarsePointer`,
  `toRenderableColor`, `neutralizeColorFunctions`, `hasUnsupportedColor` and
  `STR` are still there but no longer exported — they were only ever used
  inside their own files.

- **`docs/V03-CONTRACT.md` and `docs/V03-BUILD-PROMPT.md`**, which described a
  version six releases old.

- **Five stacked "What's new in v0.x" sections and a "Breaking Changes"
  section from the README.** A changelog pasted into the front door, describing
  releases nobody installs any more. That is what this file is for. The README
  now describes what the tool is today, and is 137 lines shorter for it.

### Fixed

- `qapture shots` crashed at startup before it ever listened: `init.ts` imports
  `node:process` as a namespace, which is sealed, and `addListener` writes a
  counter onto whatever object it is handed. Signal handlers now attach to the
  real `process`.

- The README's `QaConfig` table was shifted by a cell: `hotkey` had no
  description and `captureHotkey` carried `hotkey`'s.

- `docs/ARCHITECTURE.md`'s module map listed `TestAlongHud.tsx` (renamed to
  `WalkHud.tsx` several releases ago) and `defaults.ts`, and marked files "new"
  that had been there for four versions. Replaced with a map grouped by what a
  file is *for*, which has far less to go stale — the per-file detail lives in
  the file headers, where it cannot drift from the code.

## [0.9.1] "One Box" — 2026-09-05

0.9.0 replaced one text box with four. That was wrong, and this puts it back.

### Changed

- **One box again.** "What happened?", "What should have happened?", "Why does
  it matter?" and "Suggested fix" are gone from the capture card. There is a
  text box, and you write in it.

  The reasoning for splitting them was real — an agent handed a report with no
  stated expectation picks a reading and commits to it, and that is measurable.
  The mistake was making it the *tester's* problem to solve. A person looking at
  something broken types one sentence; answering them with three more empty
  boxes turns a feedback tool into paperwork, and paperwork is how a feedback
  tool stops getting used. A tool nobody opens files no reports at all, which
  beats every argument about how well-structured those reports would have been.

  Where a point is genuinely ambiguous, the export now tells the agent to **ask**
  rather than guess — one question costs a message, and it costs the tester
  nothing.
- **`### Expected` is written only when somebody stated one.** It used to be
  emitted on every point with a placeholder saying it was missing. With no box
  asking for it, that placeholder would appear on every single point — noise,
  burying the sentence that matters. The heading stays for the cases that have
  one, because an agent that cannot tell the symptom from the goal fixes the
  wrong one.
- **Voice input is hidden.** The code is still there and still works; nothing
  renders it. It was another control on a card that needed fewer.

### Removed

- **The storage panel in Settings** — a percentage bar, a "keep my notes"
  button, and a way to drop every screenshot. It answered a question nobody
  standing in front of this widget was asking, and the two controls that
  mattered are better automatic than offered: notes already mirror to disk when
  a folder is open, and a quota that is genuinely full already says so at the
  moment it bites, with Export attached to the message.

## [0.9.0] "Client Mode" — 2026-09-05

The default user of this widget is a client, not an engineer. This release is
mostly the consequences of taking that seriously.

Several decisions below are settled by measurement rather than taste — see
*What Makes a Good Bug Report for an AI Agent?* (arXiv 2607.07593), which tests
repair agents against reports with pieces removed.

### Added

- **Client mode, and it is the default.** Severity chips, the CSS selector, the
  journey step and the suggested-fix box are gone from the capture card unless
  developer mode is switched on in Settings. None of it stops being *captured* —
  only the *asking* stops. Asking a client to grade their own complaint is a
  question they cannot answer and should not have to; being shown a selector is
  how a feedback tool starts feeling like something you need training for.
- **Two labelled questions instead of one box**: *What happened?* and *What
  should have happened?*, with an optional *Why does it matter?*. Kept apart on
  purpose. An agent handed a report with no stated expectation does not stop and
  ask the way a person would — it picks a reading and commits to it. Removing
  expected behaviour made agents commit to wrong interpretations outright.
- The headings survive into `notes.md` as `### Observed` / `### Expected`.
  Deleting just the section headers, keeping every word, costs 10–30 points of
  solve rate — agents stop being able to tell the symptom from the goal.
- **Expected is written even when empty**, saying outright that it was not
  given, rather than leaving a hole an agent will quietly fill in.
- **The checklist now asserts the expectation, not the complaint.** "The total
  is wrong" cannot be ticked by anybody. "The total should include delivery"
  can.
- **Voice input on every field.** The most valuable field is the one people
  leave empty, and they leave it empty because typing is work — more so in
  Arabic than English. Browser dictation, nothing uploaded by us, `ar-IQ` for
  Arabic testers, and rendered not at all where unsupported rather than as a
  dead button.
- **Source localisation.** The component and file that rendered the element are
  read off React's own fibre and printed in the report. Naming the file is one
  of the largest single wins available; without it agents apply correct fixes to
  the wrong file. Omitted rather than guessed when the build will not say.
- **`repro/check-N.spec.ts`** — a Playwright *draft* per point, carrying the
  URL, a selector verified against the live DOM, and the observed and expected
  behaviour quoted in place. Executable reproductions help; prose steps measure
  as no help at all. They are drafts because most points do not want one: the
  agent is told to finish the behavioural ones and delete the cosmetic ones.
  That judgement is not the tester's and they were not asked for it.
- **Diagnostics, in Settings.** One button that checks the things that have
  actually broken: which engine will take the next shot, whether this page can
  encode a screenshot at all, how many cross-origin images will come out blank,
  page weight against the freeze threshold, whether the screenshot library can
  even be fetched, storage, dictation, and https. Every probe is a post-mortem
  of something that has already cost an afternoon.
- **A visible fault log**, also in Settings, with copy and clear. Failures used
  to go only to `console.warn` — so "the screenshot didn't work" was all that
  ever reached anybody, while the browser had said
  `SecurityError: Tainted canvases may not be exported`.
- **An update check.** Three apps sat on 0.7.x for months while every screenshot
  on an image-heavy page failed and the fix was already published. `^0.7.2` will
  never reach 0.8 on its own, and `npm update` reports success while changing
  nothing, so the exact command is spelled out. Settings only — once a day,
  cached, silent on failure. A client cannot upgrade an npm package and has no
  business being interrupted about one.
- **Duplicate detection.** A real export contained six notes reading "delete
  this". Same words on the same element is flagged as a repeat; same words on a
  *different* element is not, because those are two real requests. Flagged,
  never blocked — being wrong here would mean silently eating a bug report.
- **`beta: true`** puts a small mark on the button, for shipping into a live
  client site during a review period. A client who knows a tool is new forgives
  a rough edge and tells you; one who thought it was finished quietly stops
  using it. A label, not a banner.

### Changed

- **Arabic follows the page.** `dir="rtl"` or `lang="ar"` on the document, or
  failing that the reader's own browser, now selects Arabic without anyone
  setting `rtl` in config. An English page is never flipped under an Arabic
  speaker who expects to read it in English.
- **`notes.md` got much shorter.** Recorded steps, console, network,
  environment and element forensics moved to `context/point-N.md`, pointed at
  rather than pasted in. Report length correlates *negatively* with the right
  thing being fixed (odds ratio 0.49): the two sentences that matter were being
  buried under a wall of evidence. Nothing was discarded.
- **A re-drawn screenshot now says so in the export.** An agent that does not
  know it is looking at a re-drawing reads a blank chart as the bug.
- A suggested fix, where a developer writes one, is labelled a suggestion all
  the way through and comes with a note to weigh it rather than follow it. It is
  the most powerful field in a report and the most dangerous.

## [0.8.3] "One Prompt Per Screenful" — 2026-09-04

### Changed

- **One permission prompt now covers a burst of notes, not one note each.**
  0.8.2 made real photographs the default, which fixed the screenshots and
  introduced a new irritation: the browser asked to share the tab every single
  time. Filing six notes about one screen meant answering six prompts to
  photograph the same pixels.

  To be clear about what cannot be done: a browser will **never** remember
  screen-share permission. `getDisplayMedia` prompts on every call, by design,
  and no flag, origin setting or earlier grant changes it — that is the
  security model, not a gap in it. The only honest lever is asking fewer times.

  So the still taken when capture mode opens is now kept after a note is filed
  and reused by the next capture, as long as it is demonstrably still a
  truthful picture of the screen: same scroll position, same viewport size,
  same route, and under ninety seconds old. Any one of those failing takes a
  fresh photograph, and costs one prompt. A tester writing several notes about
  one screen is not moving the page, so in practice they now answer once.

  Correctness is not traded for it. A screenshot of pixels that are no longer
  on screen is worse than no screenshot, because nobody double-checks one that
  looks fine — so every reuse is re-checked against all four conditions, and
  any doubt re-photographs. The age cap is the backstop for what those checks
  cannot see: a live feed repainting, a countdown, new rows arriving.

  The held still is released about a hundred seconds after the last note, so a
  viewport-sized bitmap is not left sitting in memory once the burst is over.

## [0.8.2] "Nothing To Photograph With" — 2026-09-04

### Fixed

- **Screenshots failed outright on any page holding a cross-origin image.** The
  redraw engine was configured with `allowTaint: true`, which tells html2canvas
  to draw images it could not fetch with CORS. Drawing them *works* — and taints
  the canvas, so the encode that follows throws `SecurityError` and the whole
  screenshot is lost. One map tile, news thumbnail, avatar, ad or CDN logo was
  enough. That is why it failed every time for one tester and never for another:
  it was not flaky, it was a property of the page. `allowTaint` is now off, so
  html2canvas skips what it cannot read — those images come out blank and
  everything else comes out right. A screenshot with two grey rectangles in it
  is worth having; a `SecurityError` is not.
- **The redraw engine is now refused on a page big enough to lock the tab.**
  html2canvas clones the whole document and parses it synchronously, in one long
  task, so the 10-second timeout that has guarded it since 0.3 could never fire —
  a `setTimeout` cannot run while that task is running, and neither can React.
  Past 6000 elements the capture is declined *before it starts*, with the one
  control that solves it: photograph the page instead. On exactly those pages the
  redraw was never going to be right anyway — maps, WebGL views and `<canvas>`
  charts all come out blank — so this is not a consolation prize.
- The `import('html2canvas')` now sits inside the timeout budget. A chunk that
  never arrived (a strict `script-src`, a CDN that does not answer) used to be a
  spinner that never stopped.
- `canvas.toBlob` on a tainted canvas can no longer escape as a rejection.

### Changed

- **Real photographs are on by default.** This is a reversal. A new tester used
  to get the redraw engine, and the redraw engine is the one that fails: slow on
  a big page, blank where the page is a map or a chart, dead on arrival next to a
  cross-origin image. Every "the screenshot didn't work" report came from someone
  who had never opened Settings — which is everyone, the first time. The
  photograph engine has none of those failure modes; its only cost is that the
  browser asks to share the tab once per capture. A question answered in a click
  beats a screenshot that does not arrive. Declining still falls back to the
  redraw, and anyone who had already turned it off stays off.

### Added

- **Exporting puts your points on test.** Hitting Export no longer just hands
  over a file — it marks those points as sent, and writes the archive as an
  agreement about what finished looks like:
  - `verify.md`, a new file in the ZIP: one unticked box per point, with what to
    check and where. Short on purpose, so it can be handed back and diffed.
  - **"You Are Being Graded On This"** near the top of the preamble, and a
    **"Check N — how this will be graded"** block under every point, phrasing the
    question in the same words the tester will be asked.
  - The agent is told to tick a box only when the check holds on a fresh load,
    and to leave it unticked *with a reason* otherwise — an unticked box with a
    reason is a good answer; a ticked box that does not hold up is the only bad
    one, because it costs the tester the trip to find out.
- **"Check the N fixes"** in the notes panel, with a **Sent** filter chip beside
  it. It walks you back through exactly what the last export sent, one spot at a
  time, and asks about each. Anything you say is still wrong becomes round two,
  with your new words attached. A point you pass is settled and does not come
  back on the next export.
- `?qa=walk:verify` starts that walk from a link, so an agent can hand back the
  work and the way to check it in the same message.

## [0.8.1] "One Prompt, Many Notes" — 2026-09-04

### Added

- **"Save + next"** on the annotation card (⌘/Ctrl + **Shift** + Enter). Files
  the note and returns you to framing **the same photograph**, instead of
  closing capture mode.

  This exists because of a dead end worth writing down: Safari's per-site
  **Screen Sharing** setting offers only *Ask* and *Deny* — there is no
  *Allow*, for any site. So a page cannot be pre-authorised to photograph the
  screen, and 0.8.0's one-frame grant means Safari asks on **every** capture.
  The prompt cannot be removed. It can only be needed less often.

  One screen usually has more than one thing wrong with it, and one grant
  already buys a full-viewport still — so filing three bugs about one screen
  now costs one prompt instead of three, with nothing recording in between.
  (Camera and microphone grants *do* persist for 30 days in Safari; screen
  sharing deliberately does not. Don't go looking for that setting again.)

- The hint bar says **"N saved from this screenshot"** while you are reusing
  one, so it is clear why you weren't asked for permission again — and that
  you are still marking up the screen as it was, not as it is now.

### Fixed

- "Reselect" left the previous note's engine badge and error state behind; both
  paths now share one reset.

## [0.8.0] "Freeze First" — 2026-09-04

The screenshot is taken **when you open capture mode**, not when you finish
dragging. One frame, then the screen is handed straight back.

### Fixed

- **Safari kept recording the whole session.** The exact engine held its
  `getDisplayMedia` stream open for as long as the tab was open — one prompt
  per session instead of one per note, which seemed like a kindness. Safari
  and Firefox cannot share a single tab, only a window or a whole screen, so
  what that bought was the OS screen-sharing indicator lit permanently and the
  capture pipeline running at 10fps behind every page. Reported as *"it keeps
  on screen recording and drains the battery."*

  `freezeViewport()` now acquires the stream, takes one frame, and stops the
  track before it returns — about a third of a second. Nothing is left
  running between captures. The cost is a share prompt per capture rather
  than per session; there is no browser API that photographs the screen
  without asking, so that trade is the honest one.

- **The same click gave a photograph one time and a redraw the next.** This is
  the one that mattered, and it was never a single bug — it was the design.
  Two engines of very different fidelity ('exact' photographs real pixels,
  'dom' re-renders a clone with html2canvas and cannot reproduce a `<canvas>`,
  WebGL, video, or a cross-origin iframe at all), swapped **silently**,
  per capture, on conditions the tester could not see: the stream had died
  because they pressed "Stop sharing", the window had moved and the Safari
  calibration had gone stale, an aspect check had failed, a frame had dropped.
  Every previous release fixed the *redraw* — sticky headers, scrollbar width,
  off-screen elements, oklch colours. Each of those was a real fix, and none
  of them could ever stop the swap, because a reconstruction is not a
  photograph and no amount of work on it makes it one.

  Taking the picture up front settles the question before the tester frames
  anything: a still is either held or it is not. `scripts/freeze-capture-test.mjs`
  asserts the structure — one grant per capture, zero live tracks while
  framing, and a crop that stays the colour the page *was* after the live page
  is repainted underneath it.

- **What you drag over is now what you get.** The still is displayed under the
  capture scrim while you frame, so a page that animates can no longer move
  between the moment you point at something and the moment it is cropped.
  A hover state, an open dropdown or a tooltip also survives being framed —
  previously, moving the mouse to start a drag dismissed the very thing being
  reported.

- **A resize mid-capture is refused rather than guessed.** The still belongs to
  the viewport it was taken in; if the window changes size before the crop, the
  rect and the photograph are no longer in the same coordinate system, so the
  capture falls back to a redraw instead of returning a confidently wrong image.

- **`QaContext.tsx` was invisible to `grep`.** `pageSignature()` used a literal
  NUL byte as its field separator, which makes every tool that sniffs for
  binary skip the entire 2,400-line file *without saying so* — including a
  search for the very functions this release rewrote. Same separator, built
  with `String.fromCharCode(0)` instead of typed into the source.

### Changed

- Turning on pixel-exact shots in Settings no longer prompts. Arming is free;
  the first capture asks. Flipping a toggle should not put a share prompt (and,
  in Safari, a calibration flash) on screen before you have asked to capture
  anything.
- The "that's a redraw — photograph it instead" offer under a preview now takes
  the photograph immediately and re-shoots the same selection, rather than only
  arming the next capture.
- `exact_unsupported` no longer claims Chromium is required. Safari and Firefox
  have worked since 0.7.6; the real limit is desktop versus phone.

### Removed

- `startExactCapture` / `stopExactCapture` / `grabExactRegion`, and with them
  the environment signature and mid-session re-calibration. All of it existed
  to keep a long-lived stream honest, and there is no longer a long-lived
  stream. Replaced by `freezeViewport` / `cropFrozenRegion` /
  `releaseFrozenFrame`.
- Re-testing a stored note now always redraws. It used to use the exact engine
  if a stream happened to be live, which made two runs of the same comparison
  incomparable.

## [0.7.9] "Take Me There" — 2026-08-29

### Fixed

- **"Take me there" did not take you there.** `walkNavigate()` was
  `history.pushState({}, '', target)` followed by a hand-dispatched
  `popstate`, on the assumption that every SPA router listens for popstate.
  They do not listen for *that* one:
    - Next's App Router renders from the route tree it keeps in
      `history.state` — and `pushState({}, …)` had just erased it, so the best
      case was Next re-rendering the page you were already on;
    - React Router's history keeps its position index in `history.state` too,
      and a wiped index is ignored rather than followed.

  So the address bar moved and the app stood still. Reported from a real app
  as *"I said take me there and it didn't, it just selected something on the
  same page, even though the note is in Settings."*

  The soft navigation is still tried first — it is genuinely nicer when it
  works, with no reload and no lost scroll — but it now has to **prove** it
  happened: the existing `history.state` is preserved rather than wiped, and
  700ms later, if the page is showing exactly what it was showing before, the
  navigation that always works runs instead. An app that redirects you
  somewhere of its own accord is left alone.

- **The button hid its own escape hatch.** It only rendered when
  `stop.path !== window.location.pathname`, and after a failed soft navigation
  those are equal — so the control vanished at the exact moment it had failed,
  taking the manual reload button beside it. The current path is now tracked
  as it changes rather than read once per render, and the button shows
  "Taking you there…" while the navigation is being decided, so a press is
  never silent.

- **A notes walk ended itself on arrival.** The HUD exits the walk when it has
  no stops, which is right for an emptied list — but a notes walk builds its
  stops from IndexedDB, and on a cold page load the answer has not come back
  yet. "No stops" meant "not yet", not "nothing left". This never showed
  before because "Take me there" never actually reloaded anything; the moment
  it did, every cross-page step landed the tester on the right page with the
  walkthrough gone.

- **"Locate on page" pointed at the wrong page.** It ran the note's stored
  selector against whatever page the tester was on, never checking where the
  note was filed. A selector like `button.btn-primary` exists on half the
  pages of an app, so the flash landed on a real element that was simply the
  wrong one — which is worse than finding nothing, because it looks like it
  worked. A note belonging to another page now says so and offers to go there
  instead.

### Added

- `npm run walk-navigation-test` — and it does not trust the URL. The old
  assertion for this lived in walk-test, said "the page moved (/ → /checkout)"
  and only ever read `window.location.pathname`, which `pushState` changes on
  its own; it passed against a feature that had never worked. The new test
  plants a value on `window` before pressing the button, because only a real
  page load destroys it. Three cases: an app that ignores the synthetic
  popstate must still arrive for real; an app whose router does respond must
  **not** be reloaded on top of its own navigation; and a note from another
  page must refuse to hunt for its selector here.

## [0.7.8] "Round Two" — 2026-08-28

### Fixed

- **Picking an element captured only part of it — the real cause, found at
  last.** `clipToPaintedArea()`, added in 0.7.3 to stop captures chasing the
  empty part of a scroll container, walked its ancestor loop all the way
  through `<html>`. `<html>` is the one element where that arithmetic cannot
  work: `getBoundingClientRect()` describes the whole *document* (on a page
  scrolled to 1000, its `top` is -1000) while `clientHeight` reports the
  *viewport* (900). Mixing them built a clip band pinned, in document space,
  to the first screenful of the page, and every picked element crossing the
  bottom of that band was silently cut to it — at any scroll position, because
  the band moved with the document rather than with the reader.

  It only fired when the root's computed overflow was not `visible`, and a
  bare `html { overflow-x: hidden }` is enough: CSS promotes the *other* axis
  from `visible` to `auto` as soon as one axis is not `visible`. That rule is
  in the base stylesheet of more or less every Tailwind/Next app, and it was
  in none of the fixtures — which is exactly why the suite stayed green while
  the field kept reporting "it only captured part of the part I picked".

  Measured on a 1280×900 viewport: an 1800px hero at the top of the page came
  back 900px (50%), a 700px card came back 400px (57%).

  The root is now handled where its overflow actually lands — on the viewport,
  whose box is simply `0,0,vw,vh`, with no document-space arithmetic to get
  wrong — and only `hidden`/`clip` clips there, because `auto`/`scroll` means
  the page scrolls and the DOM engine can legitimately draw below the fold.
  `<body>` follows CSS overflow propagation: it clips as a box in its own
  right only when the root did not take its overflow away.

  Every fixture in `element-capture-test` now runs under
  `html { overflow-x: hidden }`, so the suite tests the page shape real apps
  actually have. A new case pins the other side of it: an element wider than a
  root that forbids horizontal overflow *should* clip to the viewport, because
  there is no scroll to reach the rest with — so the fix cannot be re-broken
  by simply deleting the viewport clip.

### Added

- **A follow-up round on a note.** The re-test already re-shot the target and
  stored the new image beside the original; it could not say *why* what is on
  screen is still wrong. A note in the re-test queue now takes a second piece
  of text — "what happened this time" — kept in its own field rather than
  written over the description, so the original ask survives as the record of
  what was wanted while the follow-up carries what came back.

  The export says so outright: a point with a round 2 is marked as having been
  worked on once already and missed, the round-2 text is named as the current
  ask, and the agent is told to work out what was misunderstood the first time
  rather than simply try the same reading again more carefully. The session
  summary counts them.

- **"Keep only these" on the re-test list.** A campaign ends with twenty notes
  of which five came back wrong, and what gets sent round again should be
  those five — otherwise the agent re-reads fifteen findings that are already
  done. Offered only while the re-test filter is on, where "these" has an
  unambiguous referent; asks before deleting; and goes through the same bulk
  delete as everything else, so one undo brings it all back.

### Changed

- **The Guide tab is hidden.** The panel's job is capture and the log, and a
  third tab nobody is using yet costs a third of the tab bar in every session.
  Nothing was removed — `GuideSection`, its strings, its state and the
  `?qa=walk` deep links are all still here and still type-checked — so it
  comes back by flipping `GUIDE_TAB_ENABLED` in the new `src/lib/features.ts`.
  A tester whose last-used tab was the Guide lands on the notes rather than on
  an empty panel.

## [0.7.7] "Three Kinds of Work" — 2026-08-22

### Changed

- **Bug / Question / Polish → Bug / Design / Enhance.** The old three were
  moods; the new three are three different *kinds of work* — fix it, restyle
  it, build it — which is what an agent actually needs to pick a posture. The
  field is no longer labelled "Severity" (none of them are severities) but
  **"What is this?"**. Labels stay in English in both languages, so what the
  tester picks is literally what the agent reads.

  Notes already saved as `question` / `polish` are translated on load
  (`question → enhance`, `polish → design`), so an in-flight campaign doesn't
  quietly re-file itself into the wrong bucket.

- **The export now tells the agent what each tag asks of it.** Previously the
  tag was decoration: a line in the note and a tally in the report, with
  nothing saying what to do differently. `## What the tags mean` now carries
  the rules:

  - **Bug** — find the *root cause*, and **state it in one plain sentence
    before changing anything**. If you can't write that sentence you haven't
    found it. Crucially: the cause is not always in the code. If the code does
    exactly what it was asked and the result is still wrong, then nothing is
    broken — what was *asked for* and what was *meant* didn't match, and that
    mismatch is the bug. If the note already says what was meant, do that;
    don't stop to ask a question that's already been answered.
  - **Design** — functionality is fine and not in question. Don't hunt for a
    fault; there isn't one. Think about layout, hierarchy, wording, states.
  - **Enhance** — a new idea, had while using the app. Plan it properly
    against the surrounding code, then **build it** — no approval gate. Push
    back only for a real reason, and propose the alternative.
  - **When the tag and the words disagree, the words win** — and say which
    lane you took. A note phrased as a question gets *answered*, not acted on.

- **The first-run greeting is one line instead of a card.** It was three
  bullets and a "Got it" button, met again in every fresh browser profile.
  Now: one sentence, a dismiss cross, and it removes itself as soon as the
  first note exists — by then it has either worked or been ignored. The test
  caps its length, so it can't grow back a bullet at a time.

## [0.7.6] "Real Pixels Anywhere" — 2026-08-22

### Added

- **Real screenshots in Safari and Firefox.** Until now the pixel-exact engine
  was Chromium-only, because it relies on `preferCurrentTab` to capture *this
  tab*. Safari has no tab capture at all — so Safari testers only ever got
  html2canvas redraws, which render an inline-SVG chart as bare outlines and a
  `<canvas>` as a blank box.

  Safari and Firefox *can* share a window or a screen, and that frame contains
  the page — along with a toolbar, and possibly the whole desktop. The engine
  now accepts such a grant and works out where the page sits inside it.

  **It measures rather than calculates, and that is the whole design.** The
  arithmetic route — `outerHeight - innerHeight` for the toolbar, `screenX`
  for the window, `devicePixelRatio` for Retina — is a stack of guesses, each
  quietly wrong in some real configuration (a bookmarks bar, a scaled display,
  a second monitor). Quietly wrong here means a screenshot confidently showing
  the wrong pixels, which is worse than none: it looks fine, so nobody checks
  it, and the bug report points at innocent code.

  Instead, on the first capture the page is covered for a fifth of a second by
  an opaque card carrying four known colours at four known corners. The engine
  photographs that, finds the colours, and solves for scale and origin
  directly. Toolbar height, pixel ratio and monitor layout cancel out because
  none of them are ever used. Two corners solve the mapping; the other two are
  spent checking it. The measurement is re-taken whenever the window moves,
  resizes, zooms or changes display.

  **A calibration that cannot be verified is refused** — the grant is dropped
  and the session falls back to redrawing. Nine ways of being untrustworthy
  are covered by `npm run frame-calibration-smoke`, which drives the solver
  with synthetic frames whose right answer is known: it recovers a 2× Retina
  scale, a 174px toolbar offset and a window's position on a 1920×1080 desktop
  having been told none of them, ignores a decoy block of marker-coloured
  pixels, and returns null for every frame it cannot verify.

  Chromium is unaffected: a tab share still takes the direct path, still
  measured at 0.0px by `npm run capture-accuracy-test`.

  **Verified by construction, not end-to-end.** The solver is exercised
  against synthetic frames, and the wiring is typechecked and covered by the
  existing suites — but Safari cannot be driven by this project's test harness,
  so the real hand-off (Safari's picker → a window frame → a correct crop) has
  not been observed by machine. Treat the first Safari capture as the test.

## [0.7.5] "Move It" — 2026-08-22

### Changed

- **The launcher bubble can now be dragged with a mouse, not just a finger.**
  Press it, move more than ~8px, drop it anywhere; the spot is remembered and
  restored next time. A drag never opens the panel, and a plain click still
  does.

  Dragging has existed since 0.3 but was gated behind a coarse-pointer check —
  touch only. That was backwards. The bubble parks itself bottom-left, which on
  a desktop app is where a sidebar, a language switcher or a "leave a note"
  button lives, so the one pointer that *couldn't* move the widget was the one
  most likely to be blocked by it. Reported as "sometimes I need the place
  that's behind it".

  Right- and middle-click still behave as clicks rather than starting a drag,
  and an unmoved bubble renders exactly where it always did.

## [0.7.4] "Say Which" — 2026-08-21

No capture behaviour changes. This release closes the gap that kept a real
limitation looking like a bug.

### Changed

- **On Safari and Firefox the widget now says why a screenshot looks drawn.**
  0.7.3 added a "This is a redraw of the page, not a real photo" line with a
  one-tap upgrade to the pixel-exact engine — but that engine needs
  `preferCurrentTab`, which only Chromium honours, so on every other browser
  the line was hidden and nothing was shown at all.

  That silence was the actual problem. A tester watching an inline-SVG chart
  come back as bare outlines has no way to know the tool is *re-drawing* their
  page rather than photographing it, so they file it as a bug, get a fix that
  cannot help, and file it again. The card now names the limit and names the
  way out: open the app in Chrome, Edge or Brave for true screenshots.

### Added

- `npm run svg-vars-test` — inline SVG whose fills come from CSS custom
  properties, including `color-mix(in srgb, black N%, var(--token))`, which is
  how a themed chart shades a surface. Both survive a capture today; the test
  exists so they keep surviving, because "the chart captured as hollow
  outlines" is a failure that looks like a rendering opinion rather than a bug.

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
