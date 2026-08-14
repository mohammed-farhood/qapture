// Capture-accuracy test (real Chrome) — proves the screenshot contains the
// region the tester selected, to within a couple of pixels.
//
// WHY THIS EXISTS
// ---------------
// "The screenshot is not the part I selected" is not a crash, an exception, or
// a failed assertion anywhere in the stack: html2canvas returns a perfectly
// valid image of the wrong pixels. No unit test can see that. So this drives
// real Chrome against fixtures whose correct answer is a specific colour and
// whose wrong answer is a different specific colour, then reads the stored
// screenshot back pixel by pixel and reports the misalignment IN PIXELS.
//
// Each case captures a 40px-tall (or wide) rect straddling a colour boundary
// and measures the fraction of the capture on each side. A perfect capture is
// 50/50; a capture that is off by N pixels reads as (20-N)/40. That turns
// "the screenshot looks wrong" into a number.
//
// THE CASES
//   1. SCROLLED PAGE   — the page is scrolled 1200px down. The commonest
//      situation in real testing, and the one where a document/viewport
//      coordinate mix-up shows up as a whole-screen offset.
//   2. STICKY HEADER   — `position: sticky` is NOT implemented by
//      html2canvas: it renders a stuck header back at its natural document
//      position, so everything the tester framed near it comes out shifted.
//      This is a genuine, unfixable-by-cropping limitation of re-rendering
//      the DOM, and the reason the exact engine exists.
//   3. SCROLLED CONTAINER — an `overflow:auto` box scrolled away from its
//      origin (html2canvas restores these itself; this keeps it that way).
//
// Run with QAPTURE_EXPECT=lenient to report numbers without failing — useful
// when comparing two builds.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PLAY = join(dirname(fileURLToPath(import.meta.url)), '..', 'playground');
const PORT = 5186;
const BASE = `http://localhost:${PORT}/`;
const LENIENT = process.env.QAPTURE_EXPECT === 'lenient';
const TOLERANCE_PX = 2;

let failures = 0;
/**
 * `hard` assertions (fixture setup, "did we even get a screenshot") always
 * fail the run — lenient mode only softens the accuracy verdicts, so that a
 * comparison run against an older build reports its pixel error instead of
 * aborting at the first bad number.
 */
