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
4. **Triage the whole batch before touching code.** Read every point first —
   points on different pages can share one root cause (check their runtime
   context for a repeated failing URL or error message) and deserve one fix,
   not N. Write the plan down before editing anything.
5. **Orchestrate, don't grind through it yourself.** For anything past a
   single trivial point: you're the brain, not the muscle. Spawn one Sonnet
   subagent per point/cluster (model pinned explicitly on every call, never
   inherited; effort is your judgment call per task), parallelized across
   points that touch disjoint files — never two agents on the same file. You
   supervise by checking what each subagent's report actually claims and by
   running the project's own verify/test command yourself afterward, not by
   rereading every diff or trusting a subagent's "done."
6. **Each point/cluster, before fixing:**
   - **Page** + **Selector** + **Note** → locate the element in the source
     (priority: `#id` → `[data-testid]` → `aria-label` → `name` → visual match
     via the screenshot named in the point's **Screenshot** line —
     `screenshots/point-N.webp`, or `.png` on browsers without WebP).
   - **Severity** (`bug`/`question`/`polish`) and **Status**
     (`open`/`fixed`/`verified` — `fixed` means someone says it is done but
     nobody has re-tested it yet)
     tell you how to treat the point — a `question` may not need a code
     change; a `verified` point was already re-checked once.
   - **Runtime context** (when present, in a collapsed `<details>` block) —
     recent console errors/warnings and failed network calls captured right
     before the tester clicked capture, plus an environment snapshot, plus
     **forensics** (contrast/accessibility flags on the captured element) when
     present — treat these as objective acceptance criteria, not just the
     tester's prose. Read it before assuming a UI-only cause. Query strings in
     any URL there are already redacted; bodies, headers, cookies, and storage
     were never captured at all.
   - **Reproduce it live first** — run the app, log in as the relevant role,
     navigate to the page, actually trigger the failure — before writing a
     fix. A static screenshot can hide a stale report or an interaction-only
     bug.
   - Make the change following the project conventions and invariants, then
     re-verify the same repro.
7. **Report** a summary table of changes, risk levels, and coverage status,
   plus a `### Suggestions` section for anything noticed beyond the reported
   points. Whether you may *implement* an extra idea (not just suggest it)
   follows the same red/amber/green gating as everything else: green — do it
   inline; amber — do it and disclose it; red — propose only, never touch it.

### A single point, no ZIP

A tester can also send you **one point directly**, pasted via Qapture's
"Copy as agent prompt" button, with no ZIP and no preamble. Treat it exactly
like one point from step 6 above — there's nothing to cluster or triage with
only one point, and there's no Coverage Report to check or RED-zone flag to
raise, since there's no journey context at all. Just fix it yourself if it's
trivial, or spawn a single subagent if it isn't.

### Full protocol

`.claude/skills/qapture/SKILL.md` (always kept current by `qapture init`).

### Rules

- Never read `.env`, `.env.local`, `.env.production`, or any `secrets/` path.
- Never edit `qa.config.ts`, `qa.preamble.md`, or any qapture plugin files.
- Never push/publish/deploy without explicit human approval.
- Dev/test/seed credentials only — never use or request production credentials.

_Qapture — https://github.com/mohammed-farhood/qapture_

<!-- /qa-studio-section -->
