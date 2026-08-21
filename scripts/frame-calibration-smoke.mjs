// Frame-calibration smoke — the arithmetic that decides where a Safari
// window-share frame's pixels actually are, checked against synthetic frames
// whose right answer is known exactly.
//
// WHY THIS IS A SMOKE TEST AND NOT A BROWSER TEST
// -----------------------------------------------
// The browser part (ask for a stream, paint markers, grab a frame) needs a
// permission prompt and a real screen, and the browser that matters most here
// — Safari — cannot be driven by our test harness at all. But the browser part
// is not where the danger is. The danger is the arithmetic: get it slightly
// wrong and every screenshot is confidently of the wrong pixels, which looks
// fine and poisons bug reports.
//
// So the arithmetic is pure, and this drives it with frames we construct
// ourselves: known viewport, known scale, known toolbar offset. If it can
// recover those numbers from the pixels, it can recover them from Safari.
//
// The refusal cases matter as much as the success cases. A calibration that
// cannot be verified MUST come back null so the caller falls back to
// re-drawing the page — "no screenshot" is recoverable, "wrong screenshot" is
// not.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'dist', '_calib-test.mjs');

// Bundle the TS module to plain ESM so Node can import it directly.
await new Promise((res, rej) => {
  const p = spawn('npx', [
    'esbuild', join(ROOT, 'src/lib/frameCalibration.ts'),
    '--bundle', '--format=esm', '--platform=node', `--outfile=${OUT}`, '--log-level=error',
  ], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`esbuild failed (${c})`))));
});

const { MARKER_SIZE, MARKERS, markerCentres, findMarkerCandidates, deriveMapping, mapRectToFrame } =
  await import(OUT);

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok   - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

/**
 * Build a fake captured frame: a dark "desktop", the browser window somewhere
 * inside it, the page inside that below a toolbar, and our four markers on an
 * opaque backdrop at the page's corners — exactly what the real calibration
 * frame looks like.
 */
