---
name: qapture
description: >
  Activated when the user provides a `qa-notes-*.zip` file exported from
  Qapture. Reads the preamble block in `notes.md` (project context, stack, run
  commands, dev/test login credentials, red-zone coverage report, and
  invariants), flags any uncovered RED risk zones before acting, then
  triages every `## Point N` as a batch — clustering points that share a
  root cause via their runtime-context evidence — before orchestrating
  Sonnet subagents (one per point/cluster, parallelized across disjoint
  files) to reproduce each issue live, fix it, and self-verify. Finally
  grades coverage against the red zones and reports, including any adjacent
  improvements noticed along the way. Also activates on a single point
  pasted directly via Qapture's "Copy as agent prompt" (no ZIP, no preamble
  — just one point).

  **No AI is bundled in Qapture — YOU are the AI reading these artifacts.**
  Qapture is a 100% client-side, keyless, network-free capture widget.
triggers:
  - qa-notes-*.zip
---

# Qapture — Agent Skill

> **Core principle:** Qapture ships zero AI. No model, no API keys, no network
> calls. The CLI is a plain deterministic scaffolder. **You** — the coding agent
> reading this skill — are the AI. The developer used Qapture to capture
> annotated screenshots + notes from their live app; your job is to act on them.

---

## What Is Qapture?

Qapture is a drop-in in-browser widget (Shadow DOM, keyless, no telemetry).
Testers annotate the live app: click an element or draw a region, add a note,
and the widget captures a screenshot automatically. When done, they export a
`qa-notes-*.zip`. That ZIP is the hand-off to you.

---

## Working Model — You're the Brain, Subagents Are the Muscle

For anything past a single trivial point, don't work through the ZIP
point-by-point yourself. Orchestrate:

- **You cluster and plan; subagents reproduce, fix, and self-verify.** You
  read every point first (Step 3), decide what's really one bug wearing N
  reports, and spawn one subagent per point or cluster to do the actual work.
  You do the fixing yourself only for a single, obviously trivial point where
  spinning up a subagent is pure overhead.
- **Every subagent is Sonnet, pinned explicitly on every single call.** Never
  let a spawned agent inherit whatever model you happen to be running as
  orchestrator — an inherited model silently drifts to whatever you're on,
  and that's the kind of thing nobody notices until the cost or the quality
  looks wrong in hindsight. Pin it every time, no exceptions.
- **Effort is your judgment call per task, not a formula.** A one-line CSS
  fix gets low effort. A bug whose runtime-context evidence (below) doesn't
  cleanly explain the symptom gets high or max — you decide based on how
  ambiguous the root cause actually looks, case by case.
- **Parallelize by file, not by point.** Points/clusters that land in
  disjoint files can run as concurrent subagents safely. Anything that lands
  in the *same* file goes to one agent, or runs serially — never two agents
  editing the same file at once. This is the actual failure mode to guard
  against, not an abstract "be careful."
- **Supervise by reality-checking, not re-reading.** Don't reread every
  subagent's full diff. Do: read exactly what each one's own report claims
  changed, at the file/location it names; always personally open and read
  the diff for anything touching a RED zone, no exceptions, regardless of
  what the subagent reports; and treat the project's own test/verify command
  — run by you, independently, after every subagent lands — as the actual
  gate. A subagent saying "done" is a claim, not a fact.

**Creative suggestions are always welcome; creative *changes* are gated like
everything else, by risk colour (see Risk Zone Reference below).** Noticing a
pattern, an adjacent bug, or a missing feature costs nothing to write down —
put it in a `### Suggestions` section in your final report (Step 5) and never
suppress it for being out of scope. Whether you're allowed to *implement* it
without being asked depends on where it lands:

| Zone | An idea beyond the literal reported point |
| --- | --- |
| **green** | Implement inline, no permission needed — "fixed the label, also fixed 3 nearby with the same casing bug" is fine. |
| **amber** | Implement it, but call it out explicitly in the report — the developer should see at a glance what went beyond what was asked. |
| **red** | Propose only. Write it down, never touch the code. Same rule as everything else in a red zone: no silent business-logic decisions. |

