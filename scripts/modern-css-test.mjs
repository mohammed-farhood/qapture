// Modern CSS colour test (real Chrome, v0.7.1).
//
// html2canvas@1.4.1 throws on every CSS Color 4 function — oklch(), lab(),
// color-mix() — and the throw kills the whole render, so the tester gets no
// screenshot at all. Tailwind v4 emits oklch() for its entire default palette
// and shadcn/ui inherits that, so this is not an edge case: it is "screenshots
// never work" for a large slice of modern apps.
//
// The test is deliberately self-validating. It first proves the fixture still
// breaks a raw html2canvas render (assertion 1) — otherwise assertion 2 could
// pass for years without testing anything — and then proves Qapture captures
// the same page anyway.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAY = join(ROOT, 'playground');
const LIB = readFileSync(join(ROOT, 'node_modules/html2canvas/dist/html2canvas.js'), 'utf8');
const PORT = 5195;
const BASE = `http://localhost:${PORT}/`;

let failures = 0;
function ok(cond, label) {
  if (cond) console.log(`  ok   - ${label}`);
  else { console.error(`  FAIL - ${label}`); failures++; }
}

/** A Tailwind-v4-shaped theme: every colour in a space html2canvas can't read. */
const MODERN_THEME = `
  #modern-fixture {
    position: fixed; left: 40px; top: 300px; width: 420px; height: 220px;
    background-color: oklch(0.93 0.03 250);
    color: oklch(0.25 0.05 260);
    border: 4px solid lab(50% 40 59.5);
    box-shadow: 0 8px 24px color-mix(in srgb, oklch(0.5 0.2 20) 40%, transparent);
    background-image: linear-gradient(oklch(0.95 0.02 250), color-mix(in oklch, oklch(0.8 0.1 200), white));
    font: 600 20px system-ui; padding: 16px; z-index: 5;
  }
`;

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
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1400);

  // Paint the fixture onto the playground.
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const box = document.createElement('div');
    box.id = 'modern-fixture';
    box.textContent = 'oklch / lab / color-mix';
    document.body.appendChild(box);
  }, MODERN_THEME);
  await sleep(400);

  // The browser must actually be computing these in a modern colour space,
  // or the whole fixture is inert.
  const computed = await page.evaluate(() => {
    const el = document.getElementById('modern-fixture');
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopColor };
  });
  ok(/oklch|oklab|lab|lch|color\(/i.test(computed.bg + computed.border),
    `0. fixture really is modern CSS (background: ${computed.bg})`);

  // ── 1. Control: raw html2canvas still dies on this page ─────────────────
  await page.addScriptTag({ content: LIB });
  const raw = await page.evaluate(async () => {
    try {
      await window.html2canvas(document.body, { logging: false });
      return 'RENDERED';
    } catch (e) {
      return 'THREW: ' + (e && e.message ? e.message : String(e));
    }
  });
  ok(/unsupported color function/i.test(raw),
    `1. raw html2canvas still fails here, so this test can detect a regression (${raw.slice(0, 60)})`);

  // ── 2. Qapture captures the same page anyway ────────────────────────────
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) return;
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click(); else sr.querySelector('button').click();
  });
  await sleep(500);
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) return;
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click();
  });
  await sleep(500);

  const inCapture = await page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]'));
  ok(inCapture, '2. capture mode opens');

  // Drag a region over the fixture.
  await page.mouse.move(60, 320);
  await page.mouse.down();
  await page.mouse.move(80, 340, { steps: 3 });
  await page.mouse.move(440, 500, { steps: 8 });
  await page.mouse.up();
  await sleep(3000);

  const shot = await page.evaluate(() => {
    const sr = window.__qaSR();
    const img = sr.querySelector('img[src^="blob:"], img[src^="data:"]');
    // Must match the real copy — strings.ts capture_failed, both languages.
    const failed = [...sr.querySelectorAll('*')].some((el) =>
      /screenshot failed|فشل التقاط/i.test(el.textContent || '') && el.children.length === 0);
    return { hasImg: !!img, failed };
  });
  ok(!shot.failed, '2. no "capture failed" message on an oklch page');
  ok(shot.hasImg, '2. a screenshot preview is actually present');

  // ── 3. The screenshot has real content, not a blank rectangle ───────────
  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (ta) {
    await ta.click();
    await ta.type('modern css fixture');
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(1200);
  }

  const pixels = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve({ error: 'idb open failed' });
    req.onsuccess = () => {
      const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
      all.onerror = () => resolve({ error: 'idb read failed' });
      all.onsuccess = async () => {
        const note = all.result.find((n) => n.description === 'modern css fixture');
        if (!note) return resolve({ error: 'note not found' });
        if (!note.screenshot) return resolve({ error: 'note has no screenshot' });
        const bitmap = await createImageBitmap(note.screenshot);
        const c = document.createElement('canvas');
        c.width = bitmap.width; c.height = bitmap.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        let opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 200) opaque++;
          seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
        }
        resolve({ w: c.width, h: c.height, opaque, total: d.length / 4, colors: seen.size });
      };
    };
  }));

  ok(!pixels.error, `3. the saved note has a screenshot (${pixels.error ?? 'read ok'})`);
  if (!pixels.error) {
    ok(pixels.opaque / pixels.total > 0.9,
      `3. it is not transparent (${Math.round((pixels.opaque / pixels.total) * 100)}% opaque)`);
    ok(pixels.colors > 3,
      `3. it has real content rather than one flat fill (${pixels.colors} distinct colours)`);
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nMODERN CSS: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nMODERN CSS PASS ✅  oklch / lab / color-mix pages capture correctly');
