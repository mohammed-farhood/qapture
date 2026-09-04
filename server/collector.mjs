/**
 * collector.mjs — where notes land when nobody exports a zip.
 *
 * WHAT THIS IS FOR
 * ----------------
 * Everything before this depended on a client remembering to press Export and
 * then send you a file. That is one step too many. They test on Sunday, they
 * mean to send it, and it never arrives — so the tool only works for people
 * disciplined enough not to need it.
 *
 * This removes the step. The widget posts each note as it is written, and the
 * notes land on disk in a shape you can read without any tooling:
 *
 *   data/<project>/<campaign>/
 *     ├── README.md              the whole campaign, newest first
 *     ├── notes/<id>.json        one note, exactly as captured
 *     └── shots/<id>.webp        its screenshot
 *
 * A folder per client, a folder per round of testing. `ls` tells you who
 * reported what. Nothing to query, nothing to back up but a directory, and if
 * this program is deleted tomorrow the notes are all still readable.
 *
 * DESIGN RULES, AND WHY
 * ---------------------
 *  • No database. The value here is durability and legibility, not queries.
 *  • No dependencies. Node's standard library only, so there is nothing to
 *    audit, nothing to update, and no supply chain on a box holding client
 *    data.
 *  • Write-mostly. This accepts notes and lists them. It is deliberately not
 *    an admin panel — every extra endpoint is another way in.
 *
 * SECURITY, PLAINLY
 * -----------------
 * This holds other people's screenshots of their own systems, so:
 *  • every project has its own token; a client site can only write to its own
 *    project, and cannot read anything at all;
 *  • reading requires a separate admin token that never ships to a browser;
 *  • bodies are capped, ids are sanitised, and paths are resolved and checked
 *    to stay inside the data directory;
 *  • it binds to localhost by default and expects a reverse proxy to hold the
 *    TLS certificate. Do not expose this port directly.
 *
 * There is no user accounts system and there should not be. Tokens in a config
 * file are the right size of answer for a handful of client sites, and a login
 * system would be a bigger attack surface than the thing it protects.
 */

import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const PORT = Number(process.env.QA_PORT || 8787);
const HOST = process.env.QA_HOST || '127.0.0.1';
const DATA = resolve(process.env.QA_DATA || './data');
const CONFIG = resolve(process.env.QA_CONFIG || './collector.config.json');

/** Cap on one posted note. A screenshot rides in it as base64. */
const MAX_BODY = 12 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * {
 *   "adminToken": "…",
 *   "projects": { "acme-dental": { "token": "…", "label": "Acme Dental" } }
 * }
 */