That keeps the upside of a genuinely observant agent — catching the adjacent
bug, proposing the missing feature — without that same latitude becoming the
mechanism for quietly rewriting a payment flow nobody asked you to touch.

---

## ZIP Layout

```
qa-notes-<timestamp>.zip
├── notes.md          ← ALWAYS read this first (see Step 1)
└── screenshots/
    ├── point-1.webp
    ├── point-2.webp
    └── ...
```

### `notes.md` structure

```
[PREAMBLE BLOCK]
  Project name, one-liner, stack, run commands,
  Login Context (dev/test credentials — see security note below),
  Coverage Report (red/amber/green zone checklist),
  Invariants, Additional Context.

---NOTES---

## Point 1
Page: /some/path
Severity: bug            (bug | question | polish — tester's own triage)
Status: open             (open | verified)
Journey step: <lane> → <path>   (present when linked to a journey step)
Selector: #some-element   (or [data-testid="foo"] etc.)
Note: the tester's free-text description of the issue / request

<details>Runtime context at capture — recent console/network events + env snapshot</details>

## Point 2
...
```

Note: a tester may also hand you a **single point directly**, pasted via
Qapture's "Copy as agent prompt" button, with no ZIP and no preamble at all.
Treat it exactly like one `## Point N` section below — skip Steps 1 and 2
(there is no preamble or coverage report to read), and go straight to Step 3.

---

## Step 1 — Read the Preamble First

Before touching any code, open `notes.md` and parse everything **above** the
`---NOTES---` separator. Extract and internalize:

| Section            | What to do                                                            |
| ------------------ | --------------------------------------------------------------------- |
| **Project / Stack** | Understand the framework, router, ORM, and any unusual constraints.  |
| **Run Commands**   | Know how to start the dev server and seed the database.               |
| **Login Context**  | DEV/TEST/SEED credentials only. Use these to log in during verification. **Never log, forward, or commit these values.** |
| **Coverage Report**| List of RED / AMBER / GREEN zones and whether they are covered.       |
| **Invariants**     | Absolute rules you must never violate (e.g. "prices ≥ 0", "checkout requires auth"). |
| **Conventions**    | Codebase naming, file organisation, import rules, validation approach. |

---

## Step 2 — Flag Uncovered RED Zones Before Acting

After reading the preamble, check the Coverage Report for any RED zones that
are **not yet covered** by an annotation in this ZIP.

If uncovered RED zones exist, **report them to the developer first**:

```
⚠️  Uncovered RED zones detected:
  • /checkout/payment — no annotation in this export
  • /seller/payouts  — no annotation in this export

These are money/auth/irreversible flows. Do you want me to proceed with the
covered points only, or will you add annotations for the red zones first?
```

Wait for developer confirmation before proceeding if any RED zone is uncovered.

---

## Step 3 — Triage, Then Act

### 3a. Triage & cluster before touching anything

Read **every** `## Point N` in the ZIP before acting on any of them. Points
that look unrelated on the surface (different pages, different testers, even
different sessions) can share one root cause — check each point's runtime
context (3c below) for a repeated signature: the same failing network URL,
the same status code, the same console error message. Group matches into one
cluster. A cluster gets one fix and N verifications (one per point in it),
not N separate patches that might silently disagree with each other.

Write the plan down as an actual artifact before editing anything — a short
markdown list is enough: each point/cluster, your root-cause hypothesis, the
proposed fix, and its risk zone. This is the thing you hand to subagents in
Step 3b, and the thing a developer can skim to sanity-check your read of the
batch before code starts moving.

### 3b. Decide who does the work

Single trivial point, obviously green-zone, no ambiguity → you can just fix
it. Anything else → spawn a subagent per point or cluster, per the Working
Model above (Sonnet, pinned; effort by your judgment; parallel only across
disjoint files). Hand each subagent its point(s), the relevant preamble
context (stack, conventions, invariants, login), and its risk zone.

### 3c. Read the annotation

- **Page** — the route/URL where the issue was captured.
- **Severity** — `bug` (default), `question`, or `polish`. A `question` may
  not need a code change at all — read the note text before assuming one.
- **Status** — `open` (default) or `verified`. A `verified` point was already
  re-checked by the tester after a previous fix; treat it as lower priority
  unless the note says otherwise.
