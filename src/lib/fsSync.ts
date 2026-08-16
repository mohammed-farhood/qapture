/**
 * fsSync.ts — stream every note straight to a folder on the tester's disk.
 *
 * THE PROBLEM THIS SOLVES
 * ----------------------
 * Before v0.4 a testing session lived only in the browser's IndexedDB until
 * someone remembered to hit Export. Close the wrong tab, run out of quota,
 * clear site data, drop the laptop — the campaign was gone. "Export at the
 * end" is a backup strategy that only works if nothing goes wrong before the
 * end.
 *
 * So: the tester picks a QA folder ONCE, names a project and a campaign, and
 * from then on every saved note is written to disk the moment it is saved.
 *
 *   <chosen folder>/
 *     Project X/
 *       2026-08-14 smoke-test/
 *         REPORT.md            ← whole campaign, agent-ready, rewritten live
 *         campaign.json        ← metadata + the note→file index
 *         notes/0001-checkout-button-dead.md
 *         screenshots/0001-checkout-button-dead.webp
 *
 * Ten projects become ten folders, each holding its named campaigns, each
 * campaign readable without opening a browser. Export still works and is
 * unchanged — this is a second, always-on copy, not a replacement.
 *
 * TWO ENGINES (v0.7.1)
 * --------------------
 * Writing straight into a folder the tester picked is the File System Access
 * API, and that is Chromium desktop only. Safari has never shipped
 * showDirectoryPicker — only the Origin Private File System, a sandbox the
 * tester cannot see, which is useless for "give me my notes as files". Firefox
 * is the same, and so is every mobile browser.
 *
 * Until v0.7.1 that was where the feature stopped: Safari testers were shown
 * "use Export instead" and lost the whole idea. But the valuable part of
 * folder saving was never the live writing — it was the STRUCTURE. Ten
 * projects, each with named campaigns, each campaign a readable folder. That
 * part needs no privileged API at all.
 *
 * So there are two engines behind one feature:
 *
 *   'disk'     — Chromium. Every note is written the instant it is saved.
 *   'download' — everywhere else. The exact same tree is assembled in memory
 *                and handed over as a ZIP whose INTERNAL PATHS are
 *                `<Project>/<Campaign>/…`. Unzip it into the QA folder and the
 *                result is byte-for-byte the layout Chromium writes live.
 *
 * The download engine refreshes itself every few notes rather than waiting for
 * the tester to remember, so the crash-safety promise survives too — one
 * unzip behind instead of continuous, which is the honest maximum the platform
 * allows. Both engines share the naming, the sequence numbering, REPORT.md and
 * campaign.json, because they are the same feature.
 *
 * Deliberately NOT browser-sniffed: the engine is chosen by feature detection,
 * so if WebKit ever ships the picker, Safari silently upgrades to live writing
 * with no code change here.
 *
 * The chosen directory handle is stored in IndexedDB (it is a structured-
 * cloneable object, not a string, so localStorage cannot hold it). Browsers
 * intentionally drop write permission between sessions, so on the next visit
 * the tester gets a one-click "Reconnect" instead of picking the folder again.
 */

import type { QaNote } from '../context/QaContext';
import { noteToMarkdown } from './noteMarkdown';
import { shotExtension } from './capture';

// ---------------------------------------------------------------------------
// Minimal structural types for the File System Access API.
// Declared locally rather than relying on lib.dom, whose coverage of these
// still varies by TypeScript version.
// ---------------------------------------------------------------------------

type FsPermissionMode = 'read' | 'readwrite';
type FsPermissionState = 'granted' | 'denied' | 'prompt';

type FsWritable = {
  write(data: Blob | string | BufferSource): Promise<void>;
  close(): Promise<void>;
};

type FsFileHandle = {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FsWritable>;
};

type FsDirectoryHandle = {
  readonly name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(descriptor: { mode: FsPermissionMode }): Promise<FsPermissionState>;
  requestPermission?(descriptor: { mode: FsPermissionMode }): Promise<FsPermissionState>;
};

type DirectoryPicker = (options?: {
  id?: string;
  mode?: FsPermissionMode;
  startIn?: string;
}) => Promise<FsDirectoryHandle>;

