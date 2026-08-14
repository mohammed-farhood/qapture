# Architecture

Qapture has two independent layers: a **runtime widget** (the in-browser capture panel) and a **setup scaffolder** (the `npx qapture init` CLI). They share config types but have no runtime dependency on each other.

---

## Two-layer split

```
┌──────────────────────────────────────────────────────────────────────┐
│  RUNTIME WIDGET  (browser-only)                                      │
│                                                                      │
│  initQaStudio(config)                                                │
│    └── mountQaStudio(resolvedConfig)                                 │
│          ├── <qapture-overlay> host → document.body                 │
│          ├── attachShadow({ mode: 'open' })                          │
│          ├── injectStyles(shadow)   (fixed Graphite tokens only —   │
│          │     v0.3.0 removed per-consumer theming; no host-level   │
│          │     CSS-variable step any more)                          │
│          ├── installContextCapture() unless captureContext:false    │
│          └── ReactDOM.createRoot(shadow).render(<QaRoot />)          │
│                                                                      │
│  Storage: IndexedDB (${namespace}-db) + localStorage (${namespace}:*)│
│  Capture: html2canvas  [lazy chunk]                                  │
│  Export:  jszip        [lazy chunk]                                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SETUP SCAFFOLDER  (Node CLI)                                        │
│                                                                      │
│  npx qapture init [target-dir] [--force]                            │
│    ├── detectRoutes()      → journey draft                           │
│    ├── detectCredentials() → .env.example / seeder scan              │
│    ├── genConfigText()     → qa.config.js / qa.config.ts             │
│    │     (no theme block — v0.3.0 removed custom themes; the        │
│    │      former detectTheme() detector was deleted)                │
│    ├── genPreambleText()   → qa.preamble.md                          │
│    ├── writeAlways()       → .claude/skills/qapture/SKILL.md         │
│    └── mergeAgentsMd()     → AGENTS.md (idempotent)                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Shadow DOM mount model

`mountQaStudio(config: ResolvedConfig)` in `src/mount/ShadowMount.ts`:

1. Creates a `<qapture-overlay>` custom element (tag names for `attachShadow` must contain a hyphen), marks it `data-qa-overlay="true"`, and appends it to `document.body`.
2. Calls `host.attachShadow({ mode: 'open' })` — open mode so browser DevTools can inspect the shadow tree.
3. Injects the widget's self-contained CSS stylesheet into the shadow root via `injectStyles(shadow)`. **v0.3.0 change:** every colour the widget uses now lives in that stylesheet's own fixed `:host` token block (see the Graphite design tokens in `styles.ts`) — there is no longer a per-instance theme-application step here. `applyThemeVars()` is gone.
4. Starts the runtime-context ring buffer via `installContextCapture()` (see [Runtime context capture](#runtime-context-capture-contextbufferts) below), unless the resolved config opted out with `captureContext: false`.
5. Mounts `<QaRoot config={config} />` via `ReactDOM.createRoot(shadow)`. The shadow root, being a `DocumentFragment`, is accepted directly as the React root container.

The returned `{ destroy() }` handle:
- Calls `uninstallContextCapture()` to restore the wrapped globals (`console.error`/`warn`, `fetch`, `XMLHttpRequest`, the `error`/`unhandledrejection` listeners).
- Calls `root.unmount()` to tear down the React tree.
- Removes the `<qapture-overlay>` host from `document.body`.
- Queries `document.body` for any remaining `[data-qa-overlay]` children (light-DOM overlays injected by the capture/highlight layer) — **excluding** any `<qapture-overlay>` element itself (`:not(qapture-overlay)`) — and removes them. That exclusion matters: `destroy()` can run *after* a replacement instance has already mounted its own host (React StrictMode remounts, and the deferred teardown in `index.ts`), and a bare `[data-qa-overlay]` sweep would tear out that live, still-mounted host.

### Runtime context capture (`contextBuffer.ts`)

Alongside the shadow mount, `ShadowMount.ts` starts and stops a small ring buffer (`src/lib/contextBuffer.ts`) that wraps `console.error`/`console.warn`, the window `error`/`unhandledrejection` events, `fetch`, and `XMLHttpRequest`, so every note captured afterwards can carry the runtime facts around it (recent console/network events + an environment snapshot). It is gated end-to-end by `ResolvedConfig.captureContext` (default `true`): `ShadowMount` only installs it when the flag isn't `false`, and `QaContext.addNote()` only assembles a note's `context` field under the same condition — so disabling the flag means nothing is ever wrapped **and** nothing is ever attached, even if a stray event existed. This is a genuinely new privacy surface; the exact guarantees (query-string redaction, no bodies/headers/cookies/storage, a 75-event cap) are documented in full in [`SECURITY.md`](../SECURITY.md#runtime-context-capture) rather than restated here.

### Light DOM operations

The **capture interceptor** (`src/lib/capture.ts`) and **element highlighter** (`src/lib/highlight.ts`) operate in the host page's **light DOM** — not inside the shadow tree. They inject temporary overlay boxes as direct children of `<body>` with the attribute `data-qa-overlay="true"`. This is intentional: the flash / highlight must sit over the host page content, not inside the isolated shadow root.

`destroy()` cleans up all `[data-qa-overlay]` children of `<body>` after unmounting React.

### html2canvas scope

`html2canvas` captures the **visible light DOM** of the host page. It does not capture content inside other custom elements that have their own shadow roots. The Qapture widget itself (which lives in a shadow root) is excluded from the captured image automatically.

---

## Storage model

### IndexedDB — notes and meta

| Property | Value |
|---|---|
| Database name | `${namespace}-db` |
| Schema version | `2` |
| Object store `notes` | keyPath: `id` — captured QA annotations |
| Object store `meta` | keyPath: `key` — widget metadata and UI state |

Migration ladder (in `src/lib/idb.ts`): v1 creates the `notes` store; v2 adds the `meta` store. The switch-fall-through pattern ensures forward-only migrations.

v0.3.0 adds four new fields to a stored note — `severity`, `status`, `journeyRef`, `context` (see `QaContext.tsx`'s `QaNote` type) — but **no schema-version bump was needed**: all four are optional, so notes written by 0.2.x read back completely unchanged and existing IndexedDB databases need no migration.

When IndexedDB is unavailable (SSR, jsdom environment, blocked origins), `createIdb()` returns a no-op adapter that resolves all operations immediately. The session works in-memory but notes are not persisted between page loads.

### localStorage — UI state

| Property | Value |
|---|---|
| Key prefix | `${namespace}:` |
| Examples | `qapture:lang`, `qapture:guideChecked` |

`createStorage(namespace)` probes availability with a write/remove test before the first use. On failure (private browsing mode, SSR, quota exceeded) it falls back to an in-memory `Map` for the lifetime of the page session.

Both storage layers are namespaced so multiple qapture instances on the same origin (with different `namespace` values) do not interfere with each other.

### A third layer: the tester's disk (v0.4)

`src/lib/fsSync.ts` adds an optional layer *outside* the browser entirely. When a tester grants a directory handle (File System Access API, Chromium desktop only), every saved note is also written to `<folder>/<Project>/<Campaign>/` as Markdown plus its image, alongside a `campaign.json` index and a live-rewritten `REPORT.md`.

Three details make it durable rather than decorative:

- The **directory handle lives in the IndexedDB `meta` store**, not localStorage — a `FileSystemDirectoryHandle` is a structured-cloneable object, not a string. `idb.ts` gained `getMeta`/`setMeta`/`deleteMeta` for this; the `meta` store itself already existed in the v2 schema, so there is no migration.
- **Write permission is expected to lapse** between sessions (browsers deliberately drop it). The restore path therefore never prompts: it reports `needs-permission` and the UI offers a one-click Reconnect.
- **The note→file index lives in `campaign.json`**, so re-opening a campaign after a reload continues the same numbering and rewrites files in place instead of accumulating duplicates.

Failures never block a note: IndexedDB has already accepted it before the disk write is attempted, and a sync outage surfaces once rather than per-save.

---

## Build

Built with **tsup** (esbuild-based bundler). Two build groups are defined in `tsup.config.ts`.

### Library (ESM + CJS + `.d.ts`)

| Entry | Output |
|---|---|
| `src/index.ts` | `dist/index.{js,cjs}` + `dist/index.d.{ts,cts}` |
| `src/next.ts` | `dist/next.{js,cjs}` + `dist/next.d.{ts,cts}` |
| `src/standalone.ts` | `dist/standalone.{js,cjs}` + `dist/standalone.d.{ts,cts}` |

Key settings:

- **`splitting: true`** — `jszip` and `html2canvas` become separate lazy chunks (`dist/chunk-*.js`) fetched only when the user triggers a capture or export. They are not included in the initial bundle.
- **React is external** — `react`, `react-dom`, and `react/jsx-runtime` are not bundled. They are resolved from the host app's `node_modules`.
- **`'use client'` directive** — the `src/next.ts` source does not contain `'use client'` (esbuild strips source-level directives when bundling, causing a warning). Instead, `scripts/postbuild.mjs` prepends the directive to `dist/next.js` and `dist/next.cjs` after the build completes.

### CLI (Node CJS)

| Entry | Output |
|---|---|
| `src/bin/init.ts` | `dist/bin/init.cjs` |

Key settings:

- Node 18 target; no React dependency.
- `#!/usr/bin/env node` shebang injected via tsup's `banner` option.
- Markdown files (`SKILL.md`, `AGENTS_SECTION.md`) loaded as text string constants via `loader: { '.md': 'text' }`. The CLI is a single self-contained CJS file with no runtime file-system lookups for its own artifact templates.