- **Journey step** — present when the point was captured during the guided
  walkthrough, or auto-linked by route match. Cross-reference it against the
  Coverage Report: a covered RED step usually has one of these attached.
- **Selector** — the CSS selector or aria identifier for the element.
- **Runtime context** (collapsed `<details>` block, when present) — recent
  `console.error`/`console.warn` output, uncaught errors, and failed/slow
  network calls captured in the moments before the tester clicked capture,
  plus an environment snapshot (viewport, language, timezone, page-load time).
  **Read this before assuming a UI-only cause.** "The button does nothing" is
  very often actually a console `TypeError` or a `500` that already happened
  — the evidence for it is right there, not something you have to reproduce
  blind. Query strings in any URL shown here have already been redacted by
  Qapture before export (see `SECURITY.md`); do not assume you're seeing a
  full URL, and never assume request bodies/headers were captured — they
  weren't, by design.
- **Note** — the tester's description of the problem or change request.
- **Forensics** (when present, inside the runtime-context `<details>` block)
  — computed facts about the exact captured element: `contrastFlag`
  (`low`/`ok`), `hasAccessibleName`, `tabReachable`, plus its computed
  styles. This turns "looks fixed" into something checkable: if
  `contrastFlag: low`, the fix isn't done until you can show the new colour
  pair actually clears a 4.5:1 ratio; if `tabReachable: false` on something
  that visually reads as interactive, that's an objective bug independent of
  whatever the tester's note text says. Treat these as acceptance criteria,
  not supplementary trivia.

### 3d. Open the screenshot

Load the screenshot named in that point's **Screenshot** line (
`screenshots/point-N.webp`, or `.png` on browsers without WebP) to visually
confirm what the tester saw.
The screenshot is truth — if the selector doesn't resolve, the screenshot tells
you what element they meant.

### 3e. Locate the code

Use the selector priority chain below to find the relevant source:

| Priority | Selector type                                      | Action                                              |
| -------- | -------------------------------------------------- | --------------------------------------------------- |
| 1        | `#some-id`                                         | `grep -r 'some-id'` in `src/`                       |
| 2        | `[data-testid="foo"]` / `[data-test]` / `[data-cy]` | grep for the attribute value                       |
| 3        | `aria-label` on interactive elements               | grep for the label string                           |
| 4        | `name` attribute on form fields                    | grep for `name="..."` in the relevant form file     |
| 5        | Structural (e.g. `.card:nth-of-type(2) > button`) | narrow by page route → component file → visual match with screenshot |
| Fallback | Selector didn't resolve                            | Use the screenshot: identify the element visually, search by text content or component name |

Narrow your search by the **Page** field to avoid editing the wrong route's code.

### 3f. Reproduce it live, before writing a fix