/** Longest slug allowed in a note filename, before word-boundary trimming. */
const MAX_SLUG_LENGTH = 48;

/** IndexedDB `meta` key holding the tester's chosen root folder handle. */
export const FS_ROOT_META_KEY = 'fsSyncRoot';

/**
 * IndexedDB `meta` key holding the download engine's campaign state.
 *
 * The disk engine keeps this in campaign.json on disk and re-reads it when a
 * folder is re-opened. The download engine has nowhere to put it — a ZIP in
 * the Downloads folder cannot be read back — so it lives here instead. Without
 * it, a reload would restart numbering at 0001 and the next ZIP would disagree
 * with the previous one about which note is which.
 */
export const FS_CAMPAIGN_META_KEY = 'fsSyncCampaign';

/**
 * The subset of the IDB adapter this module needs. Passing it in (rather than
 * creating another connection) keeps one DB open per namespace.
 */
export type FsSyncStore = {
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<boolean>;
  deleteMeta(key: string): Promise<void>;
};

/**
 * How the campaign folder reaches the tester's disk.
 *
 * 'disk'     — written continuously, file by file, as each note is saved.
 * 'download' — assembled in memory and delivered as a folder-shaped ZIP.
 */
export type FsSyncEngine = 'disk' | 'download';

export type FsSyncState =
  /** Not in a browser at all (SSR). The download engine covers every browser. */
  | 'unsupported'
  /** Available, but no folder chosen / no campaign named yet. */
  | 'off'
  /** A folder is remembered but the browser dropped write permission. */
  | 'needs-permission'
  /** Folder chosen and writable, but no campaign opened yet. */
  | 'connected'
  /** Writing notes to disk right now. */
  | 'syncing'
  /** A write failed; the tester's notes are still safe in the browser. */
  | 'error';

export type FsCampaign = {
  project: string;
  campaign: string;
  tester?: string;
  startedAt: string;
};

type NoteIndexEntry = { seq: number; file: string; shot?: string; after?: string };

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let root: FsDirectoryHandle | null = null;
let campaignDir: FsDirectoryHandle | null = null;
let notesDir: FsDirectoryHandle | null = null;
let shotsDir: FsDirectoryHandle | null = null;
let campaign: FsCampaign | null = null;
let noteIndex: Record<string, NoteIndexEntry> = {};
let state: FsSyncState = 'unsupported';
let lastError = '';
/** Chosen by feature detection on first use, never by user-agent sniffing. */
let engine: FsSyncEngine = 'disk';
/**
 * The meta store, captured on restore/choose so the download engine can
 * persist its campaign without every call site having to pass it through.
 */
let metaStore: FsSyncStore | null = null;
/** True while syncAllToDisk() is mirroring — suppresses per-note report writes. */
let bulkWriting = false;

type Listener = () => void;
const listeners = new Set<Listener>();

function setState(next: FsSyncState, error = ''): void {
  if (state === next && lastError === error) return;
  state = next;
  lastError = error;
  for (const fn of listeners) {
    try { fn(); } catch { /* a broken subscriber must not break syncing */ }
  }
}

/** Subscribe to state changes. Returns an unsubscribe function. */
export function onFsSyncChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * True where notes can be written into a folder the tester picked, live.
 * Chromium desktop only — see the engine note at the top of this file.
 */
export function isFsSyncSupported(): boolean {
  return typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker === 'function';
}

/**
 * True where the feature is offered at all. Every browser qualifies: without
 * the picker the campaign is delivered as a folder-shaped ZIP instead.
 */
