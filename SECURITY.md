# Security Policy

## Security model

Qapture is designed to have a minimal threat surface by construction.

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