async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG, 'utf8'));
  } catch {
    console.error(`[qa] cannot read ${CONFIG} — refusing to start.`);
    console.error('[qa] a collector with no tokens would accept anything from anyone.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

/**
 * Reduce anything a client sends to a safe single path segment.
 *
 * The threat is not exotic: a project id of `../../etc` would otherwise write
 * outside the data directory. Everything that is not a letter, digit, dash or
 * underscore becomes a dash, and the result is length-capped.
 */
function safeSegment(value, fallback = 'unknown') {
  const clean = String(value ?? '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return clean || fallback;
}

/**
 * Resolve a path and prove it stayed inside DATA.
 *
 * Belt and braces over safeSegment: sanitising input is the first defence and
 * checking the result is the one that has to hold when the first is wrong.
 */
function insideData(...parts) {
  const full = resolve(join(DATA, ...parts));
  if (full !== DATA && !full.startsWith(DATA + sep)) {
    throw new Error('path escaped the data directory');
  }
  return full;
}

/** Constant-time-ish compare, so a token cannot be guessed a byte at a time. */
function tokensMatch(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function bearer(req) {
  const raw = req.headers.authorization || '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((res, rej) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { rej(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

/**
 * Rewrite the campaign's README from the notes on disk.
 *
 * Rebuilt from the directory rather than appended to, so it can never drift
 * from what is actually stored, and a half-written note cannot corrupt it.
 */
async function rebuildReadme(dir, projectLabel, campaign) {
  const notesDir = join(dir, 'notes');
  let files = [];
  try { files = (await readdir(notesDir)).filter((f) => f.endsWith('.json')); } catch { /* none yet */ }

  const notes = [];
  for (const f of files) {
    try { notes.push(JSON.parse(await readFile(join(notesDir, f), 'utf8'))); } catch { /* skip a bad file */ }
  }
  notes.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));

  const lines = [
    `# ${projectLabel} — ${campaign}`,
    '',
    `${notes.length} note(s). Newest first. Rebuilt on every arrival.`,
    '',
    '---',
    '',
  ];
  for (const n of notes) {
    lines.push(`## ${n.at ?? '?'} — ${n.route ?? '/'}`);
    lines.push('');
    if (n.tester) lines.push(`- **Tester:** ${n.tester}`);
    if (n.severity) lines.push(`- **Severity:** ${n.severity}`);
    if (n.shot) lines.push(`- **Screenshot:** shots/${n.id}.${n.shotExt ?? 'webp'}`);
    lines.push('');
    lines.push('### Observed');
    lines.push('');
    lines.push(n.description || '_(not described)_');
    lines.push('');
    lines.push('### Expected');
    lines.push('');
    lines.push(n.wanted || '_(not given — ask rather than assume)_');
    if (n.why) { lines.push(''); lines.push('### Why it matters'); lines.push(''); lines.push(n.why); }
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  await writeFile(join(dir, 'README.md'), lines.join('\n'), 'utf8');
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const config = await loadConfig();
if (!config.adminToken || String(config.adminToken).length < 24) {
  console.error('[qa] adminToken must be at least 24 characters. Refusing to start.');
  process.exit(1);
}
await mkdir(DATA, { recursive: true });

const server = createServer(async (req, res) => {
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, {
      'content-type': type,
      // A client site posts from its own origin; nothing here is readable
      // cross-origin without a token anyway, but the note endpoint has to be
      // reachable from the browser that captured it.
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'POST,OPTIONS',
      'x-content-type-options': 'nosniff',
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  try {
    if (req.method === 'OPTIONS') return send(204, '');

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      return send(200, { ok: true });
    }

    // ── Receiving a note ────────────────────────────────────────────────────
    if (req.method === 'POST' && url.pathname === '/notes') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return send(400, { error: 'bad json' }); }

      const projectId = safeSegment(body.project);
      const project = config.projects?.[projectId];
      if (!project) return send(404, { error: 'unknown project' });
      if (!tokensMatch(bearer(req), project.token)) return send(401, { error: 'bad token' });

      const campaign = safeSegment(body.campaign, 'default');
      const id = safeSegment(body.id, String(Date.now()));
      const dir = insideData(projectId, campaign);
      await mkdir(join(dir, 'notes'), { recursive: true });

      // The screenshot is stored beside the note, not inside it: a folder of
      // 4MB JSON files is unreadable, and a folder of images is not.
      let shotExt;
      if (typeof body.shot === 'string' && body.shot.startsWith('data:image/')) {
        const match = /^data:image\/(png|webp|jpeg);base64,(.+)$/s.exec(body.shot);
        if (match) {
          shotExt = match[1] === 'jpeg' ? 'jpg' : match[1];
          await mkdir(join(dir, 'shots'), { recursive: true });
          await writeFile(insideData(projectId, campaign, 'shots', `${id}.${shotExt}`),
            Buffer.from(match[2], 'base64'));
        }
      }

      const note = {
        id,
        at: new Date().toISOString(),
        project: projectId,
        campaign,
        tester: typeof body.tester === 'string' ? body.tester.slice(0, 120) : undefined,
        route: typeof body.route === 'string' ? body.route.slice(0, 500) : undefined,
        description: typeof body.description === 'string' ? body.description.slice(0, 5000) : '',
        wanted: typeof body.wanted === 'string' ? body.wanted.slice(0, 5000) : '',
        why: typeof body.why === 'string' ? body.why.slice(0, 2000) : '',
        severity: ['bug', 'design', 'enhance'].includes(body.severity) ? body.severity : undefined,
        origin: body.origin && typeof body.origin === 'object' ? body.origin : undefined,
        shot: !!shotExt,
        shotExt,
      };

      await writeFile(insideData(projectId, campaign, 'notes', `${id}.json`),
        JSON.stringify(note, null, 2), 'utf8');
      await rebuildReadme(dir, project.label || projectId, campaign);

      console.log(`[qa] ${projectId}/${campaign} ← note ${id}`);
      return send(201, { ok: true, id });
    }

    // ── Listing, for you only ───────────────────────────────────────────────
    if (req.method === 'GET' && url.pathname === '/projects') {
      if (!tokensMatch(bearer(req), config.adminToken)) return send(401, { error: 'bad token' });
      const out = [];
      for (const projectId of Object.keys(config.projects ?? {})) {
        const dir = insideData(projectId);
        if (!existsSync(dir)) { out.push({ project: projectId, campaigns: [] }); continue; }
        const campaigns = [];
        for (const c of await readdir(dir)) {
          const notesDir = join(dir, c, 'notes');
          let count = 0;
          let last = null;
          try {
            const files = (await readdir(notesDir)).filter((f) => f.endsWith('.json'));
            count = files.length;
            for (const f of files) {
              const s = await stat(join(notesDir, f));
              if (!last || s.mtimeMs > last) last = s.mtimeMs;
            }
          } catch { /* not a campaign directory */ }
          if (count) campaigns.push({ campaign: c, notes: count, last: last && new Date(last).toISOString() });
        }
        out.push({ project: projectId, label: config.projects[projectId].label, campaigns });
      }
      return send(200, out);
    }

    return send(404, { error: 'not found' });
  } catch (err) {
    console.error('[qa]', err?.message ?? err);
    // Never echo the error: it can carry a path, and a stranger learning the
    // layout of the disk is the first half of an attack.
    return send(500, { error: 'server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[qa] collector on http://${HOST}:${PORT}`);
  console.log(`[qa] data in ${DATA}`);
  console.log(`[qa] projects: ${Object.keys(config.projects ?? {}).join(', ') || '(none)'}`);
});
