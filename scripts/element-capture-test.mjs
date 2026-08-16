// Element-capture test (real Chrome) — proves that CLICKING an element
// captures the WHOLE element, not just the slice of it that happens to be
// on screen.
//
// WHY THIS EXISTS
// ---------------
// Region drags are clamped into the viewport by clampRegionRect(), so the
// crop maths can never be asked for pixels that were not rendered. An element
// PICK has no such clamp: getBoundingClientRect() happily describes a box that
// starts above the viewport, ends below it, or runs off the side. Reported on
// a real app as "it only took part of the screenshot — but when I drag a
// region it's fine", which is exactly that asymmetry.
//
// Two distinct failures hide behind it, and only the second one looks like a
// crash-free lie:
//   TRUNCATED — the element is taller/wider than the viewport, so the capture
//               stops at the fold and the tester gets a fragment.
//   DISPLACED — the element starts ABOVE the viewport (negative rect.top).
//               The crop origin gets clamped to 0 while the height does not,
//               so the capture is the right SIZE at the WRONG PLACE: it
//               contains pixels that are not the selected element at all.
//
// Each fixture is built from flat colours whose correct answer is a specific
// mix, so a wrong capture reads as a number, not a vibe.
//
// Run with QAPTURE_EXPECT=lenient to report numbers without failing.
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
const PORT = 5188;
const BASE = `http://localhost:${PORT}/`;
const LENIENT = process.env.QAPTURE_EXPECT === 'lenient';

const VIEW = { width: 1280, height: 900 };

let failures = 0;
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
  defaultViewport: VIEW,
});

async function enterCaptureMode(page, desc) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if (!sr || sr.querySelector('[data-qa-capture-root]')) return;
      const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
      if (cta) cta.click();
      else sr.querySelector('button')?.click(); // FAB → opens the panel
    });
    await sleep(500);
  }
  const inCapture = await page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]'));
  if (!inCapture) throw new Error(`could not enter capture mode for "${desc}"`);
}

/** Drive an element PICK: a click with no drag, then annotate and save. */
async function captureElement(page, x, y, desc) {
  await enterCaptureMode(page, desc);
  await page.mouse.move(x, y);
  await sleep(120);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(3000);

  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (!ta) throw new Error(`annotation card never appeared for "${desc}"`);
  await ta.click();
  await ta.type(desc);
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1200);
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

function report(name, m) {
  if (m.error) { ok(false, `${name}: could not measure (${m.error})`, true); return null; }
  console.log(
    `  info   ${name}: ${m.width}x${m.height} (aspect ${(m.width / m.height).toFixed(2)}), ` +
    `red ${(m.redFraction * 100).toFixed(1)}% / green ${(m.greenFraction * 100).toFixed(1)}% / ` +
    `other ${(m.otherFraction * 100).toFixed(1)}%`,
  );
  return m;
}

