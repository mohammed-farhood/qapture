// Shot-server smoke — proves the local screenshot helper answers the right
// callers and refuses everyone else.
//
// WHY THIS EXISTS
// ---------------
// This is the one part of Qapture that can photograph the machine it runs on.
// Everything else in the package is a widget inside a page; this is a process
// with a socket and a camera. The interesting failures are therefore not
// "does it take a picture" but "who can ask it to":
//
//   • a page on some unrelated site must not be able to reach it. It binds to
//     loopback so nothing off the machine can, and it withholds CORS headers
//     from origins that are not allowed so the browser blocks the request
//     before the body is ever read;
//   • a malformed or absurd rectangle must be refused rather than handed to
//     screencapture, which would otherwise be asked to allocate whatever the
//     caller asked for.
//
// The capture itself is only exercised on macOS, and then only as an 8x8
// square of the top-left corner: enough to prove the pipe works end to end
// without photographing anything of the developer's.
import { createShotServer } from '../dist/_shot-test.mjs';

const PORT = 7099;
const OK = 'http://localhost:3000';
const ALLOWED_EXTRA = 'https://qa.example.com';
const HOSTILE = 'https://evil.example';

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok   - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

const server = createShotServer({ port: PORT, allow: [ALLOWED_EXTRA], verbose: false });
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const base = `http://127.0.0.1:${PORT}`;
const get = (path, origin) =>
  fetch(`${base}${path}`, { headers: origin ? { origin } : {} });
const post = (path, origin, body) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

try {
  console.log('\nScenario 1: who may ask');

  const loopback = await get('/qapture/health', OK);
  ok(loopback.status === 200, 'a loopback dev server gets an answer');
  ok(
    loopback.headers.get('access-control-allow-origin') === OK,
    'and is echoed back its own origin, not a wildcard',
  );

  const named = await get('/qapture/health', ALLOWED_EXTRA);
  ok(named.status === 200, 'an origin named with --allow gets an answer');

  const hostile = await get('/qapture/health', HOSTILE);
  ok(hostile.status === 403, 'an unknown origin is refused');
  ok(
    hostile.headers.get('access-control-allow-origin') === null,
    'and gets NO CORS header, so the browser blocks it before the page sees a body',
  );

  const noOrigin = await get('/qapture/health');
  ok(noOrigin.status === 403, 'a request with no Origin at all is refused');

  console.log('\nScenario 2: the preflight a real browser sends first');
  const pre = await fetch(`${base}/qapture/shot`, {
    method: 'OPTIONS',
    headers: { origin: OK, 'access-control-request-method': 'POST' },
  });
  ok(pre.status === 204, 'preflight is answered');
  ok(
    pre.headers.get('access-control-allow-private-network') === 'true',
    'and grants Private Network Access, which Chrome demands of an https page reaching loopback',
  );

  const preHostile = await fetch(`${base}/qapture/shot`, {
    method: 'OPTIONS',
    headers: { origin: HOSTILE, 'access-control-request-method': 'POST' },
  });
  ok(preHostile.status === 403, 'a hostile origin does not get past the preflight');

  console.log('\nScenario 3: rectangles that must never reach screencapture');
  for (const [label, body] of [
    ['a negative width', { x: 0, y: 0, w: -5, h: 10 }],
    ['a zero-area rect', { x: 0, y: 0, w: 0, h: 0 }],
    ['an absurd size', { x: 0, y: 0, w: 999999, h: 999999 }],
    ['a non-numeric field', { x: 'NaN', y: 0, w: 10, h: 10 }],
    ['a missing field', { x: 0, y: 0, w: 10 }],
  ]) {
    const res = await post('/qapture/shot', OK, body);
    ok(res.status === 400, `refuses ${label}`);
  }

  console.log('\nScenario 4: an unknown route');
  const missing = await get('/qapture/anything-else', OK);
  ok(missing.status === 404, 'an unknown path is a 404, not a capture');

  if (process.platform === 'darwin') {
    console.log('\nScenario 5: the capture itself (macOS)');
    const res = await post('/qapture/shot', OK, { x: 0, y: 0, w: 8, h: 8 });
    ok(res.status === 200, 'an 8x8 corner capture succeeds');
    const payload = await res.json();
    ok(
      typeof payload.png === 'string' && payload.png.startsWith('data:image/png;base64,'),
      'and comes back as a PNG data URL',
    );
    const bytes = Buffer.from(payload.png.split(',')[1], 'base64');
    ok(bytes.subarray(0, 4).toString('hex') === '89504e47', 'with a real PNG signature');
    // Width lives at bytes 16-20 of a PNG. 8 points is 8 device pixels at 1x
    // and 16 at 2x, so anything in that range proves the rect was honoured
    // rather than ignored.
    const width = bytes.readUInt32BE(16);
    ok(width >= 8 && width <= 32, `and the rect was honoured (${width}px wide for 8 points)`);
  } else {
    console.log(`\nScenario 5: skipped — capture needs macOS (this is ${process.platform})`);
  }
} finally {
  await new Promise((r) => server.close(r));
}

if (failures) {
  console.error(`\nSHOT SERVER SMOKE FAIL ❌  ${failures} check(s) failed\n`);
  process.exit(1);
}
console.log('\nSHOT SERVER SMOKE PASS ✅  the helper answers loopback and named origins, and refuses everything else\n');
