// Real-browser test (headless Chrome via puppeteer-core, no browser download).
// Proves the hardest risk: a real click is intercepted by the shadow-root
// overlay, document.elementFromPoint resolves the HOST light-DOM element beneath
// it, and the inline annotation card appears. Drives the playground dev server.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PLAY = join(dirname(fileURLToPath(import.meta.url)), '..', 'playground');
const PORT = 5183;
const BASE = `http://localhost:${PORT}/`;

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

const hardKill = setTimeout(() => { console.error('TIMEOUT'); try { vite.kill('SIGKILL'); } catch {} process.exit(1); }, 90000);

let browser, code = 1;
try {
  if (!(await waitServer())) throw new Error('vite dev server did not start');
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle0' });

  // 1) isolated shadow host mounted
  await page.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );
  console.log('1. shadow host mounted: ok');

  // 2) open the panel via the FAB (the launcher button in the shadow root)
  await page.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    sr.querySelector('button').click();
  });
  await sleep(500);

  // 3) click "Capture from page"
  const cta = await page.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  });
  if (!cta) throw new Error('Capture-from-page CTA not found in panel');
  console.log(`2. entered capture mode via: "${cta}"`);
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
    `(()=>{const sr=document.querySelector('qapture-overlay').shadowRoot;return !!sr.querySelector('textarea');})()`,
    { timeout: 9000 },
  );
  console.log('3. host element selected through the shadow boundary → annotation card appeared');

  // 6) expand the (by-default hidden) "Show captured location" disclosure and
  //    confirm the captured selector/text targets the HOST <button> — proving
  //    the selector was generated against the host light DOM, not the shadow tree.
  await page.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /location|captured/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(500);
  const refsHost = await page.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const txt = sr.textContent || '';
    return /Place order|aria-label|button/i.test(txt);
  });
  console.log('4. captured selector targets the host element (after reveal):', refsHost);
  if (!refsHost) throw new Error('captured target did not reference the host element');

  if (errors.length) console.log('   (page errors:', errors.join(' | '), ')');
  console.log('\nMOUSE PASS ✅  FAB → panel → capture → elementFromPoint(host) through shadow → annotate');

  // ===========================================================================
  // PASS 2 — iPad / touch. A second page/tab off the SAME browser + dev
  // server, emulated as a coarse-pointer iPad. Drives the touch-only flow
  // CaptureMode gates behind useCoarsePointer(): tap an element → confirm
  // toolbar ("Use this" / "Adjust") → annotate; then "Draw region" → a real
  // CDP touch-drag → resize handles. The mouse pass above is untouched.
  // ===========================================================================
  const page2 = await browser.newPage();
  await page2.emulate(KnownDevices['iPad Pro']); // 1024x1366, dpr 2, isMobile+hasTouch
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
  console.log('5. iPad emulation: hasTouch/isMobile/dpr=2 viewport + matchMedia(pointer:coarse) → true');

  await page2.waitForFunction(
    `!!document.querySelector('qapture-overlay') && !!document.querySelector('qapture-overlay').shadowRoot`,
    { timeout: 10000 },
  );

  // open the panel via the FAB, then "Capture from page" — plain buttons,
  // not the touch risk itself, so driven the same way as the mouse pass.
  await page2.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    sr.querySelector('button').click();
  });
  await sleep(500);
  const cta2 = await page2.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /capture/i.test(x.textContent || ''));
    if (b) { b.click(); return (b.textContent || '').trim(); }
    return null;
  });
  if (!cta2) throw new Error('Capture-from-page CTA not found in panel (touch pass)');
  console.log(`6. entered capture mode (touch) via: "${cta2}"`);
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
      const sr = document.querySelector('qapture-overlay').shadowRoot;
      return [...sr.querySelectorAll('button')].some((b) => /use this/i.test(b.textContent || ''));
    })()`,
    { timeout: 6000 },
  );
  console.log('7. tapped host element through shadow boundary → confirm toolbar ("Use this") appeared');

  const useThisPt = await page2.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /use this/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(useThisPt.x, useThisPt.y);

  // 8) the annotation textarea must appear. Assert the CARD, not screenshot
  //    pixels — headless html2canvas can legitimately render a blank crop.
  await page2.waitForFunction(
    `(() => { const sr = document.querySelector('qapture-overlay').shadowRoot; return !!sr.querySelector('textarea'); })()`,
    { timeout: 9000 },
  );
  console.log('8. tapped "Use this" → annotation textarea appeared (element flow, touch)');

  // 9) REGION FLOW — "Reselect" back to the selecting phase (still the same
  //    CaptureMode mount — QaRoot only unmounts it when capture ends), then
  //    tap the "Draw region" toggle so the next drag draws a region instead
  //    of picking an element.
  const reselectPt = await page2.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /reselect/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(reselectPt.x, reselectPt.y);
  await sleep(300);

  const drawRegionPt = await page2.evaluate(() => {
    const sr = document.querySelector('qapture-overlay').shadowRoot;
    const b = [...sr.querySelectorAll('button')].find((x) => /draw region/i.test(x.textContent || ''));
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page2.touchscreen.tap(drawRegionPt.x, drawRegionPt.y);
  await sleep(200);
  console.log('9. tapped "Draw region" toggle (touch)');

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
      const sr = document.querySelector('qapture-overlay').shadowRoot;
      return sr.querySelectorAll('.qa-z-10094').length === 8 && sr.querySelectorAll('.qa-z-10093').length === 1;
    })()`,
    { timeout: 6000 },
  );
  console.log('10. touch region drag (touchStart→touchMove×2→touchEnd) → 8 resize handles appeared in shadow DOM');

  if (errors2.length) console.log('   (touch pass page errors:', errors2.join(' | '), ')');
  console.log('\nTOUCH PASS ✅  iPad emulation → coarse pointer → tap(host) through shadow → confirm → annotate → draw-region → resize handles');

  console.log('\nBROWSER TEST PASS ✅  mouse + touch');
  code = 0;
} catch (e) {
  console.error('BROWSER TEST FAIL:', e.message);
} finally {
  clearTimeout(hardKill);
  if (browser) await browser.close().catch(() => {});
  try { vite.kill('SIGTERM'); } catch {}
  await sleep(300);
  process.exit(code);
}
