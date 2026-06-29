# QA Studio

> Drop-in, **AI-aware**, 100% client-side QA capture widget — and it ships **zero AI**.

A human tester walks your live web app, captures points (click an element or drag a
region → auto-screenshot + note), follows a **graded testing journey** (🔴 red / 🟡 amber /
🟢 green risk zones), and exports a ZIP. That ZIP leads with an **induction preamble** your
**own** terminal coding agent (Claude Code, Cursor, …) reads so it acts as if it already
knows your project — locating the code from each point's selector + screenshot, making the
change, verifying it, and grading coverage against the red zones.

We never bundle a model, never ship API keys, never make a network call. The widget is
keyless and secretless; setup is a deterministic (non-AI) scaffolder. The AI is **yours**.

```bash
npm i qa-studio
```

```tsx
import { QaStudio } from 'qa-studio';
import config from './qa.config';

// dev-only by default; opt into production with config.alwaysVisible
<QaStudio config={config} />
```

Scaffold config + the agent skill/markdown artifacts into any repo:

```bash
npx qa-studio init
```

**Status:** under active construction (see the build plan). Not yet published.

## Highlights
- **Shadow-DOM isolated** — drops into any project, even ones with no Tailwind; host CSS can't break it and it can't leak into the host.
- **No heavy deps** — peer-depends React; `jszip`/`html2canvas` load lazily only when used.
- **SSR-safe** — renders nothing on the server (`qa-studio/next` for the App Router).
- **Config-driven** — one `qa.config` carries theme, dev/test logins, and the graded journey. Runs with an empty config.
- **Private by construction** — data stays in the tester's browser (IndexedDB) until they export.

## License
MIT. Icon path data derived from [Lucide](https://lucide.dev) (ISC).
