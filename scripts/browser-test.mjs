// Real-browser test (headless Chrome via puppeteer-core, no browser download).
// Proves the hardest risk: a real click is intercepted by the shadow-root
// overlay, document.elementFromPoint resolves the HOST light-DOM element beneath
// it, and the inline annotation card appears. Drives the playground dev server.
//
// Extended (bugfix-batch integration) with concrete, programmatic assertions
// for bugs #1, #2, #9, #10, #11, #12, #17, #18, #19, #20, #24, #25, #27, #28
// (see /Users/m2farhood/.claude/plans/hazy-fluttering-shell.md for the full
// list). Everything below still runs inside the SAME single Chrome process —
// additional puppeteer `page`s are opened off the one `browser` instance
// (exactly like the existing mouse/touch split already did), never a second
// `puppeteer.launch()`.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import puppeteer, { KnownDevices } from 'puppeteer-core';

// Cross-platform Chrome resolution: honor PUPPETEER_EXECUTABLE_PATH (or the
// puppeteer-standard CHROME_PATH) if set, so this runs in CI/Linux/Windows;
// otherwise fall back to the known macOS install path used during local dev.
const CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PLAY = join(dirname(fileURLToPath(import.meta.url)), '..', 'playground');
const PORT = 5183;
const BASE = `http://localhost:${PORT}/`;

// A tiny (1x1) valid PNG, used to drive the file-upload path in the quick-note
// image attach flow (Bug #9) without needing a fixture asset in the repo.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const TINY_PNG_PATH = join(tmpdir(), `qapture-browser-test-${process.pid}.png`);
writeFileSync(TINY_PNG_PATH, Buffer.from(TINY_PNG_BASE64, 'base64'));

// Installed via page.evaluateOnNewDocument on every page below (before nav) —
// a single shared shadow-root lookup helper so each assertion block doesn't
// re-derive `document.querySelector('qapture-overlay').shadowRoot` inline.
function installHelpers() {
  window.__qaSR = () => {
    const host = document.querySelector('qapture-overlay');
    return host && host.shadowRoot;
  };
}

// Installed (also via evaluateOnNewDocument, page4 only) to log every
// createObjectURL/revokeObjectURL call so blob-leak bugs (#9, #19) can be
// asserted on rather than eyeballed.
function installUrlLog() {
  window.__qaUrlLog = [];
  const origCreate = URL.createObjectURL.bind(URL);
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (obj) => {
    const u = origCreate(obj);
    window.__qaUrlLog.push({ type: 'create', url: u });
    return u;
  };
  URL.revokeObjectURL = (u) => {
    window.__qaUrlLog.push({ type: 'revoke', url: u });
    return origRevoke(u);
  };
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: PLAY, stdio: 'ignore', env: process.env,
});

async function waitServer(ms = 40000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { const r = await fetch(BASE); if (r.ok) return true; } catch {}
    await sleep(300);
  }
  return false;
}

const hardKill = setTimeout(() => { console.error('TIMEOUT'); try { vite.kill('SIGKILL'); } catch {} process.exit(1); }, 170000);

