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

`contextBuffer.ts` gained a second, separate recorder in v0.5: an interaction trail (`QaStep`) of the clicks, field edits, toggles, submits, key presses and navigations leading up to each note. It is kept apart from the event ring on purpose — the event ring is *drained* per note ("what happened since the last one"), while steps are *read without consuming* ("the last dozen things I did"), because two notes filed back to back are usually about the same sequence and both deserve the run-up. Its privacy rules are stricter than the rest of the module and are enumerated in [`SECURITY.md`](../SECURITY.md#interaction-steps-steps-before-this): no typed value, no selected option, no character keys.

Alongside the shadow mount, `ShadowMount.ts` starts and stops a small ring buffer (`src/lib/contextBuffer.ts`) that wraps `console.error`/`console.warn`, the window `error`/`unhandledrejection` events, `fetch`, and `XMLHttpRequest`, so every note captured afterwards can carry the runtime facts around it (recent console/network events + an environment snapshot). It is gated end-to-end by `ResolvedConfig.captureContext` (default `true`): `ShadowMount` only installs it when the flag isn't `false`, and `QaContext.addNote()` only assembles a note's `context` field under the same condition — so disabling the flag means nothing is ever wrapped **and** nothing is ever attached, even if a stray event existed. This is a genuinely new privacy surface; the exact guarantees (query-string redaction, no bodies/headers/cookies/storage, a 75-event cap) are documented in full in [`SECURITY.md`](../SECURITY.md#runtime-context-capture) rather than restated here.

### Light DOM operations

The **capture interceptor** (`src/lib/capture.ts`) and **element highlighter** (`src/lib/highlight.ts`) operate in the host page's **light DOM** — not inside the shadow tree. They inject temporary overlay boxes as direct children of `<body>` with the attribute `data-qa-overlay="true"`. This is intentional: the flash / highlight must sit over the host page content, not inside the isolated shadow root.

`destroy()` cleans up all `[data-qa-overlay]` children of `<body>` after unmounting React.

### Screenshot scope

The Qapture widget lives in a shadow root and is excluded from every captured
image, on every engine — the light-DOM overlays it injects are marked
`data-qa-overlay` and hidden for the frame.

What each engine can see differs, and that is the reason there is more than one:

- **`native`** (`bin/shotServer.ts` → `lib/nativeShot.ts`) photographs the
  desktop through `screencapture`, so it sees exactly what you see — canvas,
  WebGL, video, cross-origin iframes included. It is a separate process, not a
  page API, which is why it never prompts.
- **`exact`** (`getDisplayMedia`) sees the composited tab or window. Same
  fidelity, but the browser prompts on every call.
- **`dom`** (`html2canvas`) sees only the **light DOM** it can re-render. Not
  other custom elements' shadow roots, not canvas/WebGL/video pixels, not
  cross-origin iframes. It is a reconstruction, which is why the other two
  exist.

`lib/screenCapture.ts` chooses between them and normalises whichever wins into
one shape, so nothing downstream knows which ran.

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

### A fourth layer: the Downloads folder (v0.5)

Folder sync only exists on Chromium desktop, so `QaContext` also drops a backup ZIP into the browser's normal download location every `AUTO_BACKUP_EVERY` (5) notes. It is deliberately inert while a campaign folder is live — two continuously-updated copies of one session is noise, not safety — and the milestone counter is written to localStorage *before* the async export starts, so a slow or failing export can't retrigger the effect into a download loop.

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

Grouped by what a file is *for*. Every module carries a header comment
explaining why it exists and what it refuses to do — that is the real
documentation, and unlike a list it cannot drift from the code.

**Entry points**

| | |
|---|---|
| `index.ts` | Public API: `<Qapture>` and `initQaStudio()` |
| `next.ts` | Next.js App Router entry (postbuild prepends `'use client'`) |
| `standalone.ts` | Non-React entry + `<qapture-widget>` custom element |
| `mount/ShadowMount.ts` | Creates the `<qapture-overlay>` host and open shadow root |
| `config/schema.ts` | All public config types and `validateConfig()` — also the single defaults table |
| `version.ts` | Build-time injected version, for the out-of-date check |

**Taking the picture** — the subsystem with the most invariants; read
`screenCapture.ts`'s header first.

| | |
|---|---|
| `lib/screenCapture.ts` | Picks the engine, freezes one still per capture, crops from it |
| `lib/nativeShot.ts` | Talks to the local `screencapture` helper |
| `bin/shotServer.ts` | The helper itself: loopback server, origin gate, `screencapture` |
| `lib/frameCalibration.ts` | Measures where the page sits inside a frame, and refuses when it cannot |
| `lib/capture.ts` | The html2canvas redraw fallback, and painted-area clipping |
| `lib/cssColors.ts` | Converts CSS Color 4 (`oklch`…) to something html2canvas can parse |
| `lib/scrollLock.ts` | Freezes the page without touching CSS (which would unstick `sticky`) |
| `lib/highlight.ts`, `lib/selector.ts` | Element targeting and stable CSS selectors |

**Notes: storing, describing, shipping**

| | |
|---|---|
| `context/QaContext.tsx` | The state everything hangs off — notes, capture mode, filters, notices |
| `lib/idb.ts`, `lib/storage.ts`, `lib/storageHealth.ts` | Namespaced IndexedDB + localStorage, and what "storage full" means |
| `lib/exportZip.ts`, `lib/shareZip.ts` | The ZIP: preamble, `notes.md`, `screenshots/` |
| `lib/noteMarkdown.ts`, `lib/reproSpec.ts` | One note as Markdown, and its steps-to-reproduce |
| `lib/fsSync.ts` | Writing each note to a real folder as it is saved |
| `lib/collector.ts` | Posting each note to a server, when one is configured |
| `lib/contextBuffer.ts` | Console/error/network ring buffer + per-element forensics (see SECURITY.md) |
| `lib/duplicate.ts`, `lib/journeyMatch.ts`, `lib/coverage.ts` | Dedupe, route→step matching, red/amber/green tallies |

**UI** — `components/`, all rendered inside the shadow root.

`QaRoot` gates visibility and owns the hotkeys; `QaPanel` is the panel and its
tabs; `CaptureMode` is the capture overlay and annotation card; `WalkHud`
replaces the panel during a guided walkthrough. The rest are sections and
controls within those. `lib/styles.ts` holds the design tokens, `lib/strings.ts`
the English and Arabic copy, `icons/Icon.tsx` the icon set.

**CLI** — `bin/`, built separately as Node CJS.

`init.ts` dispatches; `detectors/` scan the target repo for routes and
(safely-sourced) credentials; `generators/` emit the config and preamble;
`utils/secretGuard.ts` is the hard blocklist that keeps real secrets files
unread.
