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
//   6. WELCOME CARD       — shown once to a first-time tester, then never.
//   7. ERROR CATCHER      — a failed request offers a one-tap capture, with
//      the error already written into the note.
//   8. RE-TEST EVIDENCE   — "Re-test now" re-shoots the target and stores it
//      as the after image beside the original.
//   9. SHARE              — where the OS can take a file, the archive is
//      handed to the share sheet as a real .zip File.
//  10. BULK ACTIONS       — select many notes and change or delete them in
//      one pass, with a single undo.
//  11. COMPACT LIST       — one line per note, expandable in place.
//  12. PANEL DOCKING      — the panel can move to the other edge and collapse
//      to its header, so it stops covering the app under test.
//  13. WHOLE-SCREEN SHOT  — capture everything visible without dragging.
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
    // Headless Chrome has no share sheet. Stub it so the share PATH is tested
    // (button renders, a real File is handed over) rather than skipped.
    window.__qaShared = null;
    navigator.canShare = () => true;
    navigator.share = (data) => {
      window.__qaShared = {
        title: data.title,
        files: (data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size })),
      };
      return Promise.resolve();
    };
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

  // ── 6. Welcome card (first, while this browser is still "new") ─────────
  await page.evaluate(() => { window.__qaSR().querySelector('button').click(); });
  await sleep(600);
  const welcomeText = await page.evaluate(() => {
    const sr = window.__qaSR();
    const note = sr.querySelector('[role="note"]');
    return note ? note.textContent : '';
  });
  ok(/Testing/i.test(welcomeText), `6. a first-time tester sees a welcome card (got "${(welcomeText || '').slice(0, 40)}…")`);
  ok(/Got it/i.test(welcomeText), '6. the welcome card has a single dismiss action');

  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /got it/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(400);
  ok(!(await page.evaluate(() => !!window.__qaSR().querySelector('[role="note"]'))),
    '6. dismissing it removes it');
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(() => { window.__qaSR().querySelector('button').click(); });
  await sleep(700);
  ok(!(await page.evaluate(() => !!window.__qaSR().querySelector('[role="note"]'))),
    '6. and it stays gone after a reload');
  await page.evaluate(() => { window.__qaSR().querySelector('button').click(); }); // close panel
  await sleep(400);

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
  // ── 7. Error catcher ───────────────────────────────────────────────────
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /got it/i.test(x.textContent || ''));
    if (b) b.click();
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      document.dispatchEvent(esc);
    }
  });
  await sleep(400);

  // A request that fails outright — the kind of breakage a tester misses.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /failing fetch/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1500);

  const prompt = await page.evaluate(() => {
    const sr = window.__qaSR();
    const text = sr.textContent || '';
    return {
      shown: /just broke/i.test(text),
      hasAction: [...sr.querySelectorAll('button')].some((b) => /capture it/i.test(b.textContent || '')),
    };
  });
  ok(prompt.shown, '7. a failed request offers to capture what just broke');
  ok(prompt.hasAction, '7. the prompt carries a one-tap capture action');

  if (prompt.hasAction) {
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture it/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(700);
    ok(await inCapture(), '7. tapping it enters capture mode');
    // The annotation box only exists once something is selected — the tester
    // still points at WHERE it broke; the prefill is waiting for them there.
    const errTarget = await page.evaluate(() => {
      const el = [...document.querySelectorAll('h2')][0];
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(errTarget.x, errTarget.y);
    await sleep(2600);
    const prefill = await page.evaluate(() => {
      const ta = window.__qaSR().querySelector('textarea');
      return ta ? ta.value : '';
    });
    ok(/Error seen/i.test(prefill) && prefill.length > 12,
      `7. the note opens with the error already written in (got "${prefill.slice(0, 50)}…")`);
    await page.keyboard.press('Escape');
    await sleep(400);
  }

  // ── 8. Re-test evidence ────────────────────────────────────────────────
  // Capture a real element, mark it fixed, then re-shoot it.
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
  await sleep(500);
  const retestTarget = await page.evaluate(() => {
    const el = [...document.querySelectorAll('h2')][0];
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(retestTarget.x, retestTarget.y);
  await sleep(2600);
  const ta2 = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (ta2) { await ta2.click(); await ta2.type('retest fixture'); }
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1200);

  // Open the panel and move the note into the re-test queue.
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (![...sr.querySelectorAll('li')].length) sr.querySelector('button').click();
  });
  await sleep(500);
  await page.evaluate(() => {
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('retest fixture'));
    const pill = li && [...li.querySelectorAll('button')].find((b) => /Open/.test(b.textContent || ''));
    if (pill) pill.click();
  });
  await sleep(600);

  const hasRetestButton = await page.evaluate(() => {
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('retest fixture'));
    return li ? [...li.querySelectorAll('button')].some((b) => /re-test now/i.test(b.textContent || '')) : false;
  });
  ok(hasRetestButton, '8. a note in the re-test queue offers "Re-test now"');

  await page.evaluate(() => {
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('retest fixture'));
    const b = li && [...li.querySelectorAll('button')].find((x) => /re-test now/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(4000);

  const retested = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
      all.onerror = () => resolve(null);
      all.onsuccess = () => {
        const n = all.result.find((x) => x.description === 'retest fixture');
        resolve(n ? { hasAfter: !!n.afterScreenshot, afterAt: n.afterAt, afterSize: n.afterScreenshot?.size ?? 0 } : null);
      };
    };
  }));
  ok(retested?.hasAfter, '8. re-testing stores an "after" screenshot on the note');
  ok((retested?.afterSize ?? 0) > 0 && !!retested?.afterAt,
    `8. the after image has real bytes and a timestamp (${retested?.afterSize} bytes)`);

  const showsBoth = await page.evaluate(() => {
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('retest fixture'));
    if (!li) return false;
    const text = li.textContent || '';
    return /Before/.test(text) && /After/.test(text) && li.querySelectorAll('img').length >= 2;
  });
  ok(showsBoth, '8. the note shows the before and after images together');

  // ── 9. Share ───────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Export$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(600);
  const hasShare = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Share$/i.test((x.textContent || '').trim()));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(hasShare, '9. the export dialog offers Share where the OS can take a file');
  await sleep(3500);
  const shared = await page.evaluate(() => window.__qaShared);
  ok(!!shared && shared.files?.length === 1, '9. sharing hands over exactly one file');
  ok(/\.zip$/.test(shared?.files?.[0]?.name || ''),
    `9. the shared file is the campaign archive (got "${shared?.files?.[0]?.name}")`);
  ok((shared?.files?.[0]?.size ?? 0) > 500,
    `9. the shared archive has real content (${shared?.files?.[0]?.size} bytes)`);
  // ── 10. Bulk actions ───────────────────────────────────────────────────
  // Get back to the panel with the notes this run created.
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (![...sr.querySelectorAll('li')].length) sr.querySelector('button').click();
  });
  await sleep(600);
  // Clear any filter a previous section left behind.
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^All/.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(400);

  const enteredSelect = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Select$/i.test((x.textContent || '').trim()));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(enteredSelect, '10. the notes list offers a Select mode');
  await sleep(400);

  const selectedAll = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /select all/i.test(x.textContent || ''));
    if (!b) return 0;
    b.click();
    return 1;
  });
  await sleep(400);
  const selectionLabel = await page.evaluate(() => (window.__qaSR().textContent || '').match(/(\d+) selected/)?.[1]);
  ok(selectedAll === 1 && Number(selectionLabel) > 1,
    `10. "Select all" selects every visible note (${selectionLabel} selected)`);

  const beforeStatuses = (await readNotes()).map((n) => n.status);
  await page.evaluate(() => {
    const bar = [...window.__qaSR().querySelectorAll('button')].filter((x) => /^Verified$/i.test((x.textContent || '').trim()));
    // The bulk bar's button is the one that is NOT inside a note <li>.
    const target = bar.find((b) => !b.closest('li'));
    if (target) target.click();
  });
  await sleep(1500);
  const afterStatuses = (await readNotes()).map((n) => n.status);
  ok(afterStatuses.length > 1 && afterStatuses.every((st) => st === 'verified'),
    `10. one tap marks every selected note verified (was ${JSON.stringify(beforeStatuses)}, now ${JSON.stringify(afterStatuses)})`);

  // Bulk delete, then undo it — one toast for the whole batch.
  const countBefore = (await readNotes()).length;
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Select$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /select all/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Delete$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(600);
  const undoCount = await page.evaluate(() => {
    const sr = window.__qaSR();
    const listed = sr.querySelectorAll('li').length;
    const undo = [...sr.querySelectorAll('button')].filter((b) => /^Undo$/i.test((b.textContent || '').trim()));
    return { listed, undos: undo.length };
  });
  ok(undoCount.listed === 0, '10. a bulk delete clears the list immediately');
  ok(undoCount.undos === 1, `10. and offers ONE undo for the whole batch (found ${undoCount.undos})`);

  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Undo$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(800);
  ok((await readNotes()).length === countBefore,
    `10. undo restores the whole batch (${countBefore} notes)`);

  // ── 11. Compact list ───────────────────────────────────────────────────
  const compact = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /compact list/i.test(x.textContent || ''));
    if (!b) return null;
    b.click();
    return true;
  });
  await sleep(600);
  ok(compact === true, '11. the list offers a compact view');
  const compactHeights = await page.evaluate(() =>
    [...window.__qaSR().querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().height)));
  ok(compactHeights.length > 0 && compactHeights.every((h) => h < 60),
    `11. compact rows are one line tall (heights: ${JSON.stringify(compactHeights.slice(0, 4))})`);

  await page.evaluate(() => {
    const li = window.__qaSR().querySelector('li button');
    if (li) li.click();
  });
  await sleep(500);
  const expandedHeight = await page.evaluate(() =>
    Math.round(window.__qaSR().querySelector('li').getBoundingClientRect().height));
  ok(expandedHeight > 60, `11. tapping a compact row opens the full card in place (${expandedHeight}px)`);

  // ── 12. Panel docking ──────────────────────────────────────────────────
  const sideBefore = await page.evaluate(() => {
    const panel = [...window.__qaSR().querySelectorAll('div')].find((d) => d.className.includes('qa-w-panel'));
    return Math.round(panel.getBoundingClientRect().left);
  });
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /other side/i.test(x.getAttribute('aria-label') || ''));
    if (b) b.click();
  });
  await sleep(600);
  const sideAfter = await page.evaluate(() => {
    const panel = [...window.__qaSR().querySelectorAll('div')].find((d) => d.className.includes('qa-w-panel'));
    return Math.round(panel.getBoundingClientRect().left);
  });
  ok(sideAfter > sideBefore + 200, `12. the panel moves to the other edge (left ${sideBefore} → ${sideAfter})`);

  const collapsed = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Collapse$/i.test(x.getAttribute('aria-label') || ''));
    if (!b) return null;
    b.click();
    return true;
  });
  await sleep(600);
  const collapsedState = await page.evaluate(() => {
    const sr = window.__qaSR();
    const panel = [...sr.querySelectorAll('div')].find((d) => d.className.includes('qa-w-panel'));
    return {
      height: Math.round(panel.getBoundingClientRect().height),
      hasNotes: sr.querySelectorAll('li').length > 0,
    };
  });
  ok(collapsed === true && collapsedState.height < 90 && !collapsedState.hasNotes,
    `12. collapsing leaves only the header strip (${collapsedState.height}px, notes hidden: ${!collapsedState.hasNotes})`);

  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Expand$/i.test(x.getAttribute('aria-label') || ''));
    if (b) b.click();
  });
  await sleep(500);
  ok(await page.evaluate(() => window.__qaSR().querySelectorAll('li').length > 0),
    '12. expanding brings the list back');

  // ── 13. Whole-screen capture ───────────────────────────────────────────
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
  await sleep(600);
  const wholeScreen = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /whole screen/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(wholeScreen, '13. capture mode offers a whole-screen shot');
  await sleep(3000);
  const ta3 = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  ok(!!ta3, '13. it goes straight to the annotation card, no dragging');
  if (ta3) {
    await ta3.click();
    await ta3.type('whole screen fixture');
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(1500);
    const shot = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('playground-db');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
        all.onerror = () => resolve(null);
        all.onsuccess = async () => {
          const n = all.result.find((x) => x.description === 'whole screen fixture');
          if (!n?.screenshot) return resolve(null);
          const bmp = await createImageBitmap(n.screenshot);
          resolve({ w: bmp.width, h: bmp.height, ratio: bmp.width / bmp.height });
        };
      };
    }));
    const viewportRatio = 1280 / 900;
    ok(!!shot && Math.abs(shot.ratio - viewportRatio) / viewportRatio < 0.05,
      `13. the saved shot is the whole viewport (${shot?.w}x${shot?.h}, ratio ${shot?.ratio?.toFixed(2)} vs ${viewportRatio.toFixed(2)})`);
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nLOOP FEATURES: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nLOOP FEATURES PASS ✅  shortcut + steps + re-test queue + auto-backup + drawing + welcome + error catcher + re-test evidence + share + bulk + compact + docking + whole-screen');
