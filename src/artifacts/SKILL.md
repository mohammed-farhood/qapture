---
name: qapture
description: >
  Activated when the user provides a `qa-notes-*.zip` file exported from
  Qapture. Reads the preamble block in `notes.md` (project context, stack, run
  commands, dev/test login credentials, red-zone coverage report, and
  invariants), flags any uncovered RED risk zones before acting, then works
  through each `## Point N` annotation (page, element selector, severity,
  status, runtime-context evidence, screenshot → locate code → make the
  change → verify by running the app). Finally grades coverage against the
  red zones and reports. Also activates on a single point pasted directly via
  Qapture's "Copy as agent prompt" (no ZIP, no preamble — just one point).

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

## ZIP Layout

```
qa-notes-<timestamp>.zip
├── notes.md          ← ALWAYS read this first (see Step 1)
└── screenshots/
    ├── point-1.png
    ├── point-2.png
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

## Step 3 — Act on Each Point

For each `## Point N` section in `notes.md`:

### 3a. Read the annotation

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

### 3b. Open the screenshot

Load `screenshots/point-N.png` to visually confirm what the tester saw.
The screenshot is truth — if the selector doesn't resolve, the screenshot tells
you what element they meant.

### 3c. Locate the code

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

### 3d. Make the change

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
```

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

---

_Qapture — https://github.com/mohammed-farhood/qapture_
