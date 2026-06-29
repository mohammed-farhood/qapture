# QA Studio

> Drop-in, AI-aware, 100% client-side QA capture widget — ships **zero AI**.

A human tester walks your live web app, annotates elements or regions (auto-screenshot + note), follows a **graded testing journey** (red / amber / green risk zones), and exports a ZIP. That ZIP leads with an **induction preamble** your **own** terminal coding agent (Claude Code, Cursor, Windsurf, …) reads so it already knows your project — locating code from each point's CSS selector + screenshot, making the change, verifying it, and grading RED-zone coverage.

No model is bundled. No API keys. No network calls. The widget is 100% client-side and keyless; notes live in the tester's browser (IndexedDB) until they export. The CLI scaffolder is deterministic and AI-free. **The AI is yours.**

```bash
npm install qa-studio
```

---

## Contents

- [Quick Start](#quick-start)
- [Config Reference](#config-reference)
- [Graded Risk Model](#graded-risk-model)
- [Export and AI Handoff](#export-and-ai-handoff)
- [CLI](#cli)
- [Launcher Gating](#launcher-gating)
- [Browser and SSR Support](#browser-and-ssr-support)
- [Isolation and Known Limitations](#isolation-and-known-limitations)
- [Uninstall](#uninstall)
- [License](#license)

---

## Quick Start

### React (any)

```tsx
import { QaStudio } from 'qa-studio';
import type { QaConfig } from 'qa-studio';

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
      <QaStudio config={config} />
    </>
  );
}
```

`<QaStudio>` renders `null` on the server and is SSR-safe. On mount it attaches an isolated Shadow DOM host to `document.body`; on unmount it tears it down cleanly. Config is read once at mount time — changes to the prop after mount are ignored.

### Next.js App Router

`qa-studio/next` re-exports the same component but ships with a `'use client'` directive prepended to its bundle output — no extra wrapper file needed:

```tsx
// app/layout.tsx
import { QaStudio } from 'qa-studio/next';
import config from '../qa.config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <QaStudio config={config} />
      </body>
    </html>
  );
}
```

### Standalone (non-React)

For apps without React — plain HTML, Vue, Svelte, Astro islands, etc. Use the imperative `initQaStudio()` from `qa-studio/standalone`:

```js
import { initQaStudio } from 'qa-studio/standalone';

const instance = initQaStudio({ namespace: 'my-app', brand: { label: 'My App' } });

// Later, to unmount and clean up:
instance.destroy();
```

Or use the registered `<qa-studio-widget>` custom element — accepts a `config` attribute (JSON string) or a `.config` property:

```html
<script type="module" src="/dist/standalone.js"></script>

<!-- attribute-based config -->
<qa-studio-widget config='{"namespace":"my-app"}'></qa-studio-widget>

<!-- or property-based config (full object, no JSON serialization needed) -->
<qa-studio-widget id="qa"></qa-studio-widget>
<script>
  document.getElementById('qa').config = {
    namespace: 'my-app',
    brand: { label: 'My App' },
  };
</script>
```

---

## Config Reference

All fields are optional. Passing an empty object (or no config at all) produces a valid, usable widget with sensible defaults.

### `QaConfig`

| Field | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | `'qa-studio'` | Prefix for IndexedDB (`${namespace}-db`) and localStorage keys (`${namespace}:*`). Use a unique value per project to avoid storage collisions on the same origin. |
| `theme` | `Partial<QaTheme>` | See QaTheme defaults | Override any subset of the 9 colour tokens. Unspecified tokens keep their defaults. |
| `brand` | `{ label?: string }` | `{ label: 'QA Studio' }` | Panel heading label. |
| `loginField` | `{ en: string; ar?: string }` | `{ en: 'Username', ar: 'اسم المستخدم' }` | Display label for the login column in the Credentials tab. |
| `credentials` | `QaCredential[]` | `[]` | DEV/TEST/SEED login rows shown in the Credentials tab. |
| `journey` | `QaJourneyLane[]` | `[]` | Role-grouped testing journey shown in the Guide tab. |
| `preamble` | `QaPreamble` | `null` | AI agent handoff context block embedded in the export. |
| `rtl` | `boolean` | `false` | When `true`, the UI initialises in Arabic / RTL mode. |
| `visible` | `boolean \| undefined` | `undefined` | `true` = always show; `false` = always hide; `undefined` = dev-only (hidden in production). |
| `alwaysVisible` | `boolean` | `false` | When `true`, overrides `visible` and shows the panel even in production. |
| `hotkey` | `string` | `'shift+alt+q'` | Keyboard shortcut that toggles the panel open/closed. |

### `QaTheme`

Nine CSS custom-property tokens (`--qa-*`) that control the widget chrome. All values are CSS color strings.

| Token | Default | Role |
|---|---|---|
| `primary` | `#4f46e5` | Primary buttons, active states |
| `primaryDark` | `#3730a3` | Hover / pressed states |
| `accent` | `#7c3aed` | Highlights, badges |
| `accentDark` | `#6d28d9` | Accent hover |
| `sage` | `#6b7280` | Muted text, borders |
| `cream` | `#f8fafc` | Panel background |
| `mauve` | `#a78bfa` | Soft decorative surfaces |
| `surface` | `#ffffff` | Cards, inputs |
| `ink` | `#1f2937` | Body text |

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

## Export and AI Handoff

### The workflow

1. **Capture** — click an element or drag a region on the live page. QA Studio auto-screenshots the visible page, opens the note editor. Write a description; save.
2. **Guide** — tick steps in the journey as you walk through them. The Guide tab tracks red-zone coverage and shows the current tier.
3. **Export** — click Export in the panel. A `qa-notes-<timestamp>.zip` downloads to your machine. Give it a meaningful name.
4. **Handoff** — drop the ZIP into your terminal coding agent's context. If you use Claude Code, the `.claude/skills/qa-studio/SKILL.md` the CLI generated (or the `AGENTS.md` snippet) primes the agent automatically when the ZIP is attached.
5. **Agent acts** — the agent reads `notes.md`, internalises the preamble (project context, theme tokens, dev credentials, red-zone coverage, invariants), flags any uncovered RED steps, then works through each `## Point N` annotation: locates the code via the selector + screenshot, makes the change, verifies it in the running app, and produces a graded summary.

### ZIP layout

```
qa-notes-<timestamp>.zip
├── notes.md
└── screenshots/
    ├── point-1.png
    ├── point-2.png
    └── ...
```

### `notes.md` structure

```
<!-- QA Studio Export Preamble — read before acting on any point. -->

# Project — QA Handoff
> one-liner

## Project       (name, stack, run commands)
## Theme Tokens  (9-token colour table)
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
- **Selector:** `#element-id`
- **When:** <timestamp>
- **Screenshot:** screenshots/point-1.png

Tester's note text...

---

## Point 2
...
```

The preamble degrades gracefully — sections with no data are marked `(not provided)` rather than omitted, so the agent always receives the full structure.

---

## CLI

The CLI scaffolds `qa.config`, the agent skill, and `AGENTS.md` into any repository. It is **deterministic, AI-free, and network-free** — no model call, no network request, no `require()`-ing of target project files.

```bash
npx qa-studio init [target-dir] [--force]
npx qa-studio version
```

`target-dir` defaults to the current directory. `--force` overwrites existing `qa.config.*` and `qa.preamble.md` (SKILL.md is always refreshed regardless).

### What it detects and generates

| Step | What happens |
|---|---|
| Route detection | Scans `src/`, `app/`, `pages/` for route files; generates journey lanes with placeholder `'green'` steps for you to grade |
| Theme detection | Reads `tailwind.config.*` and CSS files for colour values |
| Credential detection | Scans `.env.example` and seeder/seed files for test logins. **Never reads `.env`, `.env.local`, `.env.production`, or any real secrets file** — enforced by a hard blocklist |
| `qa.config.js` / `.ts` | Generated based on detections; contains TODO comments for manual grading |
| `qa.preamble.md` | Starter preamble file; fill with project context and paste into `config.preamble` |
| `.claude/skills/qa-studio/SKILL.md` | Claude Code agent skill (always refreshed — this is a vendor artifact) |
| `AGENTS.md` | Idempotent merge with sentinel guards; safe to run repeatedly |

All generated files are idempotent — existing `qa.config.*` and `qa.preamble.md` are skipped unless `--force` is passed.

### IDE notes

After `init`, copy the agent instructions into your IDE's rules directory:

- **Cursor** — copy the `qa-studio` block from `AGENTS.md` into `.cursor/rules/qa-studio.md`
- **Windsurf** — append the `qa-studio` block from `AGENTS.md` to `.windsurf/rules.md`

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

---

## Browser and SSR Support

- **Peer dependencies:** React >= 18, ReactDOM >= 18.
- **SSR-safe:** `QaStudio`, `initQaStudio()`, and `<qa-studio-widget>` all guard `typeof window` and return no-ops on the server. Nothing is rendered server-side.
- **Next.js App Router:** use `qa-studio/next` (which has `'use client'` baked into its bundle output) rather than `qa-studio` directly. This prevents the "attempted to call a Client Component from the Server" error.
- **Node >= 18** required for the CLI.
- Heavy dependencies (`jszip`, `html2canvas`) are loaded as **lazy code-split chunks** — they do not affect initial page load and are only fetched when the user triggers a capture or export action.

---

## Isolation and Known Limitations

### What works everywhere

- **Shadow DOM isolation** — the widget chrome (CSS, events) lives inside an open shadow root attached to `<body>`. The host app's CSS frameworks (Tailwind, Bootstrap, etc.) cannot leak into the widget, and the widget's styles cannot leak out. Works with no Tailwind installed in the host.
- **React peer independence** — the widget's React tree lives inside the shadow root; it does not conflict with the host app's React version or tree.
- **Storage degradation** — IndexedDB and localStorage both degrade silently to in-memory storage in private browsing mode or SSR environments. Notes will not persist between sessions in private mode, but the current session works normally.

### Known limitations

- **html2canvas captures the visible light DOM only.** Content inside *other* custom elements that have their own shadow roots (not qa-studio's own) will not appear in screenshots. This is a limitation of html2canvas, not qa-studio.
- **`position: fixed` may shift on transformed ancestors.** If any ancestor of `document.body` has a CSS `transform`, `perspective`, or `will-change` property applied, `position: fixed` elements — including the QA panel — may be offset from their expected position. This is standard CSS containment behaviour.
- **Next.js App Router requires `qa-studio/next`.** Importing from `qa-studio` in a Server Component context will produce a "use client" error. Use the `/next` entry point.
- **Config changes after mount are ignored.** `<QaStudio>` mounts once on first render (`useEffect` with `[]` deps) and ignores subsequent prop changes. To apply a new config, destroy the instance and remount.
- **One instance per page.** Calling `initQaStudio()` or rendering `<QaStudio>` multiple times without calling `destroy()` first will append multiple widget hosts to `<body>`.

---

## Security model

- **Zero AI, zero network, zero keys.** No model is bundled; no API calls are made; no telemetry is collected.
- **Data stays in the browser** until the tester explicitly exports a ZIP. Nothing is ever transmitted.
- **Credentials are DEV/TEST/SEED only.** The `credentials` config field and the Login Context in the export are intended exclusively for non-production environments.
- **The CLI never reads real secrets.** A hard path blocklist prevents the CLI from reading `.env`, `.env.local`, `.env.production`, certificate files, or any file under `/secrets/`, `/keys/`, `/credentials/`. Only `.env.example` and seeder files are scanned.

See [SECURITY.md](./SECURITY.md) for the full security model and vulnerability reporting instructions.

---

## Uninstall

1. Remove `<QaStudio />` (or `initQaStudio()` calls) from your codebase.
2. Uninstall the package: `npm uninstall qa-studio`.
3. Optionally delete the IndexedDB left behind — open the browser console on your app's origin and run:

```js
indexedDB.deleteDatabase('qa-studio-db'); // replace 'qa-studio' with your namespace value
```

4. Optionally delete scaffolded files: `qa.config.*`, `qa.preamble.md`, `.claude/skills/qa-studio/`, and the `qa-studio` block in `AGENTS.md`.

---

## License

MIT. Icon path data derived from [Lucide](https://lucide.dev) (ISC).
