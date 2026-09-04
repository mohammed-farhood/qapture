/**
 * collector.ts — send the note as it is written, so nobody has to remember to.
 *
 * WHY
 * ---
 * Every workflow before this ended with "and then the client exports a zip and
 * sends it to you". That step is where the tool actually failed: they test on
 * a Sunday evening, they mean to send it, and it never arrives. The notes were
 * captured perfectly and helped nobody.
 *
 * When a collector is configured, each note is posted as it is saved. The
 * client does nothing. Export still works exactly as before and is still the
 * complete, offline answer — this is an addition, not a replacement.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * It never blocks saving. A note is written to local storage first and posted
 * afterwards, so a dead server, a captive-portal wifi or a blocking CSP costs
 * nothing: the note is still on the tester's machine and still in the export.
 * A QA tool that loses a bug report because a server was down would be worse
 * than one with no server at all.
 *
 * It also never retries in a loop. One attempt, and a failure is recorded in
 * the fault log where somebody can see it. A widget that hammers an unreachable
 * host from a client's browser is a bug in itself.
 */

import type { QaNote } from '../context/QaContext';
import { recordFault } from './faultLog';

export interface CollectorConfig {
  /** Base URL of the collector, e.g. https://qa.example.com */
  url: string;
  /** This project's write token. Write-only: it cannot read anything back. */
  token: string;
  /** Which project the notes belong to. */
  project: string;
  /** Which round of testing. Defaults to the date, which is usually right. */
  campaign?: string;
  /** Who is testing, when you know. Shown in the folder's README. */
  tester?: string;
}

/** How long to wait before giving up. Short: nothing is waiting on this. */
const TIMEOUT_MS = 8000;

/** Screenshots above this are sent without the picture rather than not at all. */
const MAX_SHOT_BYTES = 6 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Post one note. Never throws, never blocks, never retries.
 *
 * @returns true when the server accepted it.
 */
export async function sendToCollector(note: QaNote, cfg: CollectorConfig): Promise<boolean> {
  if (typeof fetch === 'undefined' || !cfg?.url || !cfg.token || !cfg.project) return false;

  let shot: string | undefined;
  if (note.screenshot && note.screenshot.size <= MAX_SHOT_BYTES) {
    shot = (await blobToDataUrl(note.screenshot)) ?? undefined;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/notes`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({
        project: cfg.project,
        // A campaign per day is the shape that matches how testing actually
        // happens, and it means nobody has to name anything.
        campaign: cfg.campaign || new Date().toISOString().slice(0, 10),
        tester: cfg.tester,
        id: note.id,
        route: note.route,
        description: note.description,
        wanted: note.wanted,
        why: note.why,
        severity: note.severity,
        origin: note.origin,
        shot,
      }),
    });
    if (!res.ok) {
      recordFault('collector', `server answered ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // Offline, blocked, unreachable, timed out. The note is already saved
    // locally and already in the export; this is worth recording and not worth
    // interrupting anybody about.
    recordFault('collector', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
