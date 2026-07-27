# Security Policy

## Security model

Qapture is designed to have a minimal threat surface by construction. (The one
new capability v0.3.0 "Graphite" adds — runtime context capture — expands
that surface slightly; it is documented below with explicit guarantees, not
just mentioned in passing. See [Runtime context capture](#runtime-context-capture).)

### Zero AI, zero network, zero keys

Qapture ships no AI model, makes no network calls, and requires no API keys. The widget is entirely self-contained: all code runs in the browser, all data lives in the browser.

There is no:
- Telemetry or usage analytics
- Remote logging or error reporting
- External CDN dependency at runtime
- Model API call or AI provider credential
- Webhook, callback URL, or server-side component

### Data stays in the browser

Captured notes and screenshots are stored exclusively in the tester's browser:

- **IndexedDB** — notes stored in `${namespace}-db` (object stores: `notes`, `meta`)
- **localStorage** — UI state stored under keys prefixed `${namespace}:`

No data is transmitted anywhere. Data leaves the browser **only** when the tester explicitly clicks Export, which generates a local ZIP download. No automatic upload occurs.

### Runtime context capture

**New in v0.3.0 "Graphite".** `src/lib/contextBuffer.ts` wraps `console.error`,
`console.warn`, the window `error`/`unhandledrejection` events, `fetch`, and
`XMLHttpRequest` so that every captured note can carry the runtime facts
around it — the console error and the failed request that happened moments
before the tester clicked capture, not just their own description of "the
button does nothing."

**This is a real new privacy surface, and it is called out here explicitly —
not just mentioned in passing:** the recorded events, plus a one-time
environment snapshot (viewport, browser language, timezone, online state,
optional page-load timing and JS heap size), are attached to the note's
`context` field and **ship inside the ZIP the tester exports** — embedded in
`notes.md` for every point, and in the "Copy as agent prompt" clipboard text
for a single note. Nothing here is transmitted over the network; it travels
exactly like the rest of a note (in-browser until export), but it is *new
content* that previous versions never collected, so it gets its own section
rather than a footnote.

**Guarantees (read the source, not this summary, if you need to verify them —
they live in `src/lib/contextBuffer.ts`):**

- **Query strings are redacted from every recorded URL.** `redactUrl()` keeps
  only the origin + pathname of any `fetch`/`XMLHttpRequest` URL (and of
  `location.href` in the environment snapshot) and replaces a present query
  string with a literal `?…` marker. Access tokens, session ids, and
  password-reset codes that routinely travel in query strings are never
  recorded, full stop.
- **Request/response bodies and headers are never read or stored.** The
  `fetch`/XHR wrappers observe only method, the (already redacted) URL, HTTP
  status, duration, and — on failure — a short error string. They never touch
  a `Request`/`Response` body or any header, so an `Authorization` header or a
  JSON payload containing PII cannot end up in the buffer.
- **No cookie, storage, or form value is ever touched.** The module never
  reads `document.cookie`, `localStorage`, `sessionStorage`, or any form/input
  value. Its entire capture surface is: console output, uncaught
  errors/unhandled rejections, and network *metadata* as described above.
- **The ring buffer is capped at 75 events** (`RING_CAP` in `contextBuffer.ts`).
  Once full, the oldest events are dropped first, so a session left open for
  hours cannot grow the buffer without bound. Individual console messages and
  the captured-element HTML snippet used for forensics are separately capped
  at roughly 600 characters each, so one giant log line or a huge DOM subtree
  can't dominate a note.
- **Install/uninstall is symmetric and idempotent.** `uninstallContextCapture()`
  restores every wrapped global exactly (`console.error`/`warn`, `fetch`,
  `XMLHttpRequest.prototype.open`/`send`, the `error`/`unhandledrejection`
  listeners) and clears the buffer; calling install twice never double-wraps.

**Per-element forensics** (`collectTargetForensics()`) — collected only for
the specific element the tester clicked or drew a region around, not the rest
of the page — is limited to a truncated, escaped `outerHTML` snippet (~600
chars), a handful of computed style properties (`display`, `position`,
`overflow`, `z-index`, `font-size`, `color`, `background-color`), and coarse
accessibility facts (has an accessible name, is tab-reachable, a rough
contrast flag). None of this reads page content outside that one element.

**How to disable it entirely** — set `captureContext: false` in your
`qa.config`:

```ts
const config: QaConfig = {
  captureContext: false,
};
```

With this set, `installContextCapture()` is never called at mount (no global
is ever wrapped), and `QaContext.addNote()` skips context assembly for every
note. No console/network history and no environment snapshot is collected or
attached, regardless of what happens on the page during the session.

### Credentials: DEV / TEST / SEED only

The `credentials` config field is intended strictly for DEV, TEST, and SEED environments. These values are displayed in the Credentials tab and embedded in the export preamble so the receiving agent can log in during fix verification.

**Never include production credentials** in `qa.config.*`. Qapture cannot enforce this at runtime, but the tool's design (local-only, no network) means configured credentials are never transmitted anywhere — they exist only in the browser memory and the locally downloaded ZIP.

The agent skill (`SKILL.md`) and `AGENTS.md` explicitly instruct any receiving agent to treat Login Context values as DEV/TEST/SEED only and to never log, commit, forward, or use them in production.

### CLI secret guard

The `npx qapture init` CLI is a **purely deterministic, regex-only scaffolder**. It uses text analysis only — it never `require()`s or `eval()`s target project files. Every file read is gated through a hard path blocklist (`src/bin/utils/secretGuard.ts`) before opening.

**Always blocked:**

| Category | Examples |
|---|---|
| Real `.env` files | `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`, `.env.staging`, `.env.ci`, `.env.preview`, `.env.override` |
| Certificate / key files | `.pem`, `.key`, `.pfx`, `.p12`, `.crt`, `.der`, `.p8`, `.jks`, `.keystore`, `.secret` |
| Secret-named files | `credentials.*`, `secrets.*`, `private_key.*`, `service-account.*`, `keyfile.*`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `.netrc`, `.pgpass` |
| Sensitive path segments | `/secrets/`, `/.secrets/`, `/private/`, `/certs/`, `/certificates/`, `/keys/`, `/credentials/` |

**Always allowed:**

- `.env.example` and `.env.example.*` variants (by fast-allow rule, before any other check)
- Seeder / seed files (handled separately in `detectCredentials.ts`)

The blocklist is consulted before every file access in the detectors. The guard function only inspects the **path string** — it never opens the file to check its contents.

### No telemetry

Qapture collects zero telemetry. There is no usage tracking, crash reporting, heartbeat ping, or install notification. No opt-out is required because there is nothing to opt out of.

---

## Supported versions

Qapture is currently pre-1.0 and under active development. Security fixes are applied to the latest published version.

---

## Reporting a vulnerability

If you discover a security issue, please report it **privately** rather than opening a public GitHub issue, to allow time for a fix before public disclosure.

**Preferred channel:** Open a private security advisory via the repository's **Security** tab (Security → Report a vulnerability).

**Alternative:** Email the maintainers directly. The contact address is listed in the repository's `package.json` or the GitHub profile.

Please include in your report:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce (minimal reproduction preferred)
- Any relevant code, configuration, or proof-of-concept

We aim to:
- Acknowledge the report within **48 hours**
- Confirm or dismiss the issue within **7 days**
- Provide a fix or documented mitigation within **14 days** of confirmation

Please do not publish details of the vulnerability until a fix has been released and coordinated with you.