---

## Module map

```
src/
├── index.ts                    Public API: Qapture component + initQaStudio() (QaStudio backward alias)
├── next.ts                     Next.js App Router re-export (postbuild adds 'use client')
├── standalone.ts               Non-React entry: initQaStudio() + <qapture-widget> custom element
├── defaults.ts                 Default config values
│
├── config/
│   └── schema.ts               All public config types (QaConfig, QaTheme [deprecated,
│                               ignored], QaCredential, QaJourneyLane, QaJourneyStep
│                               [+ optional `expect`], QaPreamble, QaBilingual, QaRisk,
│                               ResolvedConfig [no `theme`, has `captureContext`])
│                               + validateConfig() (warns+ignores a `theme` key)
│
├── mount/
│   └── ShadowMount.ts          Creates <qapture-overlay> host, open shadow root,
│                               starts/stops contextBuffer capture, mounts React
│
├── context/
│   └── QaContext.tsx           React context: notes list, guide checked/failed state,
│                               language toggle, capture mode, notices/undo, test-along,
│                               and all actions (theme REMOVED from context value)
│
├── components/
│   ├── QaRoot.tsx              Top-level component rendered inside the shadow root;
│   │                           handles visibility gating, hotkey listener, and mounts
│   │                           <NoticeHost/> + (while active) <TestAlongHud/>
│   ├── QaPanel.tsx             Main panel (tabs: Notes / Guide / Credentials / Export);
│   │                           suppressed while test-along is active
│   ├── QaFab.tsx               Floating action button (launcher toggle)
│   ├── GuideSection.tsx        Journey map with risk dots + RED N/M coverage counter;
│   │                           "Start walkthrough" entry point + per-step evidence badges
│   ├── CredentialsSection.tsx  Credentials table with copy-to-clipboard
│   ├── CaptureMode.tsx         Click/drag capture overlay (activated in capture mode);
│   │                           failed-capture retry, severity chips, forensics capture
│   ├── NoteList.tsx            List of captured notes with edit/delete, severity/status,
│   │                           and "Copy as agent prompt"
│   ├── NoteEditor.tsx          Note edit form (severity chip row)
│   ├── NoticeHost.tsx          (new) Toast viewport for the notices/undo system
│   ├── TestAlongHud.tsx        (new) Guided step-by-step walkthrough bar, replaces the
│   │                           panel while test-along is active
│   └── LocationReveal.tsx      Current page path display
│
├── lib/
│   ├── capture.ts              html2canvas integration; element/region targeting;
│   │                           injects light-DOM flash highlight during capture
│   ├── contextBuffer.ts        (new) installContextCapture()/uninstallContextCapture() —
│   │                           console/error/network ring buffer (cap 75) + env snapshot
│   │                           + per-element forensics; see SECURITY.md for guarantees
│   ├── coverage.ts             computeCoverage() — pure function; red/amber/green
│   │                           tallies; tier (Minimal/Adequate/Full/Complete)
│   ├── exportZip.ts            buildAndDownloadZip() — assembles preamble + notes.md
│   │                           + screenshots/ into a ZIP and triggers browser download
│   ├── highlight.ts            Light-DOM highlight box for hovered/selected element
│   │                           (fixed Graphite colours built in — no `colors` param)
│   ├── idb.ts                  createIdb(namespace) — namespaced IndexedDB wrapper;
│   │                           DB v2 migration ladder; SSR-safe no-op fallback
│   ├── journeyMatch.ts         (new) matchRouteToSteps() — links a captured note to the
│   │                           journey step matching the current route (`:param`-aware)
│   ├── noteMarkdown.ts         (new) noteToMarkdown() — renders one note as agent-ready
│   │                           Markdown; shared by exportZip.ts and "Copy as agent prompt"
│   ├── screenCapture.ts        (v0.4) pixel-exact engine — getDisplayMedia(preferCurrentTab)
│   │                           session stream, frame grab, viewport→frame crop mapping
│   ├── fsSync.ts               (v0.4) File System Access folder sync — project/campaign
│   │                           tree, per-note md+image writes, campaign.json index, REPORT.md
│   ├── storageHealth.ts        (v0.4) navigator.storage estimate/persist + byte formatting
│   ├── selector.ts             CSS selector generation from DOM elements
│   ├── storage.ts              createStorage(namespace) — namespaced localStorage
│   │                           wrapper; in-memory Map fallback
│   ├── strings.ts              QaBilingual resolution helpers
│   └── styles.ts               Shadow DOM style injection — fixed Graphite design
│                               tokens only; no consumer-supplied theme application
│
├── icons/
│   └── Icon.tsx                Lucide-derived SVG icon set (ISC license); includes
│                               Bug, AlertTriangle, RotateCcw, ChevronLeft, ChevronRight, Play,
│                               Search, Folder, FolderCheck, Settings, HardDrive, Camera,
│                               Minimize2, Maximize2, Send
│
└── bin/
    ├── init.ts                 CLI entry: argument parsing, orchestration, printSummary
    ├── md.d.ts                 TypeScript declaration for *.md text imports
    │
    ├── utils/
    │   ├── args.ts             Argument parser (command, dir, --force flag)
    │   ├── secretGuard.ts      Hard file-path blocklist — assertSafeToRead(path)
    │   │                       never reads .env, certs, keys, or secret-named files
    │   ├── mergeAgentsMd.ts    Idempotent AGENTS.md merge with sentinel guards
    │   ├── walk.ts             Recursive directory walker with ignore patterns
    │   └── writeIdempotent.ts  writeIfAbsent() + writeAlways() helpers
    │
    ├── detectors/
    │   ├── detectRoutes.ts     Route file scanner → journey lane/step draft
    │   └── detectCredentials.ts .env.example + seeder file scanner (safe sources only)
    │   (detectTheme.ts was deleted in v0.3.0 — no more theme detection)
    │
    ├── generators/
    │   ├── genConfig.ts        qa.config.js / qa.config.ts text generator
    │   └── genPreamble.ts      qa.preamble.md text generator
    │
    └── artifacts/
        ├── SKILL.md            Claude Code agent skill (bundled as a text constant)
        └── AGENTS_SECTION.md   AGENTS.md qapture section (bundled as a text constant)
```
