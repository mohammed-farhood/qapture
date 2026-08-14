// Walk test (real Chrome, v0.7).
//
// The Walk's entire value proposition is that it TAKES the tester somewhere
// and is still there when they arrive. Both halves are invisible to a unit
// test and neither fails loudly when broken — a walk that doesn't survive a
// page load just quietly isn't there any more, and a tester assumes they did
// something wrong. So this drives real Chrome and asserts on what a person
// would see.
//
//   1. PLAN WALK       — a Guide step starts a walk at that step, with what
//      to check and where.
//   2. TAKE ME THERE   — pressing it actually changes the page.
//   3. SURVIVES A HARD RELOAD — the make-or-break property.
//   4. DOESN'T APPLY   — the third grade sticks, and leaves coverage alone.
//   5. NOTES WALK      — walks the filtered list; a re-test stop offers
//      re-shoot and a verdict.
//   6. DEEP LINK       — ?qa=walk:retest opens straight into the re-test
//      round, and the parameter is consumed.
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
const PORT = 5194;
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
  defaultViewport: { width: 1280, height: 900 },
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__qaSR = () => document.querySelector('qapture-overlay')?.shadowRoot;
    window.__qaOpenPanel = () => {
      const sr = window.__qaSR();
      if (!sr) return false;
      const open = [...sr.querySelectorAll('button')]
        .some((b) => /capture from page|quick note/i.test(b.textContent || ''));
      if (!open) sr.querySelector('button').click();
      return true;
    };
    window.__qaHud = () => {
      const sr = window.__qaSR();
      const hud = sr && sr.querySelector('[role="region"]');
      return hud ? hud.textContent : '';
    };
  });
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(1400);

  // ── 1. A Guide step starts the walk ────────────────────────────────────
  await page.evaluate(() => { window.__qaOpenPanel(); });
  await sleep(600);
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /guide/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(600);

  const started = await page.evaluate(() => {
    // The per-step "walk from here" control.
    const b = [...window.__qaSR().querySelectorAll('button')]
      .find((x) => /take me to/i.test(x.getAttribute('aria-label') || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(started, '1. every Guide step offers "take me there" — the checklist is no longer paper');
  await sleep(700);

  const hud = await page.evaluate(() => window.__qaHud());
  ok(/Step 1 of/.test(hud), `1. pressing it opens the walk at that step (HUD: "${(hud || '').slice(0, 40)}…")`);

  // ── 2. Take me there actually navigates ────────────────────────────────
  // Step 1 of the playground journey is "/" — the page we are already on, so
  // the HUD correctly hides the button. Move to step 2 (/checkout), which is
  // somewhere else, and use it there.
  const noButtonWhenHere = await page.evaluate(() =>
    ![...window.__qaSR().querySelectorAll('button')].some((x) => /take me to/i.test(x.textContent || '')));
  ok(noButtonWhenHere, '2. no "take me there" when the stop is the page you are on');

  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Next$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(500);

  const before = await page.evaluate(() => window.location.pathname);
  const navigated = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /take me to/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(900);
  const after = await page.evaluate(() => window.location.pathname);
  ok(navigated && after !== before, `2. "Take me there" moves the page (${before} → ${after})`);

  // ── 3. The walk survives a hard reload ─────────────────────────────────
  // This is the property everything else depends on: a walk navigates, and a
  // navigation may be a full page load.
  const beforeReload = await page.evaluate(() => window.__qaHud());
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1600);
  const afterReload = await page.evaluate(() => window.__qaHud());
  ok(/Step 2 of/.test(beforeReload), `3. the walk advanced to step 2 (before: "${(beforeReload || '').slice(0, 30)}…")`);
  ok(/Step 2 of/.test(afterReload),
    `3. AND IS STILL THERE, on the same step, after a full page reload (after: "${(afterReload || '').slice(0, 30)}…")`);

  // ── 4. "Doesn't apply" ─────────────────────────────────────────────────
  const naClicked = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^N\/A$/i.test((x.textContent || '').trim()));
    if (!b) return false;
    b.click();
    return true;
  });
  await sleep(500);
  ok(naClicked, '4. a plan step can be marked "doesn\'t apply to this build"');
  const naPersisted = await page.evaluate(() => {
    const raw = localStorage.getItem('playground:guideSkipped');
    return raw ? JSON.parse(raw).length : 0;
  });
  ok(naPersisted === 1, `4. and it is remembered (${naPersisted} skipped)`);
  const naNotPass = await page.evaluate(() => {
    const checked = JSON.parse(localStorage.getItem('playground:guide') || '[]');
    const failed = JSON.parse(localStorage.getItem('playground:guideFailed') || '[]');
    return checked.length === 0 && failed.length === 0;
  });
  ok(naNotPass, '4. "doesn\'t apply" is neither a pass nor a fail');

  // ── 5. Walking the notes ───────────────────────────────────────────────
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Exit$/i.test((x.textContent || '').trim()));
    if (b) b.click();
  });
  await sleep(500);

  const addNote = async (text) => {
    await page.evaluate(() => { window.__qaOpenPanel(); });
    await sleep(400);
    // The panel remembers its tab now, and we left it on Guide.
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if ([...sr.querySelectorAll('button')].some((b) => /quick note/i.test(b.textContent || ''))) return;
      const notesTab = [...sr.querySelectorAll('button')].find((b) => /^Notes$/i.test((b.textContent || '').trim()));
      if (notesTab) notesTab.click();
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
  await addNote('walk fixture one');
  await addNote('walk fixture two');

  // Put one into the re-test queue.
  await page.evaluate(() => {
    const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('walk fixture one'));
    const pill = li && [...li.querySelectorAll('button')].find((b) => /Open/.test(b.textContent || ''));
    if (pill) pill.click();
  });
  await sleep(600);

  const walkedNotes = await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /walk these/i.test(x.textContent || ''));
    if (!b) return false;
    b.click();
    return true;
  });
  ok(walkedNotes, '5. the notes list offers "Walk these"');
  await sleep(800);
  const notesHud = await page.evaluate(() => window.__qaHud());
  ok(/Point \d/.test(notesHud), `5. the walk shows a captured point (HUD: "${(notesHud || '').slice(0, 40)}…")`);
  ok(/Re-test|Still broken|Verified/.test(notesHud),
    '5. a note stop offers a verdict rather than pass/fail');

  // ── 6. Deep link ───────────────────────────────────────────────────────
  await page.goto(`${BASE}?qa=walk:retest`, { waitUntil: 'networkidle2' });
  await sleep(1800);
  const deepHud = await page.evaluate(() => window.__qaHud());
  ok(/Point \d/.test(deepHud), `6. ?qa=walk:retest opens straight into a walk (HUD: "${(deepHud || '').slice(0, 40)}…")`);
  ok(/Re-test now/i.test(deepHud),
    '6. and it is the RE-TEST round — the stop offers a re-shoot');
  const url = await page.evaluate(() => window.location.search);
  ok(!url.includes('qa=walk'),
    `6. the parameter is consumed, so a later reload resumes instead of restarting (search: "${url}")`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nWALK: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nWALK PASS ✅  guide→walk + real navigation + survives reload + N/A + notes walk + deep link');
