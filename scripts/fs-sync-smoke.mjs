// Folder-sync smoke (v0.4): esbuild-bundles src/lib/fsSync.ts to a temp
// Node-runnable ESM file (same approach as export-smoke / capture-timeout-smoke)
// and drives the whole "save every note to a folder" flow against an in-memory
// fake of the File System Access API.
//
// This is the feature with the most invisible failure modes — a wrong path
// segment, an orphaned file after an edit, a campaign.json that loses its
// numbering across a reload — and none of them throw. They just quietly
// produce a folder that isn't what the tester was promised. So the assertions
// below check the actual tree that ends up on "disk", not just that the calls
// resolved.
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE_DIR = join(ROOT, 'dist', '_fs_sync_smoke');
const OUT = join(BUNDLE_DIR, 'fsSync.mjs');

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok   - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

// ---------------------------------------------------------------------------
// In-memory File System Access API
// ---------------------------------------------------------------------------

function makeDir(name) {
  const dirs = new Map();
  const files = new Map();
  return {
    name,
    kind: 'directory',
    _dirs: dirs,
    _files: files,
    async getDirectoryHandle(child, opts) {
      if (!dirs.has(child)) {
        if (!opts?.create) { const e = new Error('NotFound'); e.name = 'NotFoundError'; throw e; }
        dirs.set(child, makeDir(child));
      }
      return dirs.get(child);
    },
    async getFileHandle(child, opts) {
      if (!files.has(child)) {
        if (!opts?.create) { const e = new Error('NotFound'); e.name = 'NotFoundError'; throw e; }
        files.set(child, { name: child, data: '' });
      }
      const entry = files.get(child);
      return {
        name: child,
        async getFile() {
          return { text: async () => (typeof entry.data === 'string' ? entry.data : '') };
        },
        async createWritable() {
          return {
            async write(data) { entry.data = data; },
            async close() {},
          };
        },
      };
    },
    async removeEntry(child) {
      if (!files.delete(child) && !dirs.delete(child)) {
        const e = new Error('NotFound'); e.name = 'NotFoundError'; throw e;
      }
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
}

function makeStore() {
  const map = new Map();
  return {
    async getMeta(key) { return map.get(key); },
    async setMeta(key, value) { map.set(key, value); return true; },
    async deleteMeta(key) { map.delete(key); },
  };
}

const note = (over = {}) => ({
  id: 'n1',
  url: 'http://localhost/checkout',
  route: '/checkout',
  timestamp: '2026-08-14T10:00:00.000Z',
  description: 'Place order button stays enabled with an empty address',
  severity: 'bug',
  status: 'open',
  target: {
    kind: 'element',
    selector: 'button[aria-label="Place order"]',
    tagName: 'button',
    rect: { top: 10, left: 20, width: 100, height: 40 },
  },
  ...over,
});

mkdirSync(BUNDLE_DIR, { recursive: true });

try {
  execSync(
    `npx esbuild ${JSON.stringify(join(ROOT, 'src/lib/fsSync.ts'))} --bundle --platform=node --format=esm --outfile=${JSON.stringify(OUT)} --log-level=error`,
    { stdio: 'inherit' },
  );

  const fs = await import(pathToFileURL(OUT).href);

  // ── Path-segment safety ────────────────────────────────────────────────
  ok(fs.safeSegment('Project X') === 'Project X', 'safeSegment keeps spaces ("Project X")');
  ok(fs.safeSegment('a/b:c*d?e"f<g>h|i') === 'a-b-c-d-e-f-g-h-i', 'safeSegment replaces every reserved character');
  ok(fs.safeSegment('trailing dot.') === 'trailing dot', 'safeSegment strips a trailing dot (illegal on Windows)');
  ok(fs.safeSegment('') === 'untitled', 'safeSegment falls back for an empty name');
  ok(fs.safeSegment('CON') === 'CON-qa', 'safeSegment escapes the Windows device name CON');
  ok(/^\d{4}-\d{2}-\d{2} \d{4}$/.test(fs.defaultCampaignName(new Date('2026-08-14T14:32:00Z'))),
    `defaultCampaignName is sortable (got "${fs.defaultCampaignName(new Date('2026-08-14T14:32:00Z'))}")`);

  // ── Wire up the fake browser ───────────────────────────────────────────
  const root = makeDir('QA');
  globalThis.window = { showDirectoryPicker: async () => root };
  const store = makeStore();

  ok(fs.isFsSyncSupported() === true, 'isFsSyncSupported() true once showDirectoryPicker exists');
  ok(await fs.chooseFsSyncRoot(store) === true, 'chooseFsSyncRoot() accepts the picked folder');
  ok(fs.getFsSyncState() === 'connected', `state is "connected" after picking (got "${fs.getFsSyncState()}")`);
  ok((await store.getMeta('fsSyncRoot')) === root, 'the chosen folder handle is persisted for next session');

  // ── Open a campaign ────────────────────────────────────────────────────
  ok(await fs.openFsCampaign({ project: 'Project X', campaign: '2026-08-14 smoke', tester: 'Mo' }) === true,
    'openFsCampaign() creates the project/campaign folders');
  ok(fs.getFsSyncState() === 'syncing', 'state is "syncing" once a campaign is open');
  ok(fs.getFsSyncPath() === 'QA/Project X/2026-08-14 smoke', `path reads back as the real tree (got "${fs.getFsSyncPath()}")`);

  const project = root._dirs.get('Project X');
  ok(!!project, 'a folder named after the project exists under the root');
  const campaignDir = project._dirs.get('2026-08-14 smoke');
  ok(!!campaignDir, 'a folder named after the campaign exists under the project');
  ok(campaignDir._dirs.has('notes') && campaignDir._dirs.has('screenshots'),
    'the campaign folder has notes/ and screenshots/');

  // ── Write a note with a screenshot ─────────────────────────────────────
  const shot = new Blob(['fake-webp-bytes'], { type: 'image/webp' });
  const n1 = note({ screenshot: shot });
  ok(await fs.syncNoteToDisk(n1, [n1]) === true, 'syncNoteToDisk() writes the note');

  const notesDir = campaignDir._dirs.get('notes');
  const shotsDir = campaignDir._dirs.get('screenshots');
  const firstFile = [...notesDir._files.keys()][0];
  ok(notesDir._files.size === 1, `exactly one note file was written (found ${notesDir._files.size})`);
  ok(firstFile === '0001-place-order-button-stays-enabled-with-an-empty.md',
    `note filename is numbered + slugged (got "${firstFile}")`);
  ok([...shotsDir._files.keys()][0] === '0001-place-order-button-stays-enabled-with-an-empty.webp',
    'the screenshot uses the same base name and the blob\'s real extension (.webp, not .png)');
  ok(notesDir._files.get(firstFile).data.includes('Place order button stays enabled'),
    'the note file contains the tester\'s own words');
  ok(notesDir._files.get(firstFile).data.includes('../screenshots/'),
    'the note file points at its screenshot');

  // ── Campaign metadata + live report ────────────────────────────────────
  const meta = JSON.parse(campaignDir._files.get('campaign.json').data);
  ok(meta.project === 'Project X' && meta.campaign === '2026-08-14 smoke' && meta.tester === 'Mo',
    'campaign.json records project, campaign and tester');
  ok(meta.noteCount === 1 && meta.notes.n1.seq === 1, 'campaign.json indexes the note by id with its sequence');

  const report = campaignDir._files.get('REPORT.md').data;
  ok(report.includes('# Project X — 2026-08-14 smoke'), 'REPORT.md is titled with project and campaign');
  ok(report.includes('Tester: Mo'), 'REPORT.md names the tester');
  ok(report.includes('1 bug'), 'REPORT.md summarises the findings by severity');
  ok(report.includes('Place order button stays enabled'), 'REPORT.md carries the note body');

  // ── Editing a note must not orphan its old file ────────────────────────
  const edited = note({ description: 'Renamed after an edit', screenshot: shot });
  ok(await fs.syncNoteToDisk(edited, [edited]) === true, 'syncNoteToDisk() accepts an edited note');
  ok(notesDir._files.size === 1, `an edit rewrites in place instead of leaving two files (found ${notesDir._files.size})`);
  ok([...notesDir._files.keys()][0] === '0001-renamed-after-an-edit.md',
    `the file is renamed to match the new text (got "${[...notesDir._files.keys()][0]}")`);
  ok(shotsDir._files.size === 1, 'the stale screenshot was cleaned up too');
  ok(JSON.parse(campaignDir._files.get('campaign.json').data).notes.n1.seq === 1,
    'the note keeps its original sequence number across an edit');

  // ── Resuming an existing campaign folder ───────────────────────────────
  fs.closeFsCampaign();
  ok(fs.getFsSyncState() === 'connected', 'closeFsCampaign() returns to "connected"');
  await fs.openFsCampaign({ project: 'Project X', campaign: '2026-08-14 smoke' });
  const n2 = note({ id: 'n2', description: 'Second finding' });
  await fs.syncNoteToDisk(n2, [n2, edited]);
  ok(JSON.parse(campaignDir._files.get('campaign.json').data).notes.n2.seq === 2,
    're-opening the same campaign continues the numbering instead of restarting at 1');

  // ── Deleting ───────────────────────────────────────────────────────────
  ok(await fs.removeNoteFromDisk('n2', [edited]) === true, 'removeNoteFromDisk() reports success');
  ok(notesDir._files.size === 1, `the deleted note's file is gone (found ${notesDir._files.size})`);
  ok(!JSON.parse(campaignDir._files.get('campaign.json').data).notes.n2,
    'the deleted note is dropped from the campaign index');

  // ── The download engine (Safari, Firefox, phones) ──────────────────────
  // Same feature, no picker: the campaign is bookkept in memory and delivered
  // as a folder-shaped ZIP. What matters here is that removing the picker does
  // NOT disable the feature — it used to leave the tester with nothing.
  {
    const savedWindow = globalThis.window;
    globalThis.window = {};                     // no showDirectoryPicker
    globalThis.document = { createElement: () => ({ click() {}, remove() {} }) };
    // JSZip reads Blob inputs through FileReader, which browsers have and Node
    // does not. The product code hands JSZip Blobs exactly as the ZIP export
    // has always done, so shim the missing browser API rather than weaken it.
    if (typeof globalThis.FileReader === 'undefined') {
      globalThis.FileReader = class {
        readAsArrayBuffer(blob) {
          blob.arrayBuffer().then(
            (buf) => { this.result = buf; this.onload?.({ target: this }); },
            (err) => { this.error = err; this.onerror?.({ target: this }); },
          );
        }
      };
    }
    const zipStore = makeStore();

    ok(fs.isFsSyncSupported() === false, 'no picker here, so live disk writing is off');
    ok(fs.isFsSyncAvailable() === true, 'but folder saving is still AVAILABLE (this is the Safari fix)');
    ok(fs.getFsSyncEngine() === 'download', 'and it runs on the download engine');

    await fs.restoreFsSync(zipStore);
    ok(fs.getFsSyncState() === 'connected',
      'it needs no folder to be picked — it is ready immediately');

    ok(await fs.openFsCampaign({ project: 'Project Z', campaign: 'safari run' }) === true,
      'a campaign opens with no filesystem at all');
    ok(fs.getFsSyncState() === 'syncing', 'and it reports as syncing');

    const zn = note({ id: 'z1', description: 'Safari finding', screenshot: shot });
    ok(await fs.syncNoteToDisk(zn, [zn]) === true, 'notes are accepted');
    const persisted = await zipStore.getMeta('fsSyncCampaign');
    ok(!!persisted && persisted.notes.z1.seq === 1,
      'the campaign + numbering is persisted, so a reload does not renumber');
    ok(persisted.notes.z1.file === '0001-safari-finding.md',
      `filenames match the disk engine exactly (got "${persisted.notes.z1.file}")`);
    ok(persisted.notes.z1.shot === '0001-safari-finding.webp',
      'screenshots keep the same base name and real extension');

    ok(fs.getFsSyncPath() === 'Project Z/safari run',
      `the reported path is the tree inside the zip (got "${fs.getFsSyncPath()}")`);
    ok(fs.campaignZipFileName() === 'Project Z - safari run.zip',
      `the zip is named for the campaign, not timestamped (got "${fs.campaignZipFileName()}")`);

    // Resuming after a reload must continue, not restart.
    fs.closeFsCampaign();
    await fs.openFsCampaign({ project: 'Project Z', campaign: 'safari run' });
    const zn2 = note({ id: 'z2', description: 'Second safari finding' });
    await fs.syncNoteToDisk(zn2, [zn2, zn]);
    const after = await zipStore.getMeta('fsSyncCampaign');
    ok(after.notes.z2.seq === 2, 'reopening the same campaign continues the numbering');

    // The actual deliverable: a ZIP whose INTERNAL PATHS are the folder tree.
    // If these paths are wrong the tester unzips a mess into their QA folder,
    // and nothing else in this file would notice.
    const blob = await fs.buildCampaignZipBlob([zn2, zn]);
    ok(!!blob && blob.size > 0, `buildCampaignZipBlob() produces an archive (${fs.getFsSyncError() || 'no error'})`);
    if (blob) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
      const paths = Object.keys(zip.files).filter((f) => !zip.files[f].dir).sort();
      const want = [
        'Project Z/safari run/REPORT.md',
        'Project Z/safari run/campaign.json',
        'Project Z/safari run/notes/0001-safari-finding.md',
        'Project Z/safari run/notes/0002-second-safari-finding.md',
        'Project Z/safari run/screenshots/0001-safari-finding.webp',
      ];
      for (const w of want) {
        ok(paths.includes(w), `the zip contains ${w}`);
      }
      const report = await zip.file('Project Z/safari run/REPORT.md').async('string');
      ok(report.includes('Project Z') && report.includes('Safari finding'),
        'REPORT.md inside the zip is the real campaign report');
    }

    globalThis.window = savedWindow;
    delete globalThis.document;
    delete globalThis.FileReader;
  }

  // ── Disconnecting ──────────────────────────────────────────────────────
  await fs.disconnectFsSync(store);
  ok(fs.getFsSyncState() === 'off', 'disconnectFsSync() stops syncing');
  ok((await store.getMeta('fsSyncRoot')) === undefined, 'the remembered folder handle is forgotten');
  ok(notesDir._files.size === 1, 'disconnecting leaves everything already written on disk untouched');
} finally {
  rmSync(BUNDLE_DIR, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\nFS SYNC SMOKE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nFS SYNC SMOKE PASS ✅');
