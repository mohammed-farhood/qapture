// SVG-variable capture test (real Chrome) — proves inline SVG keeps its FILLS
// in a screenshot when those fills come from CSS custom properties.
//
// WHY THIS EXISTS
// ---------------
// html2canvas cannot rasterise inline SVG in place. It SERIALISES the <svg>
// subtree to a standalone SVG string and loads that as an <img>. The moment it
// does, the element leaves the document — and every `var(--x)` inside it loses
// the `:root` rule that defined it, because that rule lives in a stylesheet
// the serialised image never sees.
//
// An SVG `fill="var(--enamel)"` with nothing to resolve against paints as
// NOTHING. So a chart drawn as filled polygons comes back as bare outlines:
// the strokes that used literal colours survive, every filled surface is gone.
// The screenshot is not blank, not obviously broken, just hollow — which is
// why it reads as "the screenshot is fake, it's simulated".
//
// This is not exotic. Theming SVG with custom properties is the normal way to
// make an icon or a diagram follow a design system, so any Tailwind/shadcn app
// with a real inline-SVG diagram loses it in every screenshot.
//
// The fixture below is the shape of the reported case: a dental odontogram
// whose teeth are <polygon>/<path> filled with var(--*) and stroked with a
// literal colour. A capture that only keeps the stroke reproduces the bug.
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
const PORT = 5193;
const BASE = `http://localhost:${PORT}/`;

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
  ignoreDefaultArgs: ['--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1200);

  // ── 0. Fixture: filled-with-var SVG, exactly the failing shape ─────────
  const setup = await page.evaluate(() => {
    document.body.style.margin = '0';
    const style = document.createElement('style');
    // The custom properties live on :root, like every design system's tokens.
    // oklch() as well, so this also proves the two fixes compose.
    style.textContent = `
      :root {
        --enamel: #00b300;
        --tooth-ring: #ff0000;
        --ink: #0000ff;
      }
      #svg-fixture { position:absolute; top:200px; left:60px; z-index:900; background:#ffffff; }
    `;
    document.head.appendChild(style);

    const host = document.createElement('div');
    host.id = 'svg-fixture';
    // Two halves, because they fail independently:
    //   TOP    plain `var()` in a fill — the simple theming case.
    //   BOTTOM `color-mix()` wrapping a `var()` — how a real chart shades a
    //          surface, and exactly what the reported odontogram does
    //          (`color-mix(in srgb, black N%, var(--c-enamel))` per facet).
    // Plus a stroke, so "did anything render at all" can't pass by accident.
    host.innerHTML = `
      <svg width="400" height="300" viewBox="0 0 400 300">
        <rect x="0" y="0" width="400" height="150" fill="var(--enamel)"></rect>
        <polygon points="0,150 400,150 400,300 0,300"
                 fill="color-mix(in srgb, white 50%, var(--ink))"></polygon>
        <path d="M10 10 H390 V290 H10 Z" fill="none" stroke="var(--tooth-ring)" stroke-width="6"></path>
      </svg>`;
    document.body.appendChild(host);

    const rect = document.getElementById('svg-fixture').getBoundingClientRect();
    const filled = document.querySelector('#svg-fixture rect');
    return { rect: rect.toJSON(), computedFill: getComputedStyle(filled).fill };
  });
  console.log(`  info   fixture SVG at ${Math.round(setup.rect.width)}x${Math.round(setup.rect.height)}, ` +
    `live computed fill = ${setup.computedFill}`);
  ok(/rgb|oklch|#/.test(setup.computedFill), '0. fixture really resolves its var() fill in the live page');

  // ── 1. Capture a region over the SVG ───────────────────────────────────
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if (!sr || sr.querySelector('[data-qa-capture-root]')) return;
      const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
      if (cta) cta.click(); else sr.querySelector('button')?.click();
    });
    await sleep(500);
  }
  ok(await page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]')),
    '1. capture mode opens');

  await page.mouse.move(70, 210);
  await page.mouse.down();
  await page.mouse.move(90, 230, { steps: 3 });
  await page.mouse.move(450, 490, { steps: 8 });
  await page.mouse.up();
  await sleep(3000);

  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (!ta) throw new Error('annotation card never appeared');
  await ta.click();
  await ta.type('svg vars fixture');
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1200);

  // ── 2. The fills have to be in the image ───────────────────────────────
  const m = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve({ error: 'idb open failed' });
    req.onsuccess = () => {
      const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
      all.onerror = () => resolve({ error: 'idb read failed' });
      all.onsuccess = async () => {
        const note = all.result.find((n) => n.description === 'svg vars fixture');
        if (!note?.screenshot) return resolve({ error: 'note or screenshot missing' });
        const bmp = await createImageBitmap(note.screenshot);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let green = 0, mixed = 0, red = 0, total = 0;
        for (let i = 0; i < d.length; i += 4) {
          total++;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (r < 90 && g > 120 && b < 90) green++;
          // color-mix(in srgb, white 50%, #0000ff) ≈ rgb(128,128,255)
          else if (b > 200 && r > 60 && r < 190 && g > 60 && g < 190) mixed++;
          else if (r > 120 && g < 90 && b < 90) red++;
        }
        resolve({ w: c.width, h: c.height, green: green / total, mixed: mixed / total, red: red / total });
      };
    };
  }));

  if (m.error) {
    ok(false, `2. could not measure (${m.error})`);
  } else {
    console.log(`  info   capture ${m.w}x${m.h}: plain var() fill ${(m.green * 100).toFixed(1)}%, ` +
      `color-mix(var()) fill ${(m.mixed * 100).toFixed(1)}%, var() stroke ${(m.red * 100).toFixed(1)}%`);
    ok(
      m.green > 0.25,
      m.green > 0.25
        ? '2. a plain var() SVG fill survives the capture'
        : `2. PLAIN var() FILL LOST — only ${(m.green * 100).toFixed(1)}% of the image is the filled body`,
    );
    ok(
      m.mixed > 0.25,
      m.mixed > 0.25
        ? '2. a color-mix() wrapping a var() survives too — shaded charts keep their surfaces'
        : `2. color-mix(var()) FILL LOST — only ${(m.mixed * 100).toFixed(1)}% survived; a shaded chart captures as hollow outlines`,
    );
    ok(
      m.red > 0.01,
      m.red > 0.01
        ? '2. the var()-coloured stroke survived too'
        : '2. the var()-coloured stroke was lost as well',
    );
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nSVG VARS: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nSVG VARS PASS ✅  inline SVG keeps its custom-property fills in a screenshot');