function synthFrame({ frameW, frameH, originX, originY, scale, vw, vh, skip = [], nudge = null, decoy = false }) {
  const data = new Uint8ClampedArray(frameW * frameH * 4);
  // Desktop + chrome: mid grey, deliberately unsaturated so the finder's
  // saturation gate throws it away.
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 60; data[i + 1] = 62; data[i + 2] = 64; data[i + 3] = 255;
  }
  const put = (x0, y0, w, h, [r, g, b]) => {
    for (let y = Math.max(0, y0); y < Math.min(frameH, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(frameW, x0 + w); x++) {
        const i = (y * frameW + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
  };
  // The opaque calibration backdrop covering the page area.
  put(Math.round(originX), Math.round(originY), Math.round(vw * scale), Math.round(vh * scale), [10, 10, 10]);

  // A saturated red block INSIDE the page area — the page's own content
  // showing through would be the obvious way to fool a colour finder. The
  // backdrop is what makes this impossible in reality; here we paint it
  // anyway when `decoy` is set, to prove the marker maths survives it.
  if (decoy) {
    put(Math.round(originX + vw * scale * 0.4), Math.round(originY + vh * scale * 0.4),
      Math.round(60 * scale), Math.round(60 * scale), [255, 0, 0]);
  }

  const centres = markerCentres(vw, vh);
  const half = (MARKER_SIZE / 2) * scale;
  for (const m of MARKERS) {
    if (skip.includes(m.key)) continue;
    const c = centres[m.key];
    let cx = originX + c.x * scale;
    let cy = originY + c.y * scale;
    if (nudge && nudge.key === m.key) { cx += nudge.dx; cy += nudge.dy; }
    put(Math.round(cx - half), Math.round(cy - half), Math.round(half * 2), Math.round(half * 2), [...m.color]);
  }
  return { data, frameW, frameH };
}

function solve(cfg) {
  const f = synthFrame(cfg);
  const hits = findMarkerCandidates(f.data, f.frameW, f.frameH);
  return { hits, mapping: deriveMapping(hits, cfg.vw, cfg.vh, f.frameW, f.frameH) };
}

console.log('\nScenario 1: a Safari WINDOW share on a Retina display');
{
  // 1470x956 page, dpr 2, toolbar 87 CSS px tall, window inset in the frame.
  const cfg = { frameW: 2940, frameH: 2086, originX: 0, originY: 174, scale: 2, vw: 1470, vh: 956 };
  const { hits, mapping } = solve(cfg);
  ok(MARKERS.every((m) => (hits[m.key] || []).length > 0), `all four markers found (${MARKERS.map((m) => m.key).join(",")})`);
  ok(!!mapping, 'a mapping was derived');
  if (mapping) {
    console.log(`  info   scale ${mapping.scaleX.toFixed(3)}x${mapping.scaleY.toFixed(3)}, ` +
      `origin ${mapping.originX.toFixed(1)},${mapping.originY.toFixed(1)} (want 2.000, 0.0,174.0)`);
    ok(Math.abs(mapping.scaleX - 2) < 0.02, 'recovered the Retina scale (2x)');
    ok(Math.abs(mapping.originX - 0) < 3, 'recovered the horizontal origin');
    ok(Math.abs(mapping.originY - 174) < 3, 'recovered the toolbar offset it was never told about');

    // The point of all of it: a viewport rect lands on the right frame pixels.
    const r = mapRectToFrame({ left: 100, top: 50, width: 300, height: 200 }, mapping, cfg.frameW, cfg.frameH);
    console.log(`  info   viewport rect 100,50 300x200 → frame ${r.sx},${r.sy} ${r.sw}x${r.sh} (want 200,274 600x400)`);
    ok(Math.abs(r.sx - 200) <= 2 && Math.abs(r.sy - 274) <= 2, 'a viewport rect maps to the right frame pixels');
    ok(Math.abs(r.sw - 600) <= 2 && Math.abs(r.sh - 400) <= 2, 'and to the right size');
  }
}

console.log('\nScenario 2: a WHOLE-SCREEN share, window offset on the desktop');
{
  // Non-retina screen, window sitting well inside it.
  const cfg = { frameW: 1920, frameH: 1080, originX: 260, originY: 130, scale: 1, vw: 1200, vh: 800 };
  const { mapping } = solve(cfg);
  ok(!!mapping, 'a mapping was derived from a whole-screen frame');
  if (mapping) {
    console.log(`  info   scale ${mapping.scaleX.toFixed(3)}, origin ${mapping.originX.toFixed(1)},${mapping.originY.toFixed(1)} (want 1.000, 260,130)`);
    ok(Math.abs(mapping.scaleX - 1) < 0.02, 'recovered the 1x scale');
    ok(Math.abs(mapping.originX - 260) < 3 && Math.abs(mapping.originY - 130) < 3,
      'recovered the window position on the desktop it was never told about');
  }
}

console.log('\nScenario 3: a fractional display scale (150% Windows-style)');
{
  const cfg = { frameW: 2400, frameH: 1500, originX: 45, originY: 96, scale: 1.5, vw: 1400, vh: 900 };
  const { mapping } = solve(cfg);
  ok(!!mapping, 'a mapping was derived at 1.5x');
  if (mapping) {
    console.log(`  info   scale ${mapping.scaleX.toFixed(3)} (want 1.500)`);
    ok(Math.abs(mapping.scaleX - 1.5) < 0.03, 'recovered a non-integer scale');
  }
}

console.log('\nScenario 4: page content cannot fool the finder');
{
  const cfg = { frameW: 2940, frameH: 2086, originX: 0, originY: 174, scale: 2, vw: 1470, vh: 956, decoy: true };
  const { mapping } = solve(cfg);
  ok(!!mapping, 'a big red block inside the page did not break the solve');
  if (mapping) {
    ok(Math.abs(mapping.scaleX - 2) < 0.02 && Math.abs(mapping.originY - 174) < 6,
      'verification picked the true corners over the decoy');
  }
}

console.log('\nScenario 5: REFUSALS — a calibration that cannot be trusted returns null');
{
  const base = { frameW: 2940, frameH: 2086, originX: 0, originY: 174, scale: 2, vw: 1470, vh: 956 };

  // A corner we solve from is missing entirely.
  ok(solve({ ...base, skip: ['br'] }).mapping === null,
    'refuses when a solving corner is missing');

  // Both check corners missing — nothing would have been verified.
  ok(solve({ ...base, skip: ['tr', 'bl'] }).mapping === null,
    'refuses when there is nothing left to verify against');

  // A check corner in the wrong place: the frame is not a plain scaled copy
  // of the page (a warped, rotated or partially-occluded share).
  ok(solve({ ...base, nudge: { key: 'tr', dx: -220, dy: 0 } }).mapping === null,
    'refuses when a check corner disagrees with the solved mapping');

  // Nothing marker-coloured at all — e.g. the share was of a different window.
  const blank = new Uint8ClampedArray(400 * 300 * 4).fill(120);
  ok(deriveMapping(findMarkerCandidates(blank, 400, 300), 1470, 956, 400, 300) === null,
    'refuses on a frame with no markers in it (wrong window shared)');

  // A tiny nudge is tolerated — compression jitter must not cause refusals.
  ok(solve({ ...base, nudge: { key: 'tr', dx: -3, dy: 2 } }).mapping !== null,
    'tolerates a few pixels of codec jitter without refusing');
}

if (failures > 0) {
  console.error(`\nFRAME CALIBRATION: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nFRAME CALIBRATION SMOKE PASS ✅  the mapping is measured from pixels, and refuses when it cannot be verified');
