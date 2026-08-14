// v0.5 "Loop" feature test (real Chrome).
//
// Every one of these features is invisible to a unit test: a shortcut that
// doesn't fire, a step trail that records nothing, a status that won't cycle,
// a backup that never downloads and a drawing that isn't burned into the
// saved image all "work" right up until a human tries them. So this drives
// real Chrome and asserts on the stored data.
//
//   1. CAPTURE SHORTCUT   — Alt+Shift+C enters capture mode from the page,
//      and pressing it again backs out.
//   2. STEPS BEFORE THIS  — interactions leading up to a note are recorded,
//      in order, WITHOUT the text that was typed.
//   3. RE-TEST QUEUE      — the status pill cycles open → fixed → verified.
//   4. AUTO-BACKUP        — a backup download fires on the 5th note.
//   5. DRAW ON THE SHOT   — marks are flattened into the stored screenshot.
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
const PORT = 5187;

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok   - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--host'], { cwd: PLAY, stdio: 'ignore' });
await sleep(3500);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
    // Count backup downloads: exportZip appends an <a download> and clicks it.
    window.__qaDownloads = [];
    document.addEventListener('click', (e) => {
      const a = e.target;
      if (a && a.tagName === 'A' && a.hasAttribute('download')) {
        window.__qaDownloads.push(a.getAttribute('download'));
      }
    }, true);
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle2' });
  await sleep(1200);

  const inCapture = () => page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]'));
  const readNotes = () => page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
      all.onerror = () => resolve([]);
      all.onsuccess = () => resolve(all.result.map((n) => ({
        id: n.id,
        description: n.description,
        status: n.status,
        steps: n.context?.steps ?? [],
        hasShot: !!n.screenshot,
      })));
    };
  }));

  // ── 1. Capture shortcut ────────────────────────────────────────────────
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await sleep(600);
  ok(await inCapture(), '1. Alt+Shift+C enters capture mode straight from the page');

  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await sleep(500);
  ok(!(await inCapture()), '1. pressing it again backs out of capture mode');

  // ── 2. Steps before this ───────────────────────────────────────────────
  // Do a few recognisable things, including typing a secret we then assert
  // never appears anywhere in the recorded trail.
  const SECRET = 'hunter2-should-never-be-recorded';
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /place order/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(150);
  const addressInput = await page.$('input[placeholder="Address"], input');
  if (addressInput) { await addressInput.click(); await addressInput.type(SECRET); }
  await sleep(150);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /trigger console error/i.test(b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(300);

  const addQuickNote = async (text) => {
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if (![...sr.querySelectorAll('button')].some((b) => /quick note/i.test(b.textContent || ''))) {
        sr.querySelector('button').click(); // FAB opens the panel
      }
    });
    await sleep(400);
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /quick note/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(250);
    const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
    if (!ta) throw new Error('quick-note textarea not found');
    await ta.click();
    await ta.type(text);
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /add point/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(500);
  };

  await addQuickNote('steps fixture');
  const afterSteps = await readNotes();
  const stepsNote = afterSteps.find((n) => n.description === 'steps fixture');
  ok(!!stepsNote, '2. the steps fixture note was saved');
  const steps = stepsNote?.steps ?? [];
  ok(steps.length > 0, `2. interactions before the note were recorded (${steps.length} steps)`);
  ok(steps.some((s) => s.kind === 'click' && /place order/i.test(s.label)),
    '2. the trail names the button that was clicked ("Place order")');
  ok(steps.some((s) => s.kind === 'type'),
    '2. typing into a field is recorded as a step');

  const serialised = JSON.stringify(steps);
  ok(!serialised.includes(SECRET),
    '2. PRIVACY: the text that was typed appears nowhere in the trail');
  ok(!steps.some((s) => s.label && s.label.includes('qapture')) &&
     !steps.some((s) => /Add point|quick note/i.test(s.label || '')),
    "2. the widget's own UI is excluded from the tester's steps");
  const times = steps.map((s) => s.t);
  ok(times.every((t, i) => i === 0 || t >= times[i - 1]), '2. steps are in the order they happened');

  // ── 3. Re-test queue ───────────────────────────────────────────────────
  const cycleStatus = async () => {
    await page.evaluate((desc) => {
      const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes(desc));
      const pill = li && [...li.querySelectorAll('button')].find((b) => /Open|Re-test|Verified/.test(b.textContent || ''));
      if (pill) pill.click();
    }, 'steps fixture');
    await sleep(450);
    return (await readNotes()).find((n) => n.description === 'steps fixture')?.status;
  };
  ok(await cycleStatus() === 'fixed', '3. tapping the status pill moves a note Open → Re-test');
  ok(await cycleStatus() === 'verified', '3. tapping again moves it Re-test → Verified');
  ok(await cycleStatus() === 'open', '3. tapping again returns it to Open');

  const retestBadge = await page.evaluate(async () => {
    // Put it back into the re-test queue and look for the header badge.
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('steps fixture'));
    const pill = li && [...li.querySelectorAll('button')].find((b) => /Open/.test(b.textContent || ''));
    if (pill) pill.click();
    await new Promise((r) => setTimeout(r, 400));
    return [...window.__qaSR().querySelectorAll('button')]
      .some((b) => (b.getAttribute('aria-label') || '').includes('waiting to be re-tested'));
  });
  ok(retestBadge, '3. the panel header shows a badge while notes await a re-test');

  // ── 4. Auto-backup ─────────────────────────────────────────────────────
  const before = await page.evaluate(() => window.__qaDownloads.length);
  for (let i = 2; i <= 5; i++) await addQuickNote(`backup fixture ${i}`);
  await sleep(1500);
  const downloads = await page.evaluate(() => window.__qaDownloads.slice());
  ok(downloads.length > before, `4. a backup downloaded automatically once 5 notes existed (${downloads.length} download(s))`);
  ok(downloads.some((name) => /qa-autosave/.test(name || '')),
    `4. the backup is named as an autosave (got ${JSON.stringify(downloads)})`);

  // ── 5. Draw on the screenshot ──────────────────────────────────────────
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  await sleep(500);
  ok(await inCapture(), '5. entered capture mode for the drawing test');

  // Select a big, plain element so any red pixel must be ours.
  const target = await page.evaluate(() => {
    const el = [...document.querySelectorAll('p, h2')].find((e) => e.getBoundingClientRect().width > 200);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(target.x, target.y);
  await sleep(2600);

  const openedEditor = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /draw on it/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(openedEditor, '5. tapping the screenshot opens the drawing editor');
  await sleep(600);

  const canvasBox = await page.evaluate(() => {
    const c = window.__qaSR().querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  ok(!!canvasBox, '5. the editor shows the screenshot on a canvas');

  if (canvasBox) {
    // Drag a box across the middle of the image.
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.2, canvasBox.y + canvasBox.height * 0.35);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.5, canvasBox.y + canvasBox.height * 0.5, { steps: 6 });
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.8, canvasBox.y + canvasBox.height * 0.65, { steps: 6 });
    await page.mouse.up();
    await sleep(400);

    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Done');
      if (b) b.click();
    });
    await sleep(900);

    const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
    if (ta) { await ta.click(); await ta.type('drawn fixture'); }
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(1200);

    const redFraction = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('playground-db');
      req.onerror = () => resolve(-1);
      req.onsuccess = () => {
        const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
        all.onerror = () => resolve(-1);
        all.onsuccess = async () => {
          const note = all.result.find((n) => n.description === 'drawn fixture');
          if (!note?.screenshot) return resolve(-1);
          const bmp = await createImageBitmap(note.screenshot);
          const c = document.createElement('canvas');
          c.width = bmp.width; c.height = bmp.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
          let red = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 170 && data[i + 1] < 110 && data[i + 2] < 110) red++;
          }
          resolve(red / (data.length / 4));
        };
      };
    }));
    ok(redFraction > 0.0005,
      `5. the drawn mark is burned into the SAVED screenshot (${(redFraction * 100).toFixed(2)}% red pixels)`);
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nLOOP FEATURES: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nLOOP FEATURES PASS ✅  shortcut + steps + re-test queue + auto-backup + drawing');