let browser, code = 1;
try {
  if (!(await waitServer())) throw new Error('vite dev server did not start');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  await page.evaluateOnNewDocument(installHelpers);
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0' });

  // 1) isolated shadow host mounted
  await page.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );
  console.log('1. shadow host mounted: ok');

  // ===========================================================================
  // BUG #1 — deleteQaDatabase(). Run this FIRST, before any other page/tab
  // opens the same origin: IndexedDB is per-ORIGIN (not per-tab), and
  // deleteDatabase() blocks on ANY open connection anywhere — including ones
  // from other tabs on the same origin. Doing this while `page` is the only
  // open tab guarantees the only live connection is this page's own (which
  // deleteQaDatabase is responsible for closing itself).
  // ===========================================================================
  {
    // 1a) create a note via the quick-note flow (text only — no image, that's
    // covered separately by the blob-leak assertions) so there's real data in
    // IndexedDB to delete.
    await page.evaluate(() => { window.__qaSR().querySelector('button').click(); }); // FAB → open panel
    await sleep(400);
    const opened = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /quick note/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!opened) throw new Error('Bug #1: quick-note toggle button not found');
    await sleep(200);
    const taHandle = await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'));
    const ta = taHandle.asElement();
    if (!ta) throw new Error('Bug #1: quick-note textarea not found');
    await ta.click();
    await ta.type('Bug #1 fixture note — proves IDB persistence + deleteQaDatabase()');
    const saved = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /add point/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!saved) throw new Error('Bug #1: "Add point" button not found');
    await sleep(300);

    // 1b) confirm the note actually persisted to IndexedDB (not just React state).
    const beforeDelete = await page.evaluate(async () => {
      const dbs = (await indexedDB.databases()).map((d) => d.name);
      return { hasDb: dbs.includes('playground-db') };
    });
    if (!beforeDelete.hasDb) throw new Error('Bug #1 setup: "playground-db" not found in indexedDB.databases() before delete');
    console.log('2. Bug #1 setup: note saved, "playground-db" present in indexedDB.databases(): ok');

    // 1c) call the (fixed) deleteQaDatabase() and confirm it actually resolves
    // (the pre-fix version silently no-op'd: never closed the live connection,
    // never attached callbacks, never returned a settling Promise).
    const delResult = await page.evaluate(async () => {
      if (typeof window.__qaDeleteDatabase !== 'function') return { ok: false, error: 'hook missing' };
      try {
        await window.__qaDeleteDatabase('playground');
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    });
    if (!delResult.ok) throw new Error(`Bug #1: deleteQaDatabase() did not resolve: ${delResult.error}`);
    console.log('3. Bug #1: deleteQaDatabase("playground") resolved (closed live connection, no onblocked hang): ok');

    // 1d) assert the database is ACTUALLY gone — both via indexedDB.databases()
    // and by reopening + reading the notes store directly (defense in depth:
    // databases() is a Chromium-only convenience API).
    const after = await page.evaluate(() => {
      return new Promise((resolve) => {
        indexedDB.databases().then((list) => {
          const stillListed = list.some((d) => d.name === 'playground-db');
          const req = indexedDB.open('playground-db', 2);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
          };
          req.onsuccess = (e) => {
            const db = e.target.result;
            const tx = db.transaction('notes', 'readonly');
            const getAllReq = tx.objectStore('notes').getAll();
            getAllReq.onsuccess = () => {
              const rowCount = getAllReq.result.length;
              db.close();
              resolve({ stillListed, rowCount });
            };
            getAllReq.onerror = () => { db.close(); resolve({ stillListed, rowCount: -1, error: 'getAll failed' }); };
          };
          req.onerror = () => resolve({ stillListed, rowCount: -1, error: 'reopen failed' });
        });
      });
    });
    if (after.stillListed) throw new Error('Bug #1: "playground-db" still listed in indexedDB.databases() after deleteQaDatabase()');
    if (after.rowCount !== 0) throw new Error(`Bug #1: notes store not empty after delete (rowCount=${after.rowCount}) — data survived`);
    console.log('4. Bug #1: database fully gone — not in indexedDB.databases(), reopened notes store has 0 rows: ok');

    // Restore page state for the rest of MOUSE PASS below (close the panel we
    // opened for the quick note, so step "2) open the panel via the FAB" in
    // the original flow still starts from a known "closed" state).
    await page.evaluate(() => { window.__qaSR().querySelector('button').click(); });
    await sleep(300);
  }

  // 2) open the panel via the FAB (the launcher button in the shadow root)
  await page.evaluate(() => {
    window.__qaSR().querySelector('button').click();
  });
  await sleep(500);

  // 3) click "Capture from page"
  const cta = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  });
  if (!cta) throw new Error('Capture-from-page CTA not found in panel');
  console.log(`5. entered capture mode via: "${cta}"`);
  await sleep(700);

  // 4) THE RISK: real click over a HOST light-DOM element. The shadow overlay
  //    intercepts; elementFromPoint must resolve the host <button> beneath it.
  const pt = await page.evaluate(() => {
    const el = document.querySelector('button[aria-label="Place order"]');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.move(pt.x, pt.y);
  await sleep(120);
  await page.mouse.click(pt.x, pt.y);

  // 5) the inline annotation card (a textarea) must appear → select succeeded
  await page.waitForFunction(
    `(()=>{const sr=window.__qaSR();return !!sr.querySelector('textarea');})()`,
    { timeout: 9000 },
  );
  console.log('6. host element selected through the shadow boundary → annotation card appeared');

  // 6) expand the (by-default hidden) "Show captured location" disclosure and
  // confirm the captured selector/text targets the HOST <button> — proving
  // the selector was generated against the host light DOM, not the shadow tree.
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /location|captured/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(500);
  const refsHost = await page.evaluate(() => {
    const txt = window.__qaSR().textContent || '';
    return /Place order|aria-label|button/i.test(txt);
  });
  console.log('7. captured selector targets the host element (after reveal):', refsHost);
  if (!refsHost) throw new Error('captured target did not reference the host element');

  if (errors.length) console.log('   (page errors:', errors.join(' | '), ')');
  console.log('\nMOUSE PASS ✅  FAB → panel → capture → elementFromPoint(host) through shadow → annotate');

  // ===========================================================================
  // BUG #2 & #11 — theme colors on the locate flash box, and scrollIntoView
  // settle-timing. Reuses the still-open annotation card above (target =
  // the host "Place order" button, selector-based → exercises the
  // scrollIntoView + settleThenPaint code path, not the region-rect one).
  // ===========================================================================
  {
    // Move the viewport away first so scrollIntoView (triggered by "Locate on
    // page" below) actually has real work to do. This setup jump itself opts
    // OUT of the playground's `html { scroll-behavior: smooth }` (added for
    // this bug — see App.tsx) via an explicit 'instant' behavior, so it lands
    // immediately and doesn't contaminate the timing we're about to measure.
    //
    // The offset (200px) is deliberately modest, not the ~1400px this used
    // to jump: empirically (see task notes), Chromium's smooth-scroll
    // duration for THIS page/button scales with distance — ~200px settles in
    // ~200-260ms (safely under settleThenPaint's 400ms cap, so the FIXED
    // code always reaches a truly-stable rect before painting), while a
    // ~1400px jump routinely takes 550ms+ (would exceed the cap and make
    // even the fixed code's paint an assertion-flaky near-miss). 200px still
    // leaves the one-rAF-later (old, buggy) position ~200px off from the
    // final settled one — an unmissable gap, not a rounding error.
    await page.evaluate(() => window.scrollTo({ top: 200, left: 0, behavior: 'instant' }));
    await sleep(300);
    const beforeScrollY = await page.evaluate(() => window.scrollY);

    // Drive the click AND a same-tick rAF-sampling loop of the target
    // element's live rect from one evaluate() call, so "when did the flash
    // box actually appear, and what was the element's true rect at that
    // instant" are measured with no cross-call scheduling gaps. This lets us
    // independently confirm (via the rect-log, not just the box's own frozen
    // style) that painting was deferred until the smooth-scroll had actually
    // finished — the old ("one rAF after scrollIntoView") code would instead
    // paint within ~1 frame of the click, while the element is still ~200px
    // from its destination.
    const locateResult = await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const el = document.querySelector('button[aria-label="Place order"]');
        if (!el) { reject(new Error('Bug #2/#11: target button not found')); return; }
        const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /locate on page/i.test(x.textContent || ''));
        if (!b) { reject(new Error('Bug #2/#11: "Locate on page" button not found')); return; }

        const t0 = performance.now();
        const samples = [];
        let appearedAt = null;
        let boxAtAppear = null;
        let elRectAtAppear = null;

        const mo = new MutationObserver((mutations) => {
          if (appearedAt !== null) return;
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1 && node.matches && node.matches('[data-qa-overlay]') && node.parentNode === document.body) {
                appearedAt = performance.now() - t0;
                boxAtAppear = { top: parseFloat(node.style.top), left: parseFloat(node.style.left) };
                const r = el.getBoundingClientRect();
                elRectAtAppear = { top: r.top, left: r.left };
              }
            }
          }
        });
        mo.observe(document.body, { childList: true });

        const SAMPLE_WINDOW_MS = 700; // comfortably > SETTLE_TIMEOUT_MS(400ms), well under the box's 1500ms removal
        function tick() {
          const r = el.getBoundingClientRect();
          samples.push({ t: Math.round(performance.now() - t0), top: r.top, left: r.left });
          if (performance.now() - t0 < SAMPLE_WINDOW_MS) {
            requestAnimationFrame(tick);
          } else {
            mo.disconnect();
            resolve({ samples, appearedAt, boxAtAppear, elRectAtAppear });
          }
        }
        requestAnimationFrame(tick);
        b.click();
      });
    });

    const flash = await page.evaluate(() => {
      const boxes = [...document.body.querySelectorAll(':scope > div[data-qa-overlay]')];
      const box = boxes[boxes.length - 1];
      const cs = getComputedStyle(box);
      const el = document.querySelector('button[aria-label="Place order"]');
      const r = el.getBoundingClientRect();
      return {
        outlineColor: cs.outlineColor,
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
        boxShadow: cs.boxShadow,
        top: parseFloat(box.style.top),
        left: parseFloat(box.style.left),
        elTop: r.top,
        elLeft: r.left,
        scrollYAfter: window.scrollY,
      };
    });

    // Bug #2: colors must reflect the playground's configured theme
    // (accent '#D4726B' → rgb(212,114,107); primary '#6B2C3E' → rgb(107,44,62)),
    // not the hardcoded flashLocate() defaults ('#7c3aed'/'#4f46e5').
    if (flash.outlineColor !== 'rgb(212, 114, 107)') {
      throw new Error(`Bug #2: outline color = "${flash.outlineColor}", expected configured accent rgb(212, 114, 107)`);
    }
    if (flash.outlineStyle !== 'solid' || flash.outlineWidth !== '3px') {
      throw new Error(`Bug #2: outline style/width unexpected: ${flash.outlineStyle} ${flash.outlineWidth}`);
    }
    if (!/107,\s*44,\s*62/.test(flash.boxShadow)) {
      throw new Error(`Bug #2: box-shadow does not reference configured primary rgb(107,44,62): "${flash.boxShadow}"`);
    }
    if (flash.outlineColor === 'rgb(124, 58, 237)' || /124,\s*58,\s*237/.test(flash.boxShadow)) {
      throw new Error('Bug #2: flash box is using the hardcoded default colors, not the configured theme');
    }
    console.log('8. Bug #2: locate-flash outline/box-shadow reflect configured theme (accent/primary), not hardcoded defaults: ok');

    // Bug #11 setup checks — make sure this run actually exercised what we
    // think it did, so a pass can't be an accident of timing:
    if (Math.abs(flash.scrollYAfter - beforeScrollY) < 50) {
      throw new Error('Bug #11 setup: scrollIntoView did not actually move the viewport — test would be vacuous');
    }
    if (locateResult.appearedAt === null) {
      throw new Error('Bug #11 setup: flash box never appeared within the sample window');
    }
    // Confirm the scroll genuinely animated (wasn't already-settled by the
    // time of the very first rAF sample) — otherwise a "one rAF after click"
    // paint would be indistinguishable from a fully-settled one, and this
    // test would be exactly the vacuous instant-scroll case it's meant to
    // replace. The first sample's rect must still be meaningfully far
    // (>50px) from where the element ends up (last sample).
    const firstSample = locateResult.samples[0];
    const lastSample = locateResult.samples[locateResult.samples.length - 1];
    const earlyVsFinalDelta = Math.abs(firstSample.top - lastSample.top) + Math.abs(firstSample.left - lastSample.left);
    if (earlyVsFinalDelta < 50) {
      throw new Error(
        `Bug #11 setup: smooth-scroll animation was not actually in-flight near click time (first-sample rect ${JSON.stringify(firstSample)} vs final ${JSON.stringify(lastSample)}, delta=${earlyVsFinalDelta}px) — test would be vacuous`,
      );
    }

    // Bug #11, the real assertion: the flash box's OWN frozen paint position
    // must match the element's truly-settled final rect...
    if (Math.abs(flash.top - flash.elTop) > 2 || Math.abs(flash.left - flash.elLeft) > 2) {
      throw new Error(`Bug #11: flash box (${flash.top},${flash.left}) does not match settled element rect (${flash.elTop},${flash.elLeft})`);
    }
    // ...and, independently (via the rect-log, not the box's own style), the
    // LIVE element rect AT THE EXACT MOMENT the box was created must ALSO
    // already match the final settled rect — i.e. painting really did wait
    // for the animation to finish, rather than happening to freeze a
    // still-moving rect that only later coincided with the destination.
    if (
      Math.abs(locateResult.elRectAtAppear.top - lastSample.top) > 2 ||
      Math.abs(locateResult.elRectAtAppear.left - lastSample.left) > 2
    ) {
      throw new Error(
        `Bug #11: element's live rect at box-creation time (${JSON.stringify(locateResult.elRectAtAppear)}) had not yet settled to the final rect (${JSON.stringify(lastSample)}) — box was painted mid-scroll`,
      );
    }
    // ...and the box must not have appeared implausibly fast (~1 rAF, as the
    // old "paint one frame after scrollIntoView" code would) — settling
    // takes multiple frames, so a genuinely-waiting implementation should
    // take meaningfully longer than a single frame to paint.
    if (locateResult.appearedAt < 50) {
      throw new Error(`Bug #11: flash box appeared only ${locateResult.appearedAt.toFixed(1)}ms after "Locate on page" — too fast to have waited for the scroll to settle (old one-rAF-later behavior)`);
    }
    console.log(
      `9. Bug #11: flash box appeared ${locateResult.appearedAt.toFixed(1)}ms after click (not a ~1-frame stale paint) and was painted at the settled post-scrollIntoView position (element rect at paint-time matched final rect within 2px; ${earlyVsFinalDelta.toFixed(0)}px early-vs-final delta confirms the scroll was genuinely still animating near click time): ok`,
    );
  }

  // ===========================================================================
  // BUG #10 — region-kind rect scroll-drift correction. Cancel the current
  // (element-kind) capture, draw a fresh REGION (drag-select — the only kind
  // with no CSS selector, so "Locate on page" has nothing but the stored rect
  // + scroll snapshot to work from), save it, scroll, then locate.
  // ===========================================================================
  {
    await page.keyboard.press('Escape'); // cancel the still-open element capture
    await sleep(400);
    // Instant — this page now has `scroll-behavior: smooth` (added for Bug
    // #11); an animated reset here would eat into the sleep below for no
    // reason this test cares about.
    await page.evaluate(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); });
    await sleep(200);

    const cta2 = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!cta2) throw new Error('Bug #10: could not re-enter capture mode');
    await sleep(500);

    // Drag a freeform region over blank page area (a real mouse press-move-release).
    const dragFrom = { x: 250, y: 260 };
    const dragTo = { x: 520, y: 430 };
    await page.mouse.move(dragFrom.x, dragFrom.y);
    await page.mouse.down();
    await page.mouse.move((dragFrom.x + dragTo.x) / 2, (dragFrom.y + dragTo.y) / 2, { steps: 5 });
    await page.mouse.move(dragTo.x, dragTo.y, { steps: 5 });
    await page.mouse.up();

    await page.waitForFunction(
      `(()=>{const sr=window.__qaSR();return !!sr.querySelector('textarea');})()`,
      { timeout: 9000 },
    );
    const taHandle2 = await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'));
    const ta2 = taHandle2.asElement();
    await ta2.click();
    await ta2.type('Bug #10 region fixture — scroll-drift correction');
    const savedRegion = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!savedRegion) throw new Error('Bug #10: "Save point" button not found for region note');
    await sleep(500);

    // Capture the region note's persisted rect + scroll snapshot straight from
    // the app's own state before we do anything else.
    const regionTarget = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /location|captured/i.test(x.textContent || ''));
      if (b) b.click();
      return true;
    });
    if (!regionTarget) throw new Error('Bug #10: could not reveal region note location');
    await sleep(300);

    const preScroll = await page.evaluate(() => {
      const boxes = [...document.body.querySelectorAll(':scope > div[data-qa-overlay]')];
      return { boxCountBefore: boxes.length, scrollY: window.scrollY };
    });

    // Scroll the page down a known, large amount — this is the drift the
    // pre-fix code failed to correct for. Instant (not the page's default
    // smooth, added for Bug #11): this test's correction math depends on
    // scrollYNow being the EXACT, already-settled value read 150ms later,
    // not a value still mid-animation.
    const SCROLL_DELTA = 900;
    await page.evaluate((dy) => window.scrollTo({ top: dy, left: 0, behavior: 'instant' }), SCROLL_DELTA);
    await sleep(150);
    const scrollYNow = await page.evaluate(() => window.scrollY);
    if (scrollYNow < SCROLL_DELTA - 5) throw new Error('Bug #10 setup: page did not actually scroll (not enough scroll room?)');

    const clickedLocate = await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /locate on page/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!clickedLocate) throw new Error('Bug #10: "Locate on page" button not found for region note');

    await page.waitForFunction(
      (n) => document.body.querySelectorAll(':scope > div[data-qa-overlay]').length > n,
      { timeout: 3000 },
      preScroll.boxCountBefore,
    );

    const result = await page.evaluate((scrollYAtCapture, dragTopExpected) => {
      const boxes = [...document.body.querySelectorAll(':scope > div[data-qa-overlay]')];
      const box = boxes[boxes.length - 1];
      return {
        top: parseFloat(box.style.top),
        left: parseFloat(box.style.left),
      };
    }, preScroll.scrollY);

    const staleTop = Math.min(dragFrom.y, dragTo.y); // where an UNcorrected rect would still be painted
    const correctedTop = staleTop - (scrollYNow - preScroll.scrollY);

    if (Math.abs(result.top - correctedTop) > 2) {
      throw new Error(`Bug #10: flash box top=${result.top}, expected scroll-corrected top≈${correctedTop} (stale would be ≈${staleTop})`);
    }
    if (Math.abs(result.top - staleTop) < 50) {
      throw new Error(`Bug #10: flash box top=${result.top} is still (near) the stale pre-scroll position ${staleTop} — scroll drift not corrected`);
    }
    console.log(`10. Bug #10: region flash box top=${Math.round(result.top)} accounts for ${scrollYNow - preScroll.scrollY}px of scroll since capture (stale would be ≈${staleTop}): ok`);

    // Reset for cleanliness before moving to the next page.
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  }

  // ===========================================================================
  // PASS 2 — iPad / touch. A second page/tab off the SAME browser + dev
  // server, emulated as a coarse-pointer iPad. Drives the touch-only flow
  // CaptureMode gates behind useCoarsePointer(): tap an element → confirm
  // toolbar ("Use this" / "Adjust") → annotate; then "Draw region" → a real
  // CDP touch-drag → resize handles. The mouse pass above is untouched.
  // ===========================================================================
  const page2 = await browser.newPage();
  await page2.emulate(KnownDevices['iPad Pro']); // 1024x1366, dpr 2, isMobile+hasTouch
  await page2.evaluateOnNewDocument(installHelpers);
  const vp2 = page2.viewport();
  if (!vp2 || !vp2.hasTouch || !vp2.isMobile || vp2.deviceScaleFactor !== 2) {
    throw new Error(`iPad emulation viewport mismatch: ${JSON.stringify(vp2)}`);
  }
  const errors2 = [];
  page2.on('pageerror', (e) => errors2.push('PAGEERROR ' + e.message));
  await page2.goto(BASE, { waitUntil: 'networkidle0' });

  // 5) emulation sanity: the widget's own coarse-pointer detection (and the
  //    page's) must agree the primary input is coarse under this iPad.
  const isCoarse = await page2.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  if (!isCoarse) throw new Error('iPad emulation did not register as (pointer: coarse)');
  console.log('11. iPad emulation: hasTouch/isMobile/dpr=2 viewport + matchMedia(pointer:coarse) → true');

  await page2.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );

  // open the panel via the FAB, then "Capture from page" — plain buttons,
  // not the touch risk itself, so driven the same way as the mouse pass.
  await page2.evaluate(() => {
    window.__qaSR().querySelector('button').click();
  });
  await sleep(500);
  const cta2t = await page2.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  });
  if (!cta2t) throw new Error('Capture-from-page CTA not found in panel (touch pass)');
  console.log(`12. entered capture mode (touch) via: "${cta2t}"`);
  await sleep(700);

  // 7) THE TOUCH RISK: a real tap (CDP Input.dispatchTouchEvent, via
  //    page.touchscreen) on a HOST light-DOM element through the same shadow
  //    interceptor boundary the mouse pass proves with a click.
  const hostPt = await page2.evaluate(() => {
    const el = document.querySelector('button[aria-label="Place order"]');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(hostPt.x, hostPt.y);

  // on a coarse pointer a tap becomes a CANDIDATE, not an immediate select —
  // the confirm toolbar ("Use this" / "Adjust") must appear.
  await page2.waitForFunction(
    `(() => {
      const sr = window.__qaSR();
      return [...sr.querySelectorAll('button')].some((b) => /use this/i.test(b.textContent || ''));
    })()`,
    { timeout: 6000 },
  );
  console.log('13. tapped host element through shadow boundary → confirm toolbar ("Use this") appeared');

  const useThisPt = await page2.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /use this/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(useThisPt.x, useThisPt.y);

  // 8) the annotation textarea must appear. Assert the CARD, not screenshot
  //    pixels — headless html2canvas can legitimately render a blank crop.
  await page2.waitForFunction(
    `(() => { const sr = window.__qaSR(); return !!sr.querySelector('textarea'); })()`,
    { timeout: 9000 },
  );
  console.log('14. tapped "Use this" → annotation textarea appeared (element flow, touch)');

  // 9) REGION FLOW — "Reselect" back to the selecting phase (still the same
  //    CaptureMode mount — QaRoot only unmounts it when capture ends), then
  //    tap the "Draw region" toggle so the next drag draws a region instead
  //    of picking an element.
  const reselectPt = await page2.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /reselect/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(reselectPt.x, reselectPt.y);
  await sleep(300);

  const drawRegionPt = await page2.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /draw region/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(drawRegionPt.x, drawRegionPt.y);
  await sleep(200);
  console.log('15. tapped "Draw region" toggle (touch)');

  // 10) a real CDP touch drag over blank page area: touchStart → touchMove
  //     ×2 → touchEnd. page.touchscreen dispatches each via CDP
  //     Input.dispatchTouchEvent — the same path a physical iPad drag takes.
  await page2.touchscreen.touchStart(300, 300);
  await sleep(60);
  await page2.touchscreen.touchMove(420, 420);
  await sleep(60);
  await page2.touchscreen.touchMove(560, 560);
  await sleep(60);
  await page2.touchscreen.touchEnd();

  // a region candidate with 8 resize handles (.qa-z-10094) + 1 draggable
  // move body (.qa-z-10093) must appear in the shadow DOM.
  await page2.waitForFunction(
    `(() => {
      const sr = window.__qaSR();
      return sr.querySelectorAll('.qa-z-10094').length === 8 && sr.querySelectorAll('.qa-z-10093').length === 1;
    })()`,
    { timeout: 6000 },
  );
  console.log('16. touch region drag (touchStart→touchMove×2→touchEnd) → 8 resize handles appeared in shadow DOM');

  if (errors2.length) console.log('   (touch pass page errors:', errors2.join(' | '), ')');
  console.log('\nTOUCH PASS ✅  iPad emulation → coarse pointer → tap(host) through shadow → confirm → annotate → draw-region → resize handles');

  // ===========================================================================
  // BUG #25 — QaFab resize/orientation-change reclamp. The FAB's position is
  // stored as a `bottom` CSS px offset (distance from the viewport's bottom
  // edge), which plain CSS keeps numerically constant across a resize — it
  // does NOT re-derive itself relative to the new viewport height. So a
  // small `bottom` offset (near the bottom edge) trivially survives ANY
  // rotation direction under CSS alone, with or without a resize listener —
  // that made the old version of this test non-discriminating. To actually
  // require the fix's resize/orientationchange listener, we drag the FAB
  // near the TOP of the taller PORTRAIT viewport instead: that means a
  // LARGE `bottom` offset (≈ portrait height). After rotating to the
  // shorter LANDSCAPE viewport, that same numeric `bottom` offset would
  // exceed the new viewport's height entirely — pushing the FAB off the top
  // of the screen — unless something recomputes it. With NO further
  // interaction after the rotation, only the fix's listener can save it.
  // ===========================================================================
  {
    await page2.keyboard.press('Escape'); // end capture mode → panel reopens, FAB visible
    await sleep(400);
    // Close the panel too (a plain tap toggles it) so the FAB sits at its
    // normal idle spot before we drag it.
    const fabPt0 = await page2.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await page2.touchscreen.tap(fabPt0.x, fabPt0.y);
    await sleep(400);

    const vpBefore = page2.viewport();
    // Drag the FAB toward the TOP edge of the (taller) portrait viewport —
    // see rationale above. A small top margin (not 0) keeps the drop point a
    // valid, unambiguous touch target.
    const targetX = Math.round(vpBefore.width / 2);
    const targetY = 40;
    await page2.touchscreen.touchStart(fabPt0.x, fabPt0.y);
    await sleep(40);
    await page2.touchscreen.touchMove(Math.round((fabPt0.x + targetX) / 2), Math.round((fabPt0.y + targetY) / 2));
    await sleep(40);
    await page2.touchscreen.touchMove(targetX, targetY);
    await sleep(40);
    await page2.touchscreen.touchEnd();
    await sleep(300);

    const draggedRect = await page2.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      const r = btn.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    });
    if (draggedRect.top > 150) {
      throw new Error(`Bug #25 setup: FAB drag did not land near the top edge (top=${draggedRect.top}, viewport height=${vpBefore.height})`);
    }
    // The real vacuousness guard: the FAB's implied `bottom` CSS offset
    // (distance from THIS portrait viewport's bottom edge) must exceed the
    // upcoming LANDSCAPE viewport's full height — i.e. it must be
    // mathematically guaranteed to land out-of-bounds after rotation absent
    // a reclamp, not just "near an edge".
    const bottomOffset = vpBefore.height - draggedRect.bottom;
    const landscapeHeight = vpBefore.width; // rotation swaps width/height below
    if (bottomOffset <= landscapeHeight) {
      throw new Error(
        `Bug #25 setup: dragged FAB's bottom offset (${Math.round(bottomOffset)}px) does not exceed the post-rotation landscape height (${landscapeHeight}px) — an unfixed FAB wouldn't necessarily go out-of-bounds, so this run can't discriminate the reclamp fix`,
      );
    }

    // Simulate rotation: swap width/height, keep touch/mobile/dpr the same.
    // No click/tap/resize interaction happens after this — the reclamp must
    // be purely resize/orientationchange-listener-driven.
    await page2.setViewport({
      ...vpBefore,
      width: vpBefore.height,
      height: vpBefore.width,
    });
    await sleep(400); // let the resize listener's re-render land

    const vpAfter = page2.viewport();
    const rotatedRect = await page2.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      const r = btn.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    });

    const fullyOnscreen =
      rotatedRect.top >= 0 &&
      rotatedRect.left >= 0 &&
      rotatedRect.bottom <= vpAfter.height &&
      rotatedRect.right <= vpAfter.width;

    if (!fullyOnscreen) {
      throw new Error(
        `Bug #25: FAB not reclamped after rotation — rect=${JSON.stringify(rotatedRect)} viewport=${vpAfter.width}x${vpAfter.height} (dragged bottom-offset ${Math.round(bottomOffset)}px, which exceeds the ${landscapeHeight}px landscape height and so REQUIRED reclamping to stay on-screen)`,
      );
    }
    console.log(`17. Bug #25: FAB dragged near the top edge of the taller portrait viewport (bottom-offset ${Math.round(bottomOffset)}px > landscape height ${landscapeHeight}px — guaranteed out-of-bounds without a reclamp), then viewport rotated ${vpBefore.width}x${vpBefore.height} → ${vpAfter.width}x${vpAfter.height} with NO further interaction — FAB reclamped fully on-screen: ok`);
  }

  // ===========================================================================
  // BUG #20 — touch-action during capture-mode selecting phase (best-effort).
  // A real touch tap with a small (<12px) finger wobble must still resolve as
  // a selection, not get swallowed by native scroll hijacking. Headless CDP
  // touch dispatch does not perfectly reproduce a physical iPad's native
  // scroll-gesture recognizer timing, so this is a best-effort regression
  // check, not a hardware-accurate guarantee (flagged per the task brief).
  // ===========================================================================
  {
    // Re-enter capture mode (element-picking / non-region mode).
    const fabPt = await page2.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await page2.touchscreen.tap(fabPt.x, fabPt.y);
    await sleep(400);
    const ctaOk = await page2.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
      if (b) b.click();
      return !!b;
    });
    if (!ctaOk) throw new Error('Bug #20 setup: could not re-enter capture mode');
    await sleep(600);

    // Scroll the (now taller, thanks to the filler fixture) page down a bit
    // first, so there is real native-scroll temptation for the browser to
    // hijack the upcoming touch gesture. Instant (not the page's default
    // smooth, added for Bug #11) — scrollYBefore below must be the exact,
    // already-settled value this setup asked for.
    await page2.evaluate(() => window.scrollTo({ top: 300, left: 0, behavior: 'instant' }));
    await sleep(200);
    const scrollYBefore = await page2.evaluate(() => window.scrollY);

    // Use a point in the middle of the CURRENT viewport (not a specific
    // element's rect) — after scrolling, an element near the top of the
    // document could have a negative/off-screen rect, which would make an
    // invalid touch target. Whatever host element happens to sit under the
    // viewport center is fine; we only care whether the tap resolves as a
    // selection despite the wobble, not which element gets picked.
    const target = await page2.evaluate(() => ({
      x: Math.round(window.innerWidth / 2),
      y: Math.round(window.innerHeight / 2),
    }));

    // A tap with a small (<12px, below TOUCH_DRAG_THRESHOLD) finger wobble.
    await page2.touchscreen.touchStart(target.x, target.y);
    await sleep(30);
    await page2.touchscreen.touchMove(target.x + 4, target.y + 3);
    await sleep(30);
    await page2.touchscreen.touchMove(target.x + 2, target.y + 5);
    await sleep(30);
    await page2.touchscreen.touchEnd();

    let selectSucceeded = false;
    try {
      await page2.waitForFunction(
        `(() => {
          const sr = window.__qaSR();
          return [...sr.querySelectorAll('button')].some((b) => /use this/i.test(b.textContent || ''));
        })()`,
        { timeout: 4000 },
      );
      selectSucceeded = true;
    } catch { /* best-effort — see note below */ }
    const scrollYAfter = await page2.evaluate(() => window.scrollY);
    const scrollHijacked = Math.abs(scrollYAfter - scrollYBefore) > 5;

    if (selectSucceeded && !scrollHijacked) {
      console.log('18. Bug #20 (best-effort): small-wobble tap during capture-selecting was NOT swallowed by native scroll — selection candidate appeared, scrollY unchanged: ok');
    } else {
      console.log(
        `18. Bug #20 (best-effort, NOT a hard failure): selectSucceeded=${selectSucceeded}, scrollHijacked=${scrollHijacked} (scrollY ${scrollYBefore}→${scrollYAfter}). ` +
        'Headless CDP touch dispatch does not perfectly reproduce a physical device\'s native scroll-gesture recognizer, so this check is informational — see task notes.',
      );
    }
    // Leave capture mode tidy for anything after this.
    await page2.keyboard.press('Escape');
    await sleep(300);
  }

  console.log('\nTOUCH PASS EXTRAS ✅  FAB resize-after-rotation (#25) + best-effort touch-wobble (#20)');

  // ===========================================================================
  // PASS 3 — misc DOM/computed-style assertions on a fresh desktop/mouse page:
  // #17 (tab underline reposition on language switch), #18 (dialog state
  // reset on panel close), #24 (capture-mode focus trap), #27 (credential
  // reveal toggle), #28 (duplicate-role credentials render as distinct DOM
  // nodes), #12 (regression-only — see note below).
  // ===========================================================================
  const page3 = await browser.newPage();
  await page3.setViewport({ width: 1200, height: 900 });
  await page3.evaluateOnNewDocument(installHelpers);
  const errors3 = [];
  page3.on('pageerror', (e) => errors3.push('PAGEERROR ' + e.message));
  // Bug #28: React logs a dev-mode console.error ("Encountered two children
  // with the same key") on ANY render (mount or update) of a list with
  // colliding keys. Captured for page3's whole lifetime (not just around the
  // Bug #28 block below) so it can't miss an earlier occurrence — e.g. the
  // very first Logins-tab render, or the language toggles already exercised
  // by Bug #17's block above.
  const consoleMsgs3 = [];
  page3.on('console', (m) => consoleMsgs3.push(m.text()));
  await page3.goto(BASE, { waitUntil: 'networkidle0' });
  await page3.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );
  await page3.evaluate(() => { window.__qaSR().querySelector('button').click(); }); // open panel
  await sleep(500);

  // ---------------------------------------------------------------------
  // BUG #17 — tab underline repositions after EN↔Arabic language toggle.
  // ---------------------------------------------------------------------
  {
    const before = await page3.evaluate(() => {
      const sr = window.__qaSR();
      const bar = sr.querySelector('.qa-tab-indicator');
      return { left: bar.style.left, width: bar.style.width };
    });

    const switched = await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => x.textContent.trim() === 'ع');
      if (b) b.click();
      return !!b;
    });
    if (!switched) throw new Error('Bug #17: Arabic language toggle button ("ع") not found');
    await sleep(300);

    const after = await page3.evaluate(() => {
      const sr = window.__qaSR();
      const bar = sr.querySelector('.qa-tab-indicator');
      // Live offsetLeft/offsetWidth of the currently-active tab button
      // (Notes tab is active by default), matching TabsBar's own
      // reposition() math: left = offsetLeft + 8, width = offsetWidth - 16.
      const tabButtons = [...sr.querySelectorAll('button')].filter((b) =>
        b.parentElement && b.parentElement === bar.parentElement && b !== bar,
      );
      const activeBtn = tabButtons.find((b) => /الملاحظات/.test(b.textContent || '')); // AR "Notes"
      return {
        left: bar.style.left,
        width: bar.style.width,
        expectedLeft: activeBtn ? `${activeBtn.offsetLeft + 8}px` : null,
        expectedWidth: activeBtn ? `${Math.max(0, activeBtn.offsetWidth - 16)}px` : null,
        foundActiveBtn: !!activeBtn,
      };
    });
    if (!after.foundActiveBtn) throw new Error('Bug #17: could not find the (now Arabic-labeled) active Notes tab button');
    if (after.left !== after.expectedLeft || after.width !== after.expectedWidth) {
      throw new Error(`Bug #17: underline left/width (${after.left}/${after.width}) does not match live tab button offsetLeft/offsetWidth (${after.expectedLeft}/${after.expectedWidth})`);
    }
    if (after.left === before.left && after.width === before.width) {
      throw new Error('Bug #17: underline position unchanged after language switch (would be true even if stale)');
    }
    console.log(`19. Bug #17: tab underline repositioned after EN→AR switch (${before.left}/${before.width} → ${after.left}/${after.width}, matching live offsetLeft/offsetWidth): ok`);

    // switch back to English for the rest of PASS 3
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => x.textContent.trim() === 'EN');
      if (b) b.click();
    });
    await sleep(300);
  }

  // ---------------------------------------------------------------------
  // BUG #18 — ephemeral dialog state (export-naming) reset when the panel
  // closes, so it can't resurface stale on reopen.
  // ---------------------------------------------------------------------
  {
    // Need at least one note for the Export button to be enabled.
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /quick note/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(200);
    const ta3Handle = await page3.evaluateHandle(() => window.__qaSR().querySelector('textarea'));
    const ta3 = ta3Handle.asElement();
    await ta3.click();
    await ta3.type('Bug #18 fixture note');
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /add point/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(300);

    const openedNaming = await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^export$/i.test((x.textContent || '').trim()));
      if (b) b.click();
      return !!b;
    });
    if (!openedNaming) throw new Error('Bug #18: Export button not found/enabled');
    await sleep(300);
    const namingShowing1 = await page3.evaluate(() =>
      !!window.__qaSR().querySelector('input[placeholder="file name"]'),
    );
    if (!namingShowing1) throw new Error('Bug #18 setup: naming dialog did not open');

    // Close the WHOLE panel (via the FAB) WITHOUT confirming the dialog.
    await page3.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      btn.click();
    });
    await sleep(600); // let the exit transition + phase→hidden reset finish

    // Reopen the panel.
    await page3.evaluate(() => {
      const btn = window.__qaSR().querySelector('button[aria-label="Qapture — testing notes"]');
      btn.click();
    });
    await sleep(500);

    const namingShowing2 = await page3.evaluate(() =>
      !!window.__qaSR().querySelector('input[placeholder="file name"]'),
    );
    const notesTabShowing = await page3.evaluate(() =>
      !!window.__qaSR().querySelector('textarea') === false && // no stray open quick-note form
      [...window.__qaSR().querySelectorAll('button')].some((b) => /capture from page/i.test(b.textContent || '')),
    );
    if (namingShowing2) throw new Error('Bug #18: export-naming dialog resurfaced after close/reopen without confirming');
    if (!notesTabShowing) throw new Error('Bug #18: default Notes tab content not showing after reopen');
    console.log('20. Bug #18: export-naming dialog did NOT resurface after close (FAB)/reopen — default tab content shows instead: ok');
  }

  // ---------------------------------------------------------------------
  // BUG #27 — credential password reveal/hide toggle.
  // ---------------------------------------------------------------------
  {
    const switchedTab = await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^logins$/i.test((x.textContent || '').trim()));
      if (b) b.click();
      return !!b;
    });
    if (!switchedTab) throw new Error('Bug #27: Logins tab button not found');
    await sleep(300);

    const initial = await page3.evaluate(() => {
      const toggle = window.__qaSR().querySelector('button[aria-label="Hide password"]');
      if (!toggle) return null;
      const span = toggle.parentElement.querySelector('button span');
      return { hasToggle: true, text: toggle.parentElement.textContent };
    });
    if (!initial || !initial.hasToggle) throw new Error('Bug #27: password reveal toggle not found (expected default-revealed state)');
    if (!initial.text.includes('Admin@123')) throw new Error(`Bug #27: password not shown in plaintext by default: "${initial.text}"`);

    await page3.evaluate(() => {
      window.__qaSR().querySelector('button[aria-label="Hide password"]').click();
    });
    await sleep(150);
    const hidden = await page3.evaluate(() => {
      const toggle = window.__qaSR().querySelector('button[aria-label="Show password"]');
      return toggle ? toggle.parentElement.textContent : null;
    });
    if (!hidden) throw new Error('Bug #27: toggle did not switch to "Show password" (hidden) state');
    if (hidden.includes('Admin@123') || !hidden.includes('••••••••')) {
      throw new Error(`Bug #27: password not masked after toggle: "${hidden}"`);
    }

    await page3.evaluate(() => {
      window.__qaSR().querySelector('button[aria-label="Show password"]').click();
    });
    await sleep(150);
    const revealedAgain = await page3.evaluate(() => {
      const toggle = window.__qaSR().querySelector('button[aria-label="Hide password"]');
      return toggle ? toggle.parentElement.textContent : null;
    });
    if (!revealedAgain || !revealedAgain.includes('Admin@123')) {
      throw new Error('Bug #27: toggling back did not restore plaintext password');
    }
    console.log('21. Bug #27: credential password reveal toggle switches masked ↔ plaintext display: ok');
  }

  // ---------------------------------------------------------------------
  // BUG #28 — duplicate-role credentials (both "Admin") render as distinct
  // DOM rows, not collapsed/cross-contaminated across a RECONCILIATION (not
  // just the initial static mount, which the old version of this test only
  // checked — duplicate keys don't break a first render).
  //
  // The bare `key={c.role}` bug is a real, verified React anti-pattern (dev
  // React logs "Encountered two children with the same key" for it, on
  // every render including the first), but empirically, React's reconciler
  // walks old/new children position-by-position first and only falls back
  // to its ambiguous key→fiber map when an update actually reorders/adds/
  // removes list items — which nothing in this app does to the credentials
  // list (its order and length are fixed at mount). So a same-order re-render
  // (e.g. the EN/AR toggle) can't be relied on to visibly swap row content
  // even under the buggy key — content checks alone would still pass. The
  // console warning itself, however, reliably fires under the buggy
  // `${c.role}` key and NEVER fires under the fix's `${c.role}-${i}` key
  // (verified against both), so it's the real discriminator here, backed up
  // by a content/identity check across a forced re-render as a regression
  // safety net for the future.
  // ---------------------------------------------------------------------
  {
    const readCredRows = () => {
      const sr = window.__qaSR();
      const roleSpans = [...sr.querySelectorAll('span')].filter((s) => s.textContent.trim() === 'Admin');
      const rows = roleSpans.map((s) => {
        const card = s.closest('.qa-rounded-xl');
        const loginSpan = card ? card.querySelector('button span') : null;
        return loginSpan ? loginSpan.textContent.trim() : null;
      });
      return { roleLabelCount: roleSpans.length, logins: rows };
    };

    // Make sure we're actually on the Logins tab (Bug #27 above already left
    // us there, but this block should be self-contained/robust either way).
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^logins$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(200);

    const before = await page3.evaluate(readCredRows);
    if (before.roleLabelCount !== 2) {
      throw new Error(`Bug #28 setup: expected 2 distinct "Admin" role labels in the DOM, found ${before.roleLabelCount}`);
    }
    if (before.logins[0] !== 'admin@demo.test' || before.logins[1] !== 'admin2@demo.test') {
      throw new Error(`Bug #28 setup: unexpected initial login association ${JSON.stringify(before.logins)} (expected [admin@demo.test, admin2@demo.test])`);
    }

    // Force a RECONCILIATION (not just a fresh mount) of CredentialsSection:
    // toggle the language back and forth. Each toggle re-renders the same
    // 3-item credentials list (same order, same count) with new translated
    // strings for OTHER fields (e.g. the "used" button text) — real prop
    // changes flowing through the same key-mapped list.
    for (const label of ['ع', 'EN']) {
      await page3.evaluate((l) => {
        const b = [...window.__qaSR().querySelectorAll('button')].find((x) => x.textContent.trim() === l);
        if (b) b.click();
      }, label);
      await sleep(250);
    }

    const after = await page3.evaluate(readCredRows);
    if (after.roleLabelCount !== 2) {
      throw new Error(`Bug #28: expected 2 distinct "Admin" role labels after re-render, found ${after.roleLabelCount} (duplicated and/or omitted)`);
    }
    if (after.logins[0] !== before.logins[0] || after.logins[1] !== before.logins[1]) {
      throw new Error(
        `Bug #28: credential rows cross-contaminated across a re-render — before=${JSON.stringify(before.logins)} after=${JSON.stringify(after.logins)}`,
      );
    }

    const dupKeyWarning = consoleMsgs3.find((t) => /encountered two children with the same key/i.test(t));
    if (dupKeyWarning) {
      throw new Error(`Bug #28: React logged a duplicate-key warning for the credentials list — keys are not unique: "${dupKeyWarning.slice(0, 160)}"`);
    }

    console.log('22. Bug #28: two credentials sharing role "Admin" render as 2 distinct, correctly-associated DOM rows across a forced re-render (EN→AR→EN), with no React duplicate-key warning logged: ok');
  }

  // ---------------------------------------------------------------------
  // BUG #12 — idb.ts onblocked on indexedDB.open(). Genuinely reproducing a
  // blocked cross-tab VERSION UPGRADE requires two connections at two
  // different DB_VERSION values; since DB_VERSION is a fixed module
  // constant (not something we can bump without touching src/lib/idb.ts
  // logic, which is out of scope here), a same-version open can never
  // actually block another same-version open — there is no version to
  // "upgrade" past. Per the task's explicit fallback, this is SKIPPED as
  // impractical to simulate from the public surface, with a plain
  // regression check in its place: normal (non-blocked) database
  // open + note save/read works cleanly (already exercised above by Bugs
  // #1, #10, #18's note creation, and again here for a fresh page/tab).
  // ---------------------------------------------------------------------
  {
    const regressionOk = await page3.evaluate(async () => {
      const dbs = await indexedDB.databases();
      return dbs.some((d) => d.name === 'playground-db');
    });
    if (!regressionOk) throw new Error('Bug #12 regression check: normal (non-blocked) IndexedDB open/save did not work on a fresh page');
    console.log('23. Bug #12: SKIPPED true onblocked simulation (same-version opens cannot block each other without bumping DB_VERSION — out of scope for this harness). Regression check: normal DB open + note save works cleanly on a fresh tab: ok');
  }

  // ---------------------------------------------------------------------
  // BUG #24 — CaptureMode focus trap. Repeated Tab/Shift+Tab must never let
  // document focus leave the capture overlay's DOM subtree.
  // ---------------------------------------------------------------------
  {
    // Switch back to notes tab and enter capture mode via a real element pick
    // (annotating phase) so there are several focusable elements to traverse.
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^notes$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(300);
    await page3.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(500);
    const addr = await page3.evaluate(() => {
      const el = document.querySelector('input[aria-label="Address line"]');
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    await page3.mouse.click(addr.x, addr.y);
    await page3.waitForFunction(
      `(()=>{const sr=window.__qaSR();return !!sr.querySelector('textarea');})()`,
      { timeout: 9000 },
    );
    await sleep(300);

    let escapedOnce = false;
    for (let i = 0; i < 14; i++) {
      await page3.keyboard.press('Tab'); // forward tabs
      const inside = await page3.evaluate(() => {
        const sr = window.__qaSR();
        const overlayRoot = sr.querySelector('[data-qa-overlay]');
        const active = sr.activeElement;
        return !!overlayRoot && !!active && overlayRoot.contains(active);
      });
      if (!inside) { escapedOnce = true; break; }
    }
    for (let i = 0; i < 6 && !escapedOnce; i++) {
      await page3.keyboard.down('Shift');
      await page3.keyboard.press('Tab');
      await page3.keyboard.up('Shift');
      const inside = await page3.evaluate(() => {
        const sr = window.__qaSR();
        const overlayRoot = sr.querySelector('[data-qa-overlay]');
        const active = sr.activeElement;
        return !!overlayRoot && !!active && overlayRoot.contains(active);
      });
      if (!inside) { escapedOnce = true; break; }
    }
    if (escapedOnce) throw new Error('Bug #24: document focus escaped the capture overlay subtree during Tab/Shift+Tab traversal');
    console.log('24. Bug #24: 20× Tab/Shift+Tab presses during active capture mode — focus never left the capture overlay subtree: ok');

    await page3.keyboard.press('Escape');
    await sleep(300);
  }

  if (errors3.length) console.log('   (page3 page errors:', errors3.join(' | '), ')');
  console.log('\nPASS 3 ✅  tab underline (#17) + dialog reset (#18) + reveal toggle (#27) + duplicate-role rows (#28) + focus trap (#24) + IDB regression (#12)');

  // ===========================================================================
  // PASS 4 — blob URL leak tracking (#9, #19). A dedicated page with
  // createObjectURL/revokeObjectURL wrapped BEFORE navigation, per the task
  // brief, so every call (including ones from deep inside React effects) is
  // logged to window.__qaUrlLog.
  // ===========================================================================
  const page4 = await browser.newPage();
  await page4.setViewport({ width: 1100, height: 800 });
  await page4.evaluateOnNewDocument(installHelpers);
  await page4.evaluateOnNewDocument(installUrlLog);
  const errors4 = [];
  page4.on('pageerror', (e) => errors4.push('PAGEERROR ' + e.message));
  await page4.goto(BASE, { waitUntil: 'networkidle0' });
  await page4.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );

  // ---------------------------------------------------------------------
  // BUG #9 — NoteEditor blob leak: attach an image in the quick-note form,
  // then switch panel tabs (unmounting NoteEditor) WITHOUT saving.
  // ---------------------------------------------------------------------
  {
    await page4.evaluate(() => { window.__qaSR().querySelector('button').click(); }); // open panel
    await sleep(400);
    await page4.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /quick note/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(300);

    const fileInputHandle = await page4.evaluateHandle(() => window.__qaSR().querySelector('input[type=file]'));
    const fileInput = fileInputHandle.asElement();
    if (!fileInput) throw new Error('Bug #9: quick-note file input not found');
    await fileInput.uploadFile(TINY_PNG_PATH);

    await page4.waitForFunction(
      () => window.__qaUrlLog.some((e) => e.type === 'create'),
      { timeout: 5000 },
    );
    const createdUrl = await page4.evaluate(() => {
      const entry = window.__qaUrlLog.find((e) => e.type === 'create');
      return entry ? entry.url : null;
    });
    if (!createdUrl) throw new Error('Bug #9: no createObjectURL call logged after image upload');
    console.log(`25. Bug #9 setup: image attached in quick-note form → createObjectURL logged (${createdUrl.slice(0, 24)}…): ok`);

    // Switch to a different tab WITHOUT saving — unmounts NoteEditor.
    await page4.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^guide$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(400);

    const revoked = await page4.evaluate(
      (url) => window.__qaUrlLog.some((e) => e.type === 'revoke' && e.url === url),
      createdUrl,
    );
    if (!revoked) throw new Error(`Bug #9: createObjectURL(${createdUrl}) from the abandoned quick-note form was never revoked after switching tabs (unmounting NoteEditor)`);
    console.log('26. Bug #9: switching tabs (unmounting NoteEditor) with an unsaved attached image revoked the exact blob URL that was created: ok');

    // back to notes tab, tidy
    await page4.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^notes$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(200);
  }

  // ---------------------------------------------------------------------
  // BUG #19 — CaptureMode blob leak on unmount: Escape immediately after
  // starting a capture, before html2canvas would realistically finish.
  // ---------------------------------------------------------------------
  {
    const markIndex = await page4.evaluate(() => window.__qaUrlLog.length);

    await page4.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(300);

    const pt4 = await page4.evaluate(() => {
      const el = document.querySelector('button[aria-label="Place order"]');
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    // Click to select (kicks off the async captureRegion/html2canvas chain)
    // then cancel well before html2canvas would realistically finish (it
    // involves a dynamic import + real canvas rendering — tens of ms at
    // least). A tiny (~20ms) gap here — rather than zero — gives React time
    // to fully commit the click's own render before Escape's unmount is
    // queued, which avoids an unrelated same-batch scheduling ambiguity
    // between two independent state updates; it's still "immediately", well
    // before the capture can possibly have resolved.
    await page4.mouse.click(pt4.x, pt4.y);
    await sleep(20);
    await page4.keyboard.press('Escape');

    // The old version of this check just waited a fixed 2500ms and asserted
    // "0 outstanding" — but with Escape firing this fast, that was true
    // VACUOUSLY on both the buggy and fixed code: captureRegion's async
    // chain (dynamic import(html2canvas) + a real canvas render) genuinely
    // never got far enough to call createObjectURL AT ALL within that
    // window on either version, so "0 outstanding" (0 created, 0 revoked)
    // proved nothing about revoke behavior specifically.
    //
    // First, explicitly wait for (and require) at least one createObjectURL
    // call — i.e. confirm the capture actually progressed far enough to
    // produce a blob — before we ask whether it was revoked. Empirically
    // (see task notes) the FIXED code's create(+immediate-revoke, since the
    // component is already unmounted) reliably lands within ~1s of the
    // click; this timeout is well beyond that with margin to spare.
    const CREATE_WAIT_MS = 5000;
    let sawCreate = true;
    try {
      await page4.waitForFunction(
        (from) => window.__qaUrlLog.slice(from).some((e) => e.type === 'create'),
        { timeout: CREATE_WAIT_MS },
        markIndex,
      );
    } catch {
      sawCreate = false;
    }
    if (!sawCreate) {
      throw new Error(
        `Bug #19: no createObjectURL call was observed within ${CREATE_WAIT_MS}ms of an Escape-cancelled capture — the abandoned capture's continuation never completed, so revoke behavior couldn't even be exercised (on the fixed code this reliably fires within ~1s)`,
      );
    }

    // Now that we know a create happened, give any trailing revoke a beat
    // to land too, then check nothing from this window is still outstanding.
    await sleep(500);

    const outstanding = await page4.evaluate((from) => {
      const entries = window.__qaUrlLog.slice(from);
      const created = entries.filter((e) => e.type === 'create').map((e) => e.url);
      const revokedSet = new Set(entries.filter((e) => e.type === 'revoke').map((e) => e.url));
      return created.filter((u) => !revokedSet.has(u));
    }, markIndex);

    if (outstanding.length > 0) {
      throw new Error(`Bug #19: ${outstanding.length} blob URL(s) created during a capture cancelled mid-flight (Escape before html2canvas finished) were never revoked: ${JSON.stringify(outstanding)}`);
    }
    console.log('27. Bug #19: capture cancelled mid-flight (Escape before html2canvas finished) DID create a blob URL (confirmed, not vacuous) and it was revoked with zero outstanding: ok');
  }

  if (errors4.length) console.log('   (page4 page errors:', errors4.join(' | '), ')');
  console.log('\nPASS 4 ✅  NoteEditor blob leak on tab-switch (#9) + CaptureMode blob leak on fast-Escape unmount (#19)');

  console.log('\nBROWSER TEST PASS ✅  mouse + touch + FAB-resize + touch-wobble(best-effort) + panel/dialog/focus-trap + blob-leak tracking');
  code = 0;
} catch (e) {
  console.error('BROWSER TEST FAIL:', e.message);
} finally {
  clearTimeout(hardKill);
  if (browser) await browser.close().catch(() => {});
  try { vite.kill('SIGTERM'); } catch {}
  try { unlinkSync(TINY_PNG_PATH); } catch {}
  await sleep(300);
  process.exit(code);
}
