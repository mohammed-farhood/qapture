/**
 * shotServer.ts — the screenshot the browser is not allowed to take.
 *
 * WHY THIS EXISTS
 * ---------------
 * A page can only photograph the screen through `getDisplayMedia`, and that
 * API will never remember a grant: it prompts on every call, by design. Each
 * prompt spins macOS's capture pipeline up again, which on a laptop reads as
 * heat and as a machine that feels like it is recording continuously. There is
 * no flag that fixes this, because it is the security model working.
 *
 * So the screenshot moves out of the browser. This is a loopback HTTP server
 * that shells out to `screencapture` — the same binary Cmd+Shift+4 runs. macOS
 * asks for Screen Recording permission once, for the terminal running this,
 * and never again. A capture is a process that lives for ~200ms: no stream, no
 * indicator, no pipeline left warm.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 * It binds to 127.0.0.1 and nothing else, so it is not reachable from the
 * network. It answers CORS only for origins on the allowlist — loopback dev
 * servers by default, anything else named explicitly with --allow. A random
 * site you happen to have open therefore cannot ask it for a picture of your
 * screen, because the browser refuses the preflight before the request is sent.
 *
 * It captures a rectangle the caller names and returns it. It does not capture
 * on a timer, does not record video, and keeps nothing: the temp file is
 * unlinked before the response is written.
 */

import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';

/** Where the widget looks for us. Fixed, because the page cannot go hunting. */
export const DEFAULT_SHOT_PORT = 7017;

/** Largest rectangle we will photograph, per side, in points. */
const MAX_SIDE = 20000;

/** A capture that has not returned by now is not coming back. */
const CAPTURE_TIMEOUT_MS = 8000;

export interface ShotServerOptions {
  port: number;
  /** Extra origins allowed to ask for a shot, beyond loopback. */
  allow: string[];
  /** Print a line per capture. */
  verbose: boolean;
}

/**
 * Loopback origins are allowed without being named.
 *
 * This is the whole point of the tool: you are testing an app on
 * http://localhost:3000. Making you register that every time would be
 * ceremony, and it grants nothing that is not already local to the machine.
 */
function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.hostname === 'localhost'
      || u.hostname === '127.0.0.1'
      || u.hostname === '[::1]'
      || u.hostname === '::1';
  } catch {
    return false;
  }
}

function originAllowed(origin: string | undefined, allow: string[]): boolean {
  if (!origin) return false;
  if (isLoopbackOrigin(origin)) return true;
  return allow.includes(origin);
}

/** Headers that let the named origin talk to us, and no other. */
function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    // Chrome's Private Network Access check: an https page reaching a loopback
    // address is asked for explicitly, and refused unless we say yes here.
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin',
  };
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    ...extra,
  });
  res.end(text);
}

function readBody(req: http.IncomingMessage, limit = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Photograph one rectangle of the desktop.
 *
 * `-R` takes global screen coordinates in points, which is exactly the space
 * `window.screenX/screenY` reports in, so the caller can name the browser
 * window without either side knowing how many displays there are or where they
 * sit relative to each other.
 *
 * `-x` silences the shutter, `-o` drops the window shadow, `-r` omits the DPI
 * metadata that would otherwise make the PNG claim a size it does not have.
 * The cursor is deliberately not captured: a pointer frozen in a bug report is
 * noise, and it is usually sitting on the thing being reported.
 */
function captureRect(
  rect: { x: number; y: number; w: number; h: number },
): Promise<Buffer> {
  const file = path.join(
    os.tmpdir(),
    `qapture-shot-${process.pid}-${Date.now()}.png`,
  );
  const region = `${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.w)},${Math.round(rect.h)}`;

  return new Promise((resolve, reject) => {
    execFile(
      '/usr/sbin/screencapture',
      ['-x', '-o', '-r', '-t', 'png', '-R', region, file],
      { timeout: CAPTURE_TIMEOUT_MS },
      (err) => {
        if (err) {
          fs.promises.unlink(file).catch(() => {});
          reject(err);
          return;
        }
        fs.promises.readFile(file)
          .then((buf) => {
            // Unlink before resolving: the picture is the caller's now, and a
            // screenshot of someone's screen should not outlive the request in
            // a world-readable temp directory.
            fs.promises.unlink(file).catch(() => {});
            if (!buf.length) { reject(new Error('empty capture')); return; }
            resolve(buf);
          })
          .catch((e) => {
            fs.promises.unlink(file).catch(() => {});
            reject(e as Error);
          });
      },
    );
  });
}

function parseRect(raw: string): { x: number; y: number; w: number; h: number } | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const nums = ['x', 'y', 'w', 'h'].map((k) => Number(o[k]));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [x, y, w, h] = nums;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE) return null;
  return { x, y, w, h };
}

export function createShotServer(opts: ShotServerOptions): http.Server {
  return http.createServer((req, res) => {
    const origin = req.headers.origin;
    const url = (req.url ?? '').split('?')[0];

    if (!originAllowed(origin, opts.allow)) {
      // No CORS headers at all: the browser will block this before the page
      // ever sees a body, which is the behaviour we want.
      sendJson(res, 403, { error: 'origin not allowed' });
      return;
    }
    const cors = corsHeaders(origin as string);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.method === 'GET' && url === '/qapture/health') {
      sendJson(res, 200, { ok: true, engine: 'screencapture', platform: process.platform }, cors);
      return;
    }

    if (req.method === 'POST' && url === '/qapture/shot') {
      readBody(req)
        .then((body) => {
          const rect = parseRect(body);
          if (!rect) { sendJson(res, 400, { error: 'bad rect' }, cors); return; }
          return captureRect(rect).then((png) => {
            if (opts.verbose) {
              process.stdout.write(
                `  shot ${Math.round(rect.w)}×${Math.round(rect.h)} @ ` +
                `${Math.round(rect.x)},${Math.round(rect.y)} → ${(png.length / 1024).toFixed(0)} KB\n`,
              );
            }
            sendJson(res, 200, {
              png: `data:image/png;base64,${png.toString('base64')}`,
            }, cors);
          });
        })
        .catch((err: Error) => {
          sendJson(res, 500, { error: err.message || 'capture failed' }, cors);
        });
      return;
    }

    sendJson(res, 404, { error: 'not found' }, cors);
  });
}
