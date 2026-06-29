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
│          ├── <qapture> host → document.body                         │
│          ├── attachShadow({ mode: 'open' })                          │
│          ├── injectStyles(shadow)  +  applyThemeVars(host, theme)   │
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
│    ├── detectTheme()       → theme token hints                       │
│    ├── detectCredentials() → .env.example / seeder scan              │
│    ├── genConfigText()     → qa.config.js / qa.config.ts             │
│    ├── genPreambleText()   → qa.preamble.md                          │
│    ├── writeAlways()       → .claude/skills/qapture/SKILL.md         │
│    └── mergeAgentsMd()     → AGENTS.md (idempotent)                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Shadow DOM mount model

`mountQaStudio(config: ResolvedConfig)` in `src/mount/ShadowMount.ts`:

1. Creates a `<qapture>` custom element and appends it to `document.body`.
2. Calls `host.attachShadow({ mode: 'open' })` — open mode so browser DevTools can inspect the shadow tree.
3. Injects the widget's self-contained CSS stylesheet into the shadow root via `injectStyles(shadow)`.
4. Applies the 9 theme colour tokens as CSS custom properties (`--qa-primary`, `--qa-accent`, etc.) as inline styles on the `<qapture>` **host** element, so `var(--qa-*)` tokens resolve correctly inside the shadow tree.
5. Mounts `<QaRoot config={config} />` via `ReactDOM.createRoot(shadow)`. The shadow root, being a `DocumentFragment`, is accepted directly as the React root container.

The returned `{ destroy() }` handle:
- Calls `root.unmount()` to tear down the React tree.
- Removes the `<qapture>` host from `document.body`.
- Queries `document.body` for any remaining `[data-qa-overlay]` children (light-DOM overlays injected by the capture/highlight layer) and removes them.

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

When IndexedDB is unavailable (SSR, jsdom environment, blocked origins), `createIdb()` returns a no-op adapter that resolves all operations immediately. The session works in-memory but notes are not persisted between page loads.

### localStorage — UI state

| Property | Value |
|---|---|
| Key prefix | `${namespace}:` |
| Examples | `qapture:lang`, `qapture:guideChecked` |

`createStorage(namespace)` probes availability with a write/remove test before the first use. On failure (private browsing mode, SSR, quota exceeded) it falls back to an in-memory `Map` for the lifetime of the page session.

Both storage layers are namespaced so multiple qapture instances on the same origin (with different `namespace` values) do not interfere with each other.

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
│   └── schema.ts               All public config types (QaConfig, QaTheme, QaCredential,
│                               QaJourneyLane, QaJourneyStep, QaPreamble, QaBilingual,
│                               QaRisk, ResolvedConfig) + validateConfig()
│
├── mount/
│   └── ShadowMount.ts          Creates <qapture> host, open shadow root, mounts React
│
├── context/
│   └── QaContext.tsx           React context: notes list, guide checked state,
│                               language toggle, capture mode, and all actions
│
├── components/
│   ├── QaRoot.tsx              Top-level component rendered inside the shadow root;
│   │                           handles visibility gating and hotkey listener
│   ├── QaPanel.tsx             Main panel (tabs: Notes / Guide / Credentials / Export)
│   ├── QaFab.tsx               Floating action button (launcher toggle)
│   ├── GuideSection.tsx        Journey map with risk dots + RED N/M coverage counter
│   ├── CredentialsSection.tsx  Credentials table with copy-to-clipboard
│   ├── CaptureMode.tsx         Click/drag capture overlay (activated in capture mode)
│   ├── NoteList.tsx            List of captured notes with edit/delete
│   ├── NoteEditor.tsx          Note edit form
│   └── LocationReveal.tsx      Current page path display
│
├── lib/
│   ├── capture.ts              html2canvas integration; element/region targeting;
│   │                           injects light-DOM flash highlight during capture
│   ├── coverage.ts             computeCoverage() — pure function; red/amber/green
│   │                           tallies; tier (Minimal/Adequate/Full/Complete)
│   ├── exportZip.ts            buildAndDownloadZip() — assembles preamble + notes.md
│   │                           + screenshots/ into a ZIP and triggers browser download
│   ├── highlight.ts            Light-DOM highlight box for hovered/selected element
│   ├── idb.ts                  createIdb(namespace) — namespaced IndexedDB wrapper;
│   │                           DB v2 migration ladder; SSR-safe no-op fallback
│   ├── selector.ts             CSS selector generation from DOM elements
│   ├── storage.ts              createStorage(namespace) — namespaced localStorage
│   │                           wrapper; in-memory Map fallback
│   ├── strings.ts              QaBilingual resolution helpers
│   └── styles.ts               Shadow DOM style injection + theme CSS var application
│
├── icons/
│   └── Icon.tsx                Lucide-derived SVG icon set (ISC license)
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
    │   ├── detectTheme.ts      Tailwind config + CSS file colour extractor
    │   └── detectCredentials.ts .env.example + seeder file scanner (safe sources only)
    │
    ├── generators/
    │   ├── genConfig.ts        qa.config.js / qa.config.ts text generator
    │   └── genPreamble.ts      qa.preamble.md text generator
    │
    └── artifacts/
        ├── SKILL.md            Claude Code agent skill (bundled as a text constant)
        └── AGENTS_SECTION.md   AGENTS.md qapture section (bundled as a text constant)
```