function ok(cond, label, hard = false) {
  if (cond) console.log(`  ok   - ${label}`);
  else if (LENIENT && !hard) console.log(`  note - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--host'], { cwd: PLAY, stdio: 'ignore' });
await sleep(3500);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
  ignoreDefaultArgs: ['--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 900 },
});

/** Drive capture mode: drag `rect`, type `desc`, save. Returns nothing. */
async function captureRegion(page, rect, desc) {
  // Make sure the panel is open, then click "Capture from page".
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) return;
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click();
    else sr.querySelector('button').click(); // FAB → opens the panel
  });
  await sleep(400);
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) return;
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click();
  });
  await sleep(500);

  const inCapture = await page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]'));
  if (!inCapture) throw new Error(`could not enter capture mode for "${desc}"`);

  await page.mouse.move(rect.x0, rect.y0);
  await page.mouse.down();
  await page.mouse.move(rect.x0 + 12, rect.y0 + 12, { steps: 3 });
  await page.mouse.move(rect.x1, rect.y1, { steps: 8 });
  await page.mouse.up();
  await sleep(2600);

  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (!ta) throw new Error(`annotation card never appeared for "${desc}"`);
  await ta.click();
  await ta.type(desc);
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1000);
}

/** Read a stored note's screenshot back and classify every pixel. */
function measure(page, desc) {
  return page.evaluate((d) => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve({ error: 'idb open failed' });
    req.onsuccess = () => {
      const tx = req.result.transaction('notes', 'readonly');
      const all = tx.objectStore('notes').getAll();
      all.onerror = () => resolve({ error: 'idb read failed' });
      all.onsuccess = async () => {
        const note = all.result.find((n) => n.description === d);
        if (!note) return resolve({ error: 'note not found' });
        if (!note.screenshot) return resolve({ error: 'note has no screenshot' });
        try {
          const bitmap = await createImageBitmap(note.screenshot);
          const c = document.createElement('canvas');
          c.width = bitmap.width; c.height = bitmap.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          let red = 0, green = 0, other = 0;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > 120 && g < 90 && b < 90) red++;
            else if (g > 120 && r < 90 && b < 90) green++;
            else other++;
          }
          const total = red + green + other;
          resolve({
            type: note.screenshot.type,
            bytes: note.screenshot.size,
            width: bitmap.width,
            height: bitmap.height,
            redFraction: red / total,
            greenFraction: green / total,
            otherFraction: other / total,
          });
        } catch (e) {
          resolve({ error: String(e) });
        }
      };
    };
  }), desc);
}

/**
 * Report a straddle capture: the boundary should split it 50/50, so the
 * red fraction converts directly into a pixel offset.
 */
function reportStraddle(name, m, spanPx, expectRedFirst = true) {
  if (m.error) { ok(false, `${name}: could not measure (${m.error})`, true); return; }
  const offBy = ((expectRedFirst ? m.redFraction : m.greenFraction) - 0.5) * spanPx;
  console.log(
    `  info   ${name}: ${m.width}x${m.height} ${m.type}, ` +
    `red ${(m.redFraction * 100).toFixed(1)}% / green ${(m.greenFraction * 100).toFixed(1)}% / ` +
    `other ${(m.otherFraction * 100).toFixed(1)}% → off by ${offBy.toFixed(1)}px`,
  );
  ok(
    Math.abs(offBy) <= TOLERANCE_PX,
    Math.abs(offBy) <= TOLERANCE_PX
      ? `${name}: captured boundary is where it was selected (${Math.abs(offBy).toFixed(1)}px off)`
      : `${name}: MISALIGNED BY ${offBy.toFixed(1)}px — the screenshot is not the region that was selected`,
  );
}

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1200);

  const geo = await page.evaluate(() => {
    document.body.style.margin = '0';

    // A long page of alternating 100px bands, so any vertical offset lands on
    // a different colour. Bands start at document y = 0.
    const strip = document.createElement('div');
    strip.id = 'qa-strip';
    strip.style.cssText = 'position:absolute;top:0;left:0;width:520px;z-index:1;';
    for (let i = 0; i < 40; i++) {
      const band = document.createElement('div');
      band.dataset.band = String(i);
      band.style.cssText = `height:100px;background:${i % 2 ? '#00b300' : '#ff0000'};`;
      strip.appendChild(band);
    }
    document.body.appendChild(strip);
    document.body.style.minHeight = '4200px';

    // A sticky header — stuck to the top once the page scrolls.
    const sticky = document.createElement('div');
    sticky.id = 'qa-sticky';
    sticky.style.cssText =
      'position:sticky;top:0;margin-left:560px;width:400px;height:120px;background:#ff0000;z-index:2;';
    document.body.insertBefore(sticky, document.body.firstChild);

    // An overflow:auto box scrolled away from its origin.
    const outer = document.createElement('div');
    outer.id = 'qa-scroll-fixture';
    outer.style.cssText =
      'position:fixed;top:600px;left:600px;width:300px;height:200px;overflow:auto;z-index:3;background:#ff0000;';
    const inner = document.createElement('div');
    inner.style.cssText = 'position:relative;height:2000px;width:100%;background:#ff0000;';
    const marker = document.createElement('div');
    marker.style.cssText = 'position:absolute;top:900px;left:0;width:100%;height:500px;background:#00b300;';
    inner.appendChild(marker);
    outer.appendChild(inner);
    document.body.appendChild(outer);
    outer.scrollTop = 1000;

    // The playground (like many real apps) sets scroll-behavior: smooth —
    // measuring positions while the page is still animating would test the
    // fixture, not the capture.
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';
    window.scrollTo(0, 1200);
    return { scrolledOk: outer.scrollTop === 1000 };
  });
  await sleep(900);
  Object.assign(geo, await page.evaluate(() => ({
    scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
    scrollY: window.scrollY,
  })));

  console.log(`  info   viewport 1280x900, page scrolled to y=${geo.scrollY}, scrollbar width ${geo.scrollbarWidth}px`);
  ok(geo.scrollY === 1200, 'fixture: the page is scrolled 1200px down');
  ok(geo.scrolledOk, 'fixture: the overflow:auto box is scrolled to 1000px');

  // ── CASE 1: scrolled page ──────────────────────────────────────────────
  // Band boundaries sit at document y = 1200, 1300, … With scrollY=1200 the
  // boundary between band 12 (red) and band 13 (green) is at viewport y=100.
  const boundaryY = await page.evaluate(() => {
    const band = document.querySelector('[data-band="13"]');
    return band.getBoundingClientRect().top;
  });
  console.log(`  info   band boundary (red→green) at viewport y=${boundaryY}`);
  await captureRegion(page, { x0: 80, y0: boundaryY - 20, x1: 380, y1: boundaryY + 20 }, 'scrolled page fixture');
  reportStraddle('scrolled page', await measure(page, 'scrolled page fixture'), 40, true);

  // ── CASE 2: sticky header ──────────────────────────────────────────────
  // The header is stuck at viewport y=0..120 (red); below it is page
  // background (white → counted as "other"), so we straddle its bottom edge
  // against a green band placed directly beneath it.
  const stickyEdge = await page.evaluate(() => {
    const s = document.getElementById('qa-sticky');
    const under = document.createElement('div');
    under.style.cssText = 'position:fixed;top:120px;left:560px;width:400px;height:200px;background:#00b300;z-index:1;';
    document.body.appendChild(under);
    return s.getBoundingClientRect().bottom;
  });
  console.log(`  info   sticky header bottom edge at viewport y=${stickyEdge}`);
  await captureRegion(page, { x0: 600, y0: stickyEdge - 20, x1: 900, y1: stickyEdge + 20 }, 'sticky fixture');
  reportStraddle('sticky header', await measure(page, 'sticky fixture'), 40, true);

  // ── CASE 3: scrolled container ─────────────────────────────────────────
  await captureRegion(page, { x0: 640, y0: 640, x1: 860, y1: 760 }, 'scrolled container fixture');
  const scrolled = await measure(page, 'scrolled container fixture');
  if (scrolled.error) {
    ok(false, `scrolled container: could not measure (${scrolled.error})`, true);
  } else {
    console.log(`  info   scrolled container: ${scrolled.width}x${scrolled.height} ${scrolled.type} ` +
      `(${scrolled.bytes} bytes), green ${(scrolled.greenFraction * 100).toFixed(1)}%`);
    ok(
      scrolled.greenFraction > 0.95,
      scrolled.greenFraction > 0.95
        ? 'scrolled container: captured at its LIVE scroll position, not from its top'
        : `scrolled container: captured from the wrong offset (only ${(scrolled.greenFraction * 100).toFixed(1)}% of the visible colour)`,
    );
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nCAPTURE ACCURACY: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nCAPTURE ACCURACY PASS ✅  the captured pixels are the selected region');
