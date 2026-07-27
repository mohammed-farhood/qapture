<!-- qa-studio-section -->

## Qapture

This project uses **Qapture** — an in-browser QA capture widget that ships
**zero AI** (no model, no API keys, no network calls). **You** are the AI.

### When you receive a `qa-notes-*.zip`

1. **Unzip** the file.
2. **Read `notes.md` top-to-bottom**, starting with everything above the
   `---NOTES---` separator:
   - **Project context** — name, stack, run commands, conventions.
   - **Login Context** — dev/test/seed credentials for the relevant roles.
     _(DEV/TEST/SEED only — never commit, log, or forward these values.)_
   - **Coverage Report** — red/amber/green zone checklist.
   - **Invariants** — rules you must never violate (e.g. "prices ≥ 0",
     "checkout requires auth").
3. **Flag uncovered RED zones** before acting. RED = money / auth / irreversible
   state. If any red zone has no annotation in this ZIP, report it and ask the
   developer whether to proceed.
4. **Act on each `## Point N`** annotation:
   - **Page** + **Selector** + **Note** → locate the element in the source
     (priority: `#id` → `[data-testid]` → `aria-label` → `name` → visual match
     via the `screenshots/point-N.png`).
   - **Severity** (`bug`/`question`/`polish`) and **Status** (`open`/`verified`)
     tell you how to treat the point — a `question` may not need a code
     change; a `verified` point was already re-checked once.
   - **Runtime context** (when present, in a collapsed `<details>` block) —
     recent console errors/warnings and failed network calls captured right
     before the tester clicked capture, plus an environment snapshot. Read it
     before assuming a UI-only cause — it is often the actual root cause.
     Query strings in any URL there are already redacted; bodies, headers,
     cookies, and storage were never captured at all.
   - Make the change following the project conventions and invariants.
   - **Verify**: run the app, log in as the relevant role, navigate to the page,
     confirm the fix.
5. **Report** a summary table of changes, risk levels, and coverage status.

### A single point, no ZIP

A tester can also send you **one point directly**, pasted via Qapture's
"Copy as agent prompt" button, with no ZIP and no preamble. Treat it exactly
like one `## Point N` from step 4 above — there is no Coverage Report to
check and no RED-zone flag to raise, since there's no journey context at all.

### Full protocol

`.claude/skills/qapture/SKILL.md` (always kept current by `qapture init`).

### Rules

- Never read `.env`, `.env.local`, `.env.production`, or any `secrets/` path.
- Never edit `qa.config.ts`, `qa.preamble.md`, or any qapture plugin files.
- Never push/publish/deploy without explicit human approval.
- Dev/test/seed credentials only — never use or request production credentials.

_Qapture — https://github.com/mohammed-farhood/qapture_

<!-- /qa-studio-section -->