export function isFsSyncAvailable(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function getFsSyncEngine(): FsSyncEngine {
  return isFsSyncSupported() ? 'disk' : 'download';
}

export function getFsSyncState(): FsSyncState {
  if (!isFsSyncAvailable()) return 'unsupported';
  // The download engine has no folder to pick and no permission to lose, so
  // it is 'connected' from the start: all it needs is a campaign name.
  if (!isFsSyncSupported()) {
    if (state === 'syncing') return 'syncing';
    if (state === 'error') return 'error';
    return 'connected';
  }
  return state === 'unsupported' ? 'off' : state;
}

export function getFsSyncError(): string {
  return lastError;
}

export function getFsSyncCampaign(): FsCampaign | null {
  return campaign;
}

export function getFsSyncRootName(): string {
  return root?.name ?? '';
}

/** Human-readable "where notes are landing", for the panel. */
export function getFsSyncPath(): string {
  // The download engine has no root folder — the path it reports is the tree
  // the tester will find INSIDE the ZIP, which is the thing they care about.
  if (!root) {
    if (getFsSyncEngine() === 'download' && campaign) return campaignRelativePath();
    return '';
  }
  if (!campaign) return root.name;
  return `${root.name}/${campaignRelativePath()}`;
}

/** `Project X/2026-08-14 smoke` — the campaign's path under whatever root. */
function campaignRelativePath(): string {
  if (!campaign) return '';
  return `${safeSegment(campaign.project)}/${safeSegment(campaign.campaign)}`;
}

/**
 * Filename for the folder-shaped ZIP the download engine produces.
 *
 * Deliberately stable across a campaign rather than timestamped: the tester
 * wants "the latest copy of this campaign", and a browser that appends -2, -3
 * to repeated downloads already sorts the newest to the bottom. A timestamped
 * name would instead scatter one campaign across a dozen unrelated files.
 */
export function campaignZipFileName(): string {
  if (!campaign) return 'qa-campaign.zip';
  return `${safeSegment(campaign.project)} - ${safeSegment(campaign.campaign)}.zip`;
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Make a string safe as a single path segment on Windows, macOS and Linux.
 * Reserved characters, trailing dots/spaces and the Windows device names
 * (CON, PRN, NUL, COM1…) would all make getDirectoryHandle throw.
 */
export function safeSegment(input: string, fallback = 'untitled'): string {
  let s = (input ?? '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-');
  s = s.replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  s = s.slice(0, 60).trim();
  if (!s) return fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(s)) return `${s}-qa`;
  return s;
}

/**
 * Lowercase, dash-separated slug for a note's filename.
 *
 * Truncation cuts back to the last whole word rather than mid-syllable, so a
 * folder listing reads as a sentence fragment ("place-order-button-stays")
 * instead of a fragment plus a stray letter.
 */
function slugify(input: string, fallback = 'note'): string {
  let s = (input ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\\/:*?"<>|\u0000-\u001F\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (s.length > MAX_SLUG_LENGTH) {
    s = s.slice(0, MAX_SLUG_LENGTH);
    const lastWordBreak = s.lastIndexOf('-');
    if (lastWordBreak >= MAX_SLUG_LENGTH / 2) s = s.slice(0, lastWordBreak);
    s = s.replace(/-$/, '');
  }
  return s || fallback;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Default campaign name: `2026-08-14 1432` — sortable and unambiguous. */
export function defaultCampaignName(now: Date = new Date()): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

// ---------------------------------------------------------------------------
// Permission + root folder
// ---------------------------------------------------------------------------

async function permissionFor(handle: FsDirectoryHandle, request: boolean): Promise<FsPermissionState> {
  const descriptor = { mode: 'readwrite' as FsPermissionMode };
  try {
    if (request && typeof handle.requestPermission === 'function') {
      return await handle.requestPermission(descriptor);
    }
    if (typeof handle.queryPermission === 'function') {
      return await handle.queryPermission(descriptor);
    }
  } catch {
    return 'denied';
  }
  // No permission API on this handle: assume usable and let a write decide.
  return 'granted';
}

/**
 * Re-attach to the folder chosen in a previous session, if any.
 * Call once on mount. Never prompts — a browser that dropped the grant
 * lands in 'needs-permission' so the UI can offer a one-click Reconnect.
 */
export async function restoreFsSync(store: FsSyncStore): Promise<FsSyncState> {
  metaStore = store;
  engine = getFsSyncEngine();
  if (!isFsSyncAvailable()) { setState('unsupported'); return 'unsupported'; }

  // Download engine: nothing to re-permission, but the campaign and its note
  // numbering must survive the reload or the next ZIP renumbers everything.
  if (engine === 'download') {
    try {
      const saved = await store.getMeta<{ campaign: FsCampaign; notes: Record<string, NoteIndexEntry> }>(
        FS_CAMPAIGN_META_KEY,
      );
      if (saved?.campaign?.project) {
        campaign = saved.campaign;
        noteIndex = saved.notes ?? {};
        setState('syncing');
        return 'syncing';
      }
    } catch { /* fall through to a fresh start */ }
    setState('connected');
    return 'connected';
  }

  try {
    const saved = await store.getMeta<FsDirectoryHandle>(FS_ROOT_META_KEY);
    if (!saved || typeof saved.getDirectoryHandle !== 'function') {
      setState('off');
      return 'off';
    }
    root = saved;
    const perm = await permissionFor(saved, false);
    setState(perm === 'granted' ? 'connected' : 'needs-permission');
    return state;
  } catch {
    setState('off');
    return 'off';
  }
}

/**
 * Ask the tester to pick the QA folder. MUST be called from a user gesture.
 */
export async function chooseFsSyncRoot(store: FsSyncStore): Promise<boolean> {
  metaStore = store;
  // Download engine: there is no folder to choose. It is already "connected"
  // and only wants a campaign name, so report success and let the UI move on.
  if (!isFsSyncSupported()) { setState('connected'); return true; }
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  try {
    const handle = await picker({ id: 'qapture-qa', mode: 'readwrite', startIn: 'documents' });
    const perm = await permissionFor(handle, true);
    if (perm !== 'granted') { setState('needs-permission'); return false; }
    root = handle;
    campaignDir = notesDir = shotsDir = null;
    campaign = null;
    noteIndex = {};
    await store.setMeta(FS_ROOT_META_KEY, handle);
    setState('connected');
    return true;
  } catch (err) {
    // AbortError = the tester closed the picker. Not an error worth shouting.
    const name = (err as { name?: string })?.name;
    if (name === 'AbortError') return false;
    setState('error', describeError(err));
    return false;
  }
}

/** Re-request write permission on the remembered folder. Needs a gesture. */
export async function reconnectFsSync(): Promise<boolean> {
  if (!root) return false;
  const perm = await permissionFor(root, true);
  if (perm === 'granted') {
    setState(campaign ? 'syncing' : 'connected');
    return true;
  }
  setState('needs-permission');
  return false;
}

/** Forget the folder entirely (stops syncing; nothing on disk is touched). */
export async function disconnectFsSync(store: FsSyncStore): Promise<void> {
  root = null;
  campaignDir = notesDir = shotsDir = null;
  campaign = null;
  noteIndex = {};
  await store.deleteMeta(FS_ROOT_META_KEY);
  setState('off');
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

function describeError(err: unknown): string {
  const e = err as { name?: string; message?: string };
  if (e?.name === 'NotAllowedError') return 'permission';
  if (e?.name === 'QuotaExceededError') return 'disk-full';
  return e?.message || 'write-failed';
}

/**
 * Open (or re-open) a campaign folder under the chosen root.
 *
 * Re-opening an existing campaign folder rehydrates its note index from
 * campaign.json, so a tester who reloads mid-session keeps appending to the
 * same numbered sequence instead of starting a parallel one.
 */
export async function openFsCampaign(input: {
  project: string;
  campaign: string;
  tester?: string;
}): Promise<boolean> {
  // Download engine: the "folder" is a path inside a ZIP, so opening a
  // campaign is pure bookkeeping. Re-opening the same one keeps its numbering.
  if (getFsSyncEngine() === 'download') {
    const sameAsBefore =
      campaign?.project === input.project && campaign?.campaign === input.campaign;
    const startedAt = sameAsBefore && campaign ? campaign.startedAt : new Date().toISOString();
    if (!sameAsBefore) noteIndex = {};
    campaign = {
      project: input.project,
      campaign: input.campaign,
      tester: input.tester,
      startedAt,
    };
    await persistDownloadCampaign();
    setState('syncing');
    return true;
  }

  if (!root) return false;
  try {
    const perm = await permissionFor(root, false);
    if (perm !== 'granted') { setState('needs-permission'); return false; }

    const projectDir = await root.getDirectoryHandle(safeSegment(input.project, 'Project'), { create: true });
    const dir = await projectDir.getDirectoryHandle(
      safeSegment(input.campaign, defaultCampaignName()), { create: true },
    );
    campaignDir = dir;
    notesDir = await dir.getDirectoryHandle('notes', { create: true });
    shotsDir = await dir.getDirectoryHandle('screenshots', { create: true });

    campaign = {
      project: input.project,
      campaign: input.campaign,
      tester: input.tester,
      startedAt: new Date().toISOString(),
    };

    // Resume an existing folder rather than clobbering its numbering.
    noteIndex = {};
    try {
      const existing = await dir.getFileHandle('campaign.json');
      const text = await (await existing.getFile()).text();
      const parsed = JSON.parse(text) as { notes?: Record<string, NoteIndexEntry>; startedAt?: string };
      if (parsed?.notes && typeof parsed.notes === 'object') noteIndex = parsed.notes;
      if (parsed?.startedAt) campaign.startedAt = parsed.startedAt;
    } catch {
      // No campaign.json yet — a brand-new campaign folder.
    }

    setState('syncing');
    return true;
  } catch (err) {
    setState('error', describeError(err));
    return false;
  }
}

/** Stop writing to the current campaign (the folder stays on disk). */
export function closeFsCampaign(): void {
  campaignDir = notesDir = shotsDir = null;
  campaign = null;
  noteIndex = {};
  if (getFsSyncEngine() === 'download') {
    void metaStore?.deleteMeta(FS_CAMPAIGN_META_KEY);
    setState('connected');
    return;
  }
  if (root) setState('connected');
}

/**
 * Persist the download engine's campaign + note index.
 *
 * Best-effort: a failure here costs continuity of numbering after a reload,
 * never a note — those live in the notes store regardless.
 */
async function persistDownloadCampaign(): Promise<void> {
  if (!metaStore || !campaign) return;
  try {
    await metaStore.setMeta(FS_CAMPAIGN_META_KEY, { campaign, notes: noteIndex });
  } catch { /* numbering may restart after a reload; nothing is lost */ }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function writeFile(
  dir: FsDirectoryHandle,
  name: string,
  data: Blob | string,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
}

async function removeIfPresent(dir: FsDirectoryHandle | null, name: string | undefined): Promise<void> {
  if (!dir || !name) return;
  try { await dir.removeEntry(name); } catch { /* already gone */ }
}

function entryFor(note: QaNote): NoteIndexEntry {
  const existing = noteIndex[note.id];
  const seq = existing?.seq ?? Object.keys(noteIndex).length + 1;
  const base = `${pad4(seq)}-${slugify(note.description, 'note')}`;
  return {
    seq,
    file: `${base}.md`,
    shot: note.screenshot ? `${base}.${shotExtension(note.screenshot)}` : undefined,
    // v0.5: the re-test image lives beside its original, same base name, so
    // the pair sorts together in a file listing.
    after: note.afterScreenshot ? `${base}-after.${shotExtension(note.afterScreenshot)}` : undefined,
  };
}

/**
 * Write one note to disk: its Markdown, its screenshot, and a refreshed
 * campaign.json + REPORT.md.
 *
 * Called on every save/edit. Returns false when the write failed — the caller
 * surfaces that once; the note is still in the browser either way.
 */
export async function syncNoteToDisk(note: QaNote, allNotes: QaNote[]): Promise<boolean> {
  // Download engine: assign the note its place in the tree and stop. The files
  // themselves are generated at delivery time, so there is nothing to write
  // per note — which is exactly why this costs nothing to keep always-on.
  if (getFsSyncEngine() === 'download') {
    if (!campaign) return false;
    noteIndex[note.id] = entryFor(note);
    await persistDownloadCampaign();
    setState('syncing');
    return true;
  }

  if (!campaignDir || !notesDir || !shotsDir || !campaign) return false;
  try {
    const previous = noteIndex[note.id];
    const entry = entryFor(note);

    // An edited description changes the slug: drop the stale files so the
    // folder never accumulates two copies of the same note.
    if (previous && previous.file !== entry.file) await removeIfPresent(notesDir, previous.file);
    if (previous?.shot && previous.shot !== entry.shot) await removeIfPresent(shotsDir, previous.shot);
    if (previous?.after && previous.after !== entry.after) await removeIfPresent(shotsDir, previous.after);

    await writeFile(notesDir, entry.file, noteMarkdownForDisk(note, entry));
    if (note.screenshot && entry.shot) {
      await writeFile(shotsDir, entry.shot, note.screenshot);
    } else if (previous?.shot) {
      // Screenshot was removed during an edit.
      await removeIfPresent(shotsDir, previous.shot);
      entry.shot = undefined;
    }
    if (note.afterScreenshot && entry.after) {
      await writeFile(shotsDir, entry.after, note.afterScreenshot);
    }

    noteIndex[note.id] = entry;
    // During a bulk mirror the caller flushes once at the end — rewriting
    // REPORT.md per note would make importing an existing 100-note session
    // quadratic for no benefit.
    if (!bulkWriting) await flushCampaignFiles(allNotes);
    setState('syncing');
    return true;
  } catch (err) {
    setState('error', describeError(err));
    return false;
  }
}

/** Remove a deleted note's files and refresh the campaign index. */
export async function removeNoteFromDisk(noteId: string, allNotes: QaNote[]): Promise<boolean> {
  if (getFsSyncEngine() === 'download') {
    if (!noteIndex[noteId]) return true;
    delete noteIndex[noteId];
    await persistDownloadCampaign();
    return true;
  }
  if (!campaignDir || !notesDir || !shotsDir) return false;
  const entry = noteIndex[noteId];
  if (!entry) return true;
  try {
    await removeIfPresent(notesDir, entry.file);
    await removeIfPresent(shotsDir, entry.shot);
    await removeIfPresent(shotsDir, entry.after);
    delete noteIndex[noteId];
    await flushCampaignFiles(allNotes);
    return true;
  } catch (err) {
    setState('error', describeError(err));
    return false;
  }
}

function noteMarkdownForDisk(note: QaNote, entry: NoteIndexEntry): string {
  const body = noteToMarkdown(note, { index: entry.seq });
  const lines = [''];
  if (entry.shot) lines.push(`> Screenshot: ../screenshots/${entry.shot}`);
  if (entry.after) lines.push(`> After re-test: ../screenshots/${entry.after}`);
  return `${body}${lines.join('\n')}\n`;
}

/**
 * Rewrite campaign.json and REPORT.md.
 *
 * REPORT.md is the whole campaign in one agent-readable file — the same
 * per-note rendering the ZIP export uses — so the folder is useful to hand
 * over on its own, with or without a browser.
 */
async function flushCampaignFiles(allNotes: QaNote[]): Promise<void> {
  if (!campaignDir || !campaign) return;
  await writeFile(campaignDir, 'campaign.json', campaignJsonText(allNotes));
  await writeFile(campaignDir, 'REPORT.md', reportMarkdownText(allNotes));
}

/** Notes that have a place in the tree, in capture order. */
function orderedKnownNotes(allNotes: QaNote[]): QaNote[] {
  return allNotes
    .filter((n) => noteIndex[n.id])
    .slice()
    .sort((a, b) => (noteIndex[a.id].seq ?? 0) - (noteIndex[b.id].seq ?? 0));
}

function campaignJsonText(allNotes: QaNote[]): string {
  if (!campaign) return '{}';
  const ordered = orderedKnownNotes(allNotes);
  const meta = {
    project: campaign.project,
    campaign: campaign.campaign,
    tester: campaign.tester ?? null,
    startedAt: campaign.startedAt,
    updatedAt: new Date().toISOString(),
    noteCount: ordered.length,
    notes: noteIndex,
  };
  return JSON.stringify(meta, null, 2);
}

function reportMarkdownText(allNotes: QaNote[]): string {
  if (!campaign) return '';
  const ordered = orderedKnownNotes(allNotes);

  const counts = { bug: 0, question: 0, polish: 0, verified: 0 };
  for (const n of ordered) {
    const sev = n.severity ?? 'bug';
    if (sev === 'bug') counts.bug++;
    else if (sev === 'question') counts.question++;
    else counts.polish++;
    if (n.status === 'verified') counts.verified++;
  }

  const header = [
    `# ${campaign.project} — ${campaign.campaign}`,
    '',
    campaign.tester ? `Tester: ${campaign.tester}  ` : '',
    `Started: ${campaign.startedAt}  `,
    `Updated: ${new Date().toISOString()}  `,
    `Points: ${ordered.length} (${counts.bug} bug, ${counts.question} question, ${counts.polish} polish · ${counts.verified} verified)`,
    '',
    getFsSyncEngine() === 'download'
      ? 'Saved by Qapture as the campaign was tested. Screenshots are in'
      : 'Written live by Qapture as each point was saved. Screenshots are in',
    '`screenshots/`, one Markdown file per point in `notes/`.',
    '',
    '---',
    '',
  ].filter((line) => line !== '').join('\n');

  const body = ordered
    .map((n) => noteMarkdownForDisk(n, noteIndex[n.id]))
    .join('\n---\n\n');

  return `${header}\n${body}`;
}

/**
 * Build the campaign as a ZIP whose internal paths ARE the folder tree.
 *
 * This is the download engine's delivery step. The tester unzips it into their
 * QA folder and gets `Project X/2026-08-14 smoke/REPORT.md` — the same paths,
 * the same filenames and the same sequence numbers the disk engine writes on
 * Chromium. Merging a later ZIP over an earlier one simply overwrites the
 * campaign with its newer state, which is what "save again" should mean.
 */
export async function buildCampaignZipBlob(allNotes: QaNote[]): Promise<Blob | null> {
  if (!campaign || typeof document === 'undefined') return null;
  try {
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const base = zip.folder(safeSegment(campaign.project, 'Project'))
      ?.folder(safeSegment(campaign.campaign, defaultCampaignName()));
    if (!base) return null;

    base.file('campaign.json', campaignJsonText(allNotes));
    base.file('REPORT.md', reportMarkdownText(allNotes));

    const notesFolder = base.folder('notes');
    const shotsFolder = base.folder('screenshots');
    for (const note of orderedKnownNotes(allNotes)) {
      const entry = noteIndex[note.id];
      notesFolder?.file(entry.file, noteMarkdownForDisk(note, entry));
      if (note.screenshot && entry.shot) shotsFolder?.file(entry.shot, note.screenshot);
      if (note.afterScreenshot && entry.after) shotsFolder?.file(entry.after, note.afterScreenshot);
    }

    return await zip.generateAsync({ type: 'blob' });
  } catch (err) {
    setState('error', describeError(err));
    return null;
  }
}

/**
 * Build the campaign ZIP and hand it to the browser as a download.
 * Returns false when there was nothing to save or the build failed.
 */
export async function downloadCampaignZip(allNotes: QaNote[]): Promise<boolean> {
  const blob = await buildCampaignZipBlob(allNotes);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = campaignZipFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setState('syncing');
  return true;
}

/**
 * Rewrite everything from scratch — used when a campaign is opened while
 * notes already exist in the browser, so the folder starts complete rather
 * than only holding whatever is captured from now on.
 */
export async function syncAllToDisk(allNotes: QaNote[]): Promise<boolean> {
  if (getFsSyncEngine() === 'download') {
    if (!campaign) return false;
    // Oldest first, so sequence numbers read in capture order.
    for (const note of allNotes.slice().reverse()) {
      if (!noteIndex[note.id]) noteIndex[note.id] = entryFor(note);
    }
    await persistDownloadCampaign();
    setState('syncing');
    return true;
  }

  if (!campaignDir) return false;
  // Oldest first, so sequence numbers read in capture order.
  const ordered = allNotes.slice().reverse();
  bulkWriting = true;
  try {
    for (const note of ordered) {
      const ok = await syncNoteToDisk(note, allNotes);
      if (!ok) return false;
    }
  } finally {
    bulkWriting = false;
  }
  try {
    await flushCampaignFiles(allNotes);
  } catch (err) {
    setState('error', describeError(err));
    return false;
  }
  return true;
}
