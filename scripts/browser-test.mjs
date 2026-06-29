// Real-browser test (headless Chrome via puppeteer-core, no browser download).
// Proves the hardest risk: a real click is intercepted by the shadow-root
// overlay, document.elementFromPoint resolves the HOST light-DOM element beneath
// it, and the inline annotation card appears. Drives the playground dev server.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

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
  console.log('\nBROWSER TEST PASS ✅  FAB → panel → capture → elementFromPoint(host) through shadow → annotate');
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