/** The captured image should have the element's aspect ratio, whatever the scale. */
function aspectOk(m, expected, tol = 0.06) {
  return Math.abs(m.width / m.height - expected) <= expected * tol;
}

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1200);

  await page.evaluate(() => {
    document.body.style.margin = '0';
    document.documentElement.style.scrollBehavior = 'auto';
    document.body.style.scrollBehavior = 'auto';

    const box = (id, css) => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = `position:absolute;z-index:999;${css}`;
      document.body.appendChild(el);
      return el;
    };
    // Children are pointer-events:none so elementFromPoint resolves to the
    // OUTER box — the element the tester means to pick.
    const stripe = (parent, css) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;pointer-events:none;${css}`;
      parent.appendChild(el);
    };

    // 1. Twice as tall as the viewport: top half red, bottom half green.
    const tall = box('qa-tall', 'left:40px;top:0;width:400px;height:1800px;background:#ffffff;');
    stripe(tall, 'left:0;top:0;width:100%;height:900px;background:#ff0000;');
    stripe(tall, 'left:0;top:900px;width:100%;height:900px;background:#00b300;');

    // 2. All green, and it will be scrolled so it STARTS above the viewport.
    //    Directly beneath it sits a red block: any capture that slides down
    //    the page to fill its height eats red it was never asked for.
    box('qa-above', 'left:500px;top:3000px;width:400px;height:600px;background:#00b300;');
    box('qa-below', 'left:500px;top:3600px;width:400px;height:600px;background:#ff0000;');

    // 3. Wider than the viewport: left half red, right half green.
    const wide = box('qa-wide', 'left:0;top:5000px;width:2000px;height:200px;background:#ffffff;');
    stripe(wide, 'left:0;top:0;width:1000px;height:100%;background:#ff0000;');
    stripe(wide, 'left:1000px;top:0;width:1000px;height:100%;background:#00b300;');

    document.body.style.minHeight = '6400px';
    window.scrollTo(0, 0);
  });
  await sleep(700);

  const env = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    vh: document.documentElement.clientHeight,
    dpr: window.devicePixelRatio,
  }));
  console.log(`  info   layout viewport ${env.vw}x${env.vh}, dpr ${env.dpr}`);

  // ── CASE 1: element taller than the viewport ───────────────────────────
  // Visible slice is red only; the green half lives below the fold. A capture
  // that stops at the fold is 100% red and half the height it should be.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  await captureElement(page, 240, 400, 'tall element fixture');
  const tall = report('taller than viewport', await measure(page, 'tall element fixture'));
  if (tall) {
    ok(aspectOk(tall, 400 / 1800), `taller than viewport: image has the element's shape (400x1800)`);
    ok(
      tall.greenFraction > 0.45 && tall.redFraction > 0.45,
      tall.greenFraction > 0.45 && tall.redFraction > 0.45
        ? 'taller than viewport: the whole element was captured, below the fold included'
        : `taller than viewport: TRUNCATED at the fold — only ${(tall.greenFraction * 100).toFixed(1)}% of the below-fold half survived`,
    );
  }

  // ── CASE 2: element starting above the viewport ────────────────────────
  // Scrolled so the green element spans viewport y -300..300 and the red
  // block beneath it spans 300..900.
  const above = await page.evaluate(() => {
    window.scrollTo(0, 3300);
    return null;
  });
  void above;
  await sleep(500);
  const pos = await page.evaluate(() => {
    const a = document.getElementById('qa-above').getBoundingClientRect();
    const b = document.getElementById('qa-below').getBoundingClientRect();
    return { aTop: a.top, aBottom: a.bottom, bTop: b.top, scrollY: window.scrollY };
  });
  console.log(`  info   above-fold element at viewport y=${pos.aTop}..${pos.aBottom}, red block starts at ${pos.bTop}`);
  ok(pos.aTop < 0, 'fixture: the element starts above the top of the viewport', true);
  await captureElement(page, 700, 150, 'above-viewport element fixture');
  const disp = report('starts above viewport', await measure(page, 'above-viewport element fixture'));
  if (disp) {
    ok(aspectOk(disp, 400 / 600), `starts above viewport: image has the element's shape (400x600)`);
    ok(
      disp.greenFraction > 0.9,
      disp.greenFraction > 0.9
        ? 'starts above viewport: the capture is the element, all of it'
        : `starts above viewport: DISPLACED — ${(disp.redFraction * 100).toFixed(1)}% of the image is the block BELOW the element`,
    );
  }

  // ── CASE 3: element wider than the viewport ────────────────────────────
  await page.evaluate(() => window.scrollTo(0, 5000));
  await sleep(500);
  await captureElement(page, 640, 100, 'wide element fixture');
  const wide = report('wider than viewport', await measure(page, 'wide element fixture'));
  if (wide) {
    ok(aspectOk(wide, 2000 / 200), `wider than viewport: image has the element's shape (2000x200)`);
    ok(
      wide.greenFraction > 0.45 && wide.redFraction > 0.45,
      wide.greenFraction > 0.45 && wide.redFraction > 0.45
        ? 'wider than viewport: the whole element was captured, off-screen side included'
        : `wider than viewport: TRUNCATED at the edge — green side is only ${(wide.greenFraction * 100).toFixed(1)}%`,
    );
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nELEMENT CAPTURE: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nELEMENT CAPTURE PASS ✅  clicking an element captures the whole element');
