/**
 * freeze-capture-test.mjs — the exact engine photographs ONCE and lets go.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two complaints drove the v0.8 rewrite, and neither had a test:
 *
 *  1. "Safari keeps screen recording and drains the battery." The old design
 *     held the getDisplayMedia stream for the whole QA session, so the OS
 *     sharing indicator stayed lit and the capture pipeline kept running
 *     between captures.
 *
 *  2. "Sometimes the screenshot is right and sometimes it isn't." The exact
 *     engine grabbed its frame at the END of framing, from that long-lived
 *     stream. When the stream had quietly died the capture fell through to the
 *     html2canvas redraw with nothing said, so the same click produced a
 *     photograph one time and a reconstruction the next.
 *
 * Both are now structural: freezeViewport() takes one frame when capture mode
 * OPENS and stops the track before it returns. This test asserts the structure
 * rather than the symptom, because the symptom is intermittent by nature and a
 * flaky test would have been worse than none:
 *
 *   A. every track getDisplayMedia ever handed out is 'ended' by the time the
 *      tester is framing — nothing is still recording;
 *   B. exactly one grant is taken per capture, not one per session;
 *   C. the still is on screen while framing, so what you drag over is what
 *      gets cropped;
 *   D. mutating the page AFTER the freeze does not change the captured pixels.
 *      This is the one that proves the crop came from the photograph rather
 *      than from the live page — and it is the direct test of "freeze first".
 *
 * Chrome is launched with --auto-accept-this-tab-capture so the share prompt
 * resolves itself; that flag grants the current tab, which is the Chromium
 * 'tab' strategy. The Safari/Firefox 'surface' strategy has no headless
 * equivalent, and its arithmetic is covered by frame-calibration-smoke.mjs.
 *
 * Run: npm run freeze-capture-test
 */
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
const PORT = 5189;
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
  args: [
    '--no-sandbox',
    // Answer the share prompt with "this tab" instead of showing it.
    '--auto-accept-this-tab-capture',
    '--use-fake-ui-for-media-stream',
  ],
  ignoreDefaultArgs: ['--hide-scrollbars'],
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const page = await browser.newPage();

  // Instrument getDisplayMedia before any app code runs: record every stream
  // handed out so we can ask, afterwards, whether any of them is still live.
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
    window.__grants = [];
    const md = navigator.mediaDevices;
    const real = md.getDisplayMedia.bind(md);
    md.getDisplayMedia = async (...args) => {
      const s = await real(...args);
      window.__grants.push(s);
      return s;
    };
    window.__liveTracks = () =>
      window.__grants
        .flatMap((s) => s.getTracks())
        .filter((t) => t.readyState === 'live').length;
  });

  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1200);

  // ── Fixture: a solid red block we can repaint later ──────────────────────
  await page.evaluate(() => {
    document.body.style.margin = '0';
    const block = document.createElement('div');
    block.id = 'subject';
    block.style.cssText =
      'position:fixed;left:200px;top:200px;width:300px;height:200px;background:#e00000;';
    document.body.appendChild(block);
  });

  // Arm real photographs the way the settings toggle does, then reload so the
  // preference is read back from storage exactly as a returning tester's is.
  // The playground mounts with namespace 'playground', and createStorage()
  // prefixes every key with it.
  await page.evaluate(() => {
    try { localStorage.setItem('playground:exactShots', '1'); } catch { /* ignore */ }
  });
  const storageKey = await page.evaluate(() =>
    Object.keys(localStorage).find((k) => k.endsWith(':exactShots')) || null,
  );
  console.log(`  info   preference key in storage: ${storageKey}`);
  ok(!!storageKey, 'the exact-shots preference persists under a findable key');

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1200);
  await page.evaluate(() => {
    document.body.style.margin = '0';
    const block = document.createElement('div');
    block.id = 'subject';
    block.style.cssText =
      'position:fixed;left:200px;top:200px;width:300px;height:200px;background:#e00000;';
    document.body.appendChild(block);
  });

  // ── Enter capture mode: this is where the photograph is taken ────────────
  await page.evaluate(() => {
    const sr = window.__qaSR();
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click();
    else sr.querySelector('button').click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const sr = window.__qaSR();
    if (sr.querySelector('[data-qa-capture-root]')) return;
    const cta = [...sr.querySelectorAll('button')].find((x) => /capture from page/i.test(x.textContent || ''));
    if (cta) cta.click();
  });
  await sleep(400);

  const inCapture = await page.evaluate(() => !!window.__qaSR().querySelector('[data-qa-capture-root]'));
  ok(inCapture, 'capture mode opened');

  // Wait for the photograph to land. Headless Chrome can take a couple of
  // seconds to present the first frame of a tab capture, and the whole point of
  // this test is what the state looks like once it HAS landed.
  const startedAt = Date.now();
  let froze = false;
  while (Date.now() - startedAt < 10000) {
    froze = await page.evaluate(() =>
      !!window.__qaSR().querySelector('[data-qa-capture-still] canvas'),
    );
    if (froze) break;
    await sleep(200);
  }
  console.log(`  info   still appeared after ${Date.now() - startedAt}ms`);

  const grants = await page.evaluate(() => window.__grants.length);
  console.log(`  info   getDisplayMedia grants so far: ${grants}`);
  ok(grants === 1, `exactly one grant was taken for this capture (got ${grants})`);

  // (A) THE BATTERY REGRESSION. Nothing may still be recording while the
  //     tester frames their selection.
  const live = await page.evaluate(() => window.__liveTracks());
  ok(live === 0, `the screen was handed back before framing began (${live} live tracks)`);

  // (C) The still is on screen, so the tester crops what they can see.
  const stillShown = await page.evaluate(() => {
    const host = window.__qaSR().querySelector('[data-qa-capture-still]');
    const canvas = host?.querySelector('canvas');
    return canvas ? { w: canvas.width, h: canvas.height } : null;
  });
  ok(!!stillShown, 'the frozen still is mounted under the capture scrim');
  if (stillShown) {
    console.log(`  info   still is ${stillShown.w}x${stillShown.h} device px`);
    ok(stillShown.w >= 1280, 'the still is at least viewport resolution');
  }

  // (D) FREEZE-FIRST. Repaint the subject green AFTER the photograph. A crop
  //     taken from the still must still be red; a crop taken from the live
  //     page would come back green.
  await page.evaluate(() => {
    document.getElementById('subject').style.background = '#00c000';
  });
  await sleep(200);

  await page.mouse.move(220, 220);
  await page.mouse.down();
  await page.mouse.move(240, 240, { steps: 3 });
  await page.mouse.move(480, 380, { steps: 8 });
  await page.mouse.up();
  await sleep(2600);

  const shot = await page.evaluate(() => new Promise((resolve) => {
    const img = window.__qaSR().querySelector('img[src^="blob:"]');
    if (!img) return resolve({ error: 'no preview image' });
    const c = document.createElement('canvas');
    const draw = () => {
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let red = 0, green = 0, other = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 120 && g < 90 && b < 90) red++;
        else if (g > 120 && r < 90 && b < 90) green++;
        else other++;
      }
      const total = red + green + other;
      resolve({ w: c.width, h: c.height, red: red / total, green: green / total, other: other / total });
    };
    if (img.complete && img.naturalWidth) draw();
    else img.onload = draw;
  }));

  if (shot.error) {
    ok(false, `could not read the preview (${shot.error})`);
  } else {
    console.log(
      `  info   preview ${shot.w}x${shot.h}: red ${(shot.red * 100).toFixed(1)}% / ` +
      `green ${(shot.green * 100).toFixed(1)}% / other ${(shot.other * 100).toFixed(1)}%`,
    );
    ok(
      shot.red > 0.9,
      shot.red > 0.9
        ? 'the crop came from the photograph, not the live page (still red after the page turned green)'
        : `the crop followed the LIVE page — freeze-first is not in effect (red ${(shot.red * 100).toFixed(1)}%)`,
    );
  }

  // (A again) Framing, cropping and previewing must not have re-opened
  // anything. This is the assertion that would have caught the old design.
  const liveAfter = await page.evaluate(() => window.__liveTracks());
  const grantsAfter = await page.evaluate(() => window.__grants.length);
  ok(liveAfter === 0, `still nothing recording after the shot (${liveAfter} live tracks)`);
  ok(grantsAfter === 1, `no extra grant was taken to produce the crop (${grantsAfter} total)`);

  // ── ONE PROMPT, SEVERAL NOTES ───────────────────────────────────────────
  // Safari's per-site Screen Sharing setting offers only Ask and Deny — there
  // is no Allow — so a capture prompt cannot be removed, only asked for less
  // often. "Save + next" files this note and returns to framing against the
  // SAME photograph, so three bugs on one screen cost one grant.
  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (!ta) {
    ok(false, 'annotation card never appeared');
  } else {
    await ta.click();
    await ta.type('first bug on this screen');
    const clicked = await page.evaluate(() => {
      const b = window.__qaSR().querySelector('[data-qa-save-next]');
      if (!b) return false;
      b.click();
      return true;
    });
    ok(clicked, 'the "Save + next" action is offered');
    await sleep(900);

    const kept = await page.evaluate(() => ({
      stillUp: !!window.__qaSR().querySelector('[data-qa-capture-still] canvas'),
      inCapture: !!window.__qaSR().querySelector('[data-qa-capture-root]'),
      reusedBadge: !!window.__qaSR().querySelector('[data-qa-shot-reused]'),
      grants: window.__grants.length,
      live: window.__liveTracks(),
    }));
    ok(kept.inCapture, 'saving with "next" stays in capture mode');
    ok(kept.stillUp, 'the same photograph is still up for the next note');
    ok(kept.reusedBadge, 'the hint bar says the screenshot is being reused');
    ok(kept.grants === 1, `a second note cost NO extra prompt (${kept.grants} grant total)`);
    ok(kept.live === 0, `and nothing started recording again (${kept.live} live tracks)`);

    // File the second note from the same still, to prove it really works and
    // not just that the UI survived.
    await page.mouse.move(520, 220);
    await page.mouse.down();
    await page.mouse.move(540, 240, { steps: 3 });
    await page.mouse.move(700, 360, { steps: 8 });
    await page.mouse.up();
    await sleep(2600);
    const ta2 = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
    if (!ta2) ok(false, 'could not annotate the second note');
    else {
      await ta2.click();
      await ta2.type('second bug on the same screen');
      await page.evaluate(() => {
        const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await sleep(1200);
      const finalGrants = await page.evaluate(() => window.__grants.length);
      ok(finalGrants === 1, `two notes filed off one screen-share prompt (${finalGrants} grant total)`);
    }
  }

  // ── Leaving capture mode releases the still ─────────────────────────────
  await page.keyboard.press('Escape');
  await sleep(600);
  const stillGone = await page.evaluate(() =>
    !window.__qaSR().querySelector('[data-qa-capture-still] canvas'),
  );
  ok(stillGone, 'the still is dropped when capture mode ends');
} catch (err) {
  console.error('  FAIL - threw:', err);
  failures++;
} finally {
  await browser.close();
  server.kill();
}

if (failures) {
  console.error(`\nFREEZE CAPTURE FAIL ❌  ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nFREEZE CAPTURE PASS ✅  one frame, the screen handed straight back, and the crop comes from the photograph');