Don't go straight from "read the note" to "guess the fix." Run the app, log
in as the relevant role using **Login Context**, navigate to **Page**, and —
if the point has a **Journey step** with an `expect` field — try to actually
trigger the failure the way the journey step describes. This catches two
things a static screenshot can't: a report that's already stale (fixed
elsewhere, doesn't reproduce), and a bug whose real trigger is an
interaction, not the state the screenshot happened to capture. Only once
you've confirmed the failure and understand *why* it happens do you move to
3g — writing a fix against a guess is how you end up patching the symptom
in the screenshot instead of the actual defect.

### 3g. Make the change

- Follow the project's **Conventions** (from the preamble).
- Respect all **Invariants** — never violate them even if the annotation implies it.
- If the change touches a RED zone (money / auth / irreversible state), add an
  explicit comment: `// QA: red-zone change — reviewed <date>`.
- Do **not** edit `qa.config.ts`, `qa.preamble.md`, or any qapture plugin files.

---

## Step 4 — Verify the Fix

1. Run the app using the **Run Commands** from the preamble.
2. Log in as the relevant role using **Login Context** credentials.
   (These are DEV/TEST/SEED only — never use production credentials.)
3. Navigate to the **Page** listed in the annotation.
4. **Reproduce** the original issue to confirm it existed, then verify it is fixed.
5. In the browser console, run `document.querySelector('<selector>')` to confirm
   the element resolves as expected.
6. Check adjacent paths for regressions, especially if the change is in a shared
   component.

---

## Step 5 — Grade and Report

After acting on all points, produce a short report:

```markdown
## Qapture — Changes Summary

| Point | Page            | Severity | Change made                   | Verified | Risk  |
| ----- | --------------- | -------- | ----------------------------- | -------- | ----- |
| 1     | /products       | bug      | Fixed button label            | ✓        | green |
| 2     | /checkout       | bug      | Corrected total calculation   | ✓        | red   |

### Coverage vs Red Zones
- [x] /checkout/payment — covered by Point 2
- [ ] /seller/payouts  — NOT covered (flagged in Step 2)

### Uncovered items
None (all annotated points addressed).

### Suggestions (proposed, not implemented)
- [amber] /cart — quantity stepper has no debounce; noticed while fixing
  Point 1, not part of the report, flagging rather than touching it.
```

An **amber** suggestion you *did* implement inline still gets called out
here, same as above but phrased as done, not proposed. A **green** one
doesn't need a separate line at all — just mention it in the affected
point's "Change made" cell. **Red** ideas are always proposal-only, never a
line item that reads as if it happened.

---

## Risk Zone Reference

| Risk    | Examples                                                          | Rule                                             |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **red** | Payment, checkout, auth, order state, refunds, payouts, user data | Never change without developer review + comment  |
| **amber** | Cart, product listings, search, seller dashboard, inventory    | Change carefully; verify end-to-end              |
| **green** | Static content, labels, colours, copy, tooltips, layout        | Change freely; quick smoke-test                  |

---

## Security Note

- **Dev/test/seed credentials only.** The Login Context in `notes.md` contains
  credentials from `.env.example` or seeder files — never from production.
- **Never log, forward, store, or commit** Login Context values outside the
  development environment.
- **Never read** `.env`, `.env.local`, `.env.production`, or any `secrets/`
  path. Qapture's CLI enforces this; you must too.
- Qapture is **100% client-side** — it makes no network calls, holds no API
  keys, and sends no data anywhere.
- **Runtime context evidence is already redacted for you.** Any URL shown in
  a point's runtime-context block has had its query string stripped by
  Qapture before export, and request/response bodies, headers, cookies, and
  storage values were never captured in the first place — treat this section
  as safe local debugging evidence, not as something you need to further
  sanitize.
- **Never push, publish, or deploy** changes without explicit human approval,
  regardless of risk level.

---

## Common Pitfalls

- **Don't assume selectors always resolve.** Selector strings may be stale if
  the DOM changed after annotation. When in doubt, use the screenshot.
- **Don't skip the preamble.** Acting without reading the invariants or run
  commands is the most common source of broken fixes.
- **Don't edit qapture config or plugin files** (`qa.config.ts`,
  `qa.preamble.md`, `.claude/skills/qapture/`, `src/components/qa-overlay/`).
- **Don't use production credentials** — ever.
- **Don't push/publish without human approval** — always present the changes
  for review first.
- **Don't violate invariants** even if the annotation seems to imply it.
  Surface the conflict to the developer instead.
- **Don't ignore the runtime context block.** A point's collapsed "Runtime
  context at capture" section is often the actual root cause, not
  supplementary detail — check it before guessing at one from the note text
  and screenshot alone.
- **Don't treat a `question`-severity or `verified`-status point like a
  routine bug fix.** A `question` may just need an answer, not code; a
  `verified` point was already re-confirmed once and should be double-checked
  before you assume it's still broken.
- **Don't work every point serially when they could parallelize.** If you
  catch yourself fixing point after point one at a time on a batch of five
  independent-file points, stop and re-read the Working Model section above.
- **Don't let two subagents touch the same file at once.** File overlap, not
  point count, is what decides parallel vs serial — check this before you
  spawn anything.
- **Don't treat a subagent's "done" as the verification gate.** Run the
  project's own test/verify command yourself, independently, after every
  subagent lands its change.
- **Don't silently implement a creative idea beyond a green zone.** Amber
  gets implemented-and-disclosed; red gets proposed-and-left-alone. Never
  implemented-and-undisclosed.

---

_Qapture — https://github.com/mohammed-farhood/qapture_
