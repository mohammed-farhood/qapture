// Walk navigation test (real Chrome) — proves "Take me there" actually TAKES
// you there.
//
// WHY THIS EXISTS
// ---------------
// walkNavigate() used to be `history.pushState({}, '', target)` plus a
// hand-dispatched `popstate`, on the assumption that every SPA router listens
// for popstate. They do not listen for that one: Next's App Router renders
// from the route tree it keeps in `history.state` (which pushState({}) had
// just erased) and React Router keeps its position index in the same place.
// So the URL bar moved and the app stood still — reported from a real app as
// "I said take me there and it didn't, it just selected something on the same
// page".
//
// The old assertion for this lived in walk-test and said "the page moved
// (/ → /checkout)" — but it only ever read window.location.pathname, which
// pushState changes on its own. It passed against a broken feature, for the
// same reason the element-capture fixtures passed against a broken capture:
// the fixture was more cooperative than reality.
//
// So this test never trusts the URL. It plants a value on `window` before
// pressing the button; a real navigation wipes it, a fake one does not. That
// single bit is the difference between arriving and pretending.
//
//   A. STUBBORN APP  — nothing answers the synthetic popstate (the playground
//      has no router at all, which is exactly the real-world failure). The
//      tester must still end up on the target page, for real.
//   B. COOPERATIVE APP — a router that does re-render on popstate. The soft
//      navigation must be left alone: no reload, no lost state.
//   C. WRONG PAGE   — a note filed elsewhere must not flash "found it" at
//      whatever the selector happens to match on the page you are on.
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
const PORT = 5196;
const BASE = `http://localhost:${PORT}/`;
const NOTE_PAGE = '/settings';

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
    window.__qaHud = () => {
      const hud = window.__qaSR()?.querySelector('[role="region"]');
      return hud ? hud.textContent : '';
    };
  });

  // ── Fixture: one captured note, filed on another page ──────────────────
  await page.goto(`${BASE.replace(/\/$/, '')}${NOTE_PAGE}`, { waitUntil: 'networkidle2' });
  await sleep(1400);
  ok(await page.evaluate(() => !!window.__qaSR()),
    `fixture: the widget mounts on ${NOTE_PAGE} (dev server serves the sub-path)`);

  await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
  await page.keyboard.press('KeyC');
  await page.keyboard.up('Shift'); await page.keyboard.up('Alt');
  await sleep(600);
  const target = await page.evaluate(() => {
    const el = document.querySelector('h2') || document.querySelector('button');
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.mouse.click(target.x, target.y);
  await sleep(2800);
  const ta = (await page.evaluateHandle(() => window.__qaSR().querySelector('textarea'))).asElement();
  if (!ta) throw new Error('annotation card never appeared on the fixture page');
  await ta.click();
  await ta.type('nav fixture note');
  await page.evaluate(() => {
    const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /save point/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(1400);

  const filedRoute = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('playground-db');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const all = req.result.transaction('notes', 'readonly').objectStore('notes').getAll();
      all.onerror = () => resolve(null);
      all.onsuccess = () => {
        const n = all.result.find((x) => x.description === 'nav fixture note');
        resolve(n ? { route: n.route, hasTarget: !!n.target, selector: n.target?.selector } : null);
      };
    };
  }));
  ok(filedRoute?.route === NOTE_PAGE,
    `fixture: the note is filed on ${NOTE_PAGE} (got "${filedRoute?.route}")`);
  ok(filedRoute?.hasTarget, 'fixture: the note carries a target selector');

  /** Start the notes walk from the home page, and return the HUD text. */
  async function startWalkFromHome() {
    await page.goto(`${BASE}?qa=walk:notes`, { waitUntil: 'networkidle2' });
    await sleep(1600);
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if (!(sr.textContent || '').includes('Step ')) sr.querySelector('button')?.click();
    });
    await sleep(700);
    return page.evaluate(() => window.__qaHud());
  }

  // ══ CASE A — a stubborn app that ignores the synthetic popstate ════════
  {
    const hud = await startWalkFromHome();
    ok(/Step /.test(hud), `A. the walk starts on the home page (HUD: "${(hud || '').slice(0, 32)}…")`);
    ok(await page.evaluate(() => window.location.pathname === '/'),
      'A. and the tester is on / , not the note\'s page');

    const offered = await page.evaluate(() =>
      [...window.__qaSR().querySelectorAll('button')].some((b) => /take me to/i.test(b.textContent || '')));
    ok(offered, 'A. the stop offers to take the tester to the note\'s page');

    // The whole test in one line: a value that only a REAL page load destroys.
    await page.evaluate(() => { window.__navSentinel = 'alive'; });

    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /take me to/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(3000);

    const after = await page.evaluate(() => ({
      path: window.location.pathname,
      sentinel: window.__navSentinel ?? null,
      hud: window.__qaHud(),
    }));
    ok(after.path === NOTE_PAGE, `A. the address is the note's page (${after.path})`);
    ok(after.sentinel === null,
      after.sentinel === null
        ? 'A. and the app REALLY went there — the page was reloaded, not just re-addressed'
        : 'A. the URL changed but the app never moved (the reported bug: pushState with nobody listening)');
    ok(/Step /.test(after.hud || ''), 'A. the walk survived the navigation');
  }

  // ══ CASE B — an app whose router does answer popstate ══════════════════
  // Here the soft navigation genuinely works, and forcing a reload on top of
  // it would throw away the tester's scroll position and app state for
  // nothing. The fix must be able to tell the two apps apart.
  {
    await startWalkFromHome();
    await page.evaluate(() => {
      // A minimal router: re-render something on popstate, which is exactly
      // the signal walkNavigate looks for.
      const mark = document.createElement('div');
      mark.id = 'fake-router-output';
      document.body.prepend(mark);
      const render = () => {
        mark.textContent = `ROUTED:${window.location.pathname}:${Date.now()}`;
      };
      render();
      window.addEventListener('popstate', render);
      window.__navSentinel = 'alive';
    });
    await sleep(300);

    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /take me to/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(3000);

    const after = await page.evaluate(() => ({
      path: window.location.pathname,
      sentinel: window.__navSentinel ?? null,
      routed: document.getElementById('fake-router-output')?.textContent ?? null,
    }));
    ok(after.path === NOTE_PAGE, `B. a router-driven app still ends up on the right page (${after.path})`);
    ok(after.sentinel === 'alive',
      after.sentinel === 'alive'
        ? 'B. and it was NOT reloaded — the app\'s own routing was trusted'
        : 'B. it reloaded an app that had already navigated itself, throwing away its state');
    ok((after.routed || '').includes(NOTE_PAGE), 'B. the app rendered the new route');
  }

  // ══ CASE C — a note that belongs to another page ═══════════════════════
  // The playground serves the same markup on every path, so the note's stored
  // selector DOES match an element on the home page. That is precisely the
  // trap: the old locate button would light up a real element and look like it
  // had found the right one.
  {
    await page.goto(BASE, { waitUntil: 'networkidle2' });
    await sleep(1500);
    // The walk from case B is still running — it survives page loads now,
    // which is the point of case A — and the HUD replaces the panel while it
    // does. Leave it before looking for the notes list.
    await page.evaluate(() => {
      const b = [...window.__qaSR().querySelectorAll('button')].find((x) => /^Exit$/i.test((x.textContent || '').trim()));
      if (b) b.click();
    });
    await sleep(600);
    await page.evaluate(() => {
      const sr = window.__qaSR();
      if (!sr.querySelector('li')) sr.querySelector('button')?.click();
    });
    await sleep(800);
    // Open the note's location details.
    await page.evaluate(() => {
      const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('nav fixture note'));
      const toggle = li && [...li.querySelectorAll('button')].find((b) => /show|where/i.test(b.textContent || ''));
      if (toggle) toggle.click();
    });
    await sleep(500);

    const locate = await page.evaluate(() => {
      const li = [...window.__qaSR().querySelectorAll('li')].find((el) => (el.textContent || '').includes('nav fixture note'));
      const text = li?.textContent || '';
      return {
        saysOtherPage: /not the page you are on/i.test(text),
        offersGo: [...(li?.querySelectorAll('button') ?? [])].some((b) => /go to/i.test(b.textContent || '')),
        offersLocate: [...(li?.querySelectorAll('button') ?? [])].some((b) => /locate on page/i.test(b.textContent || '')),
      };
    });
    ok(locate.saysOtherPage, 'C. a note from another page says so instead of hunting here');
    ok(locate.offersGo, 'C. and offers to go there');
    ok(!locate.offersLocate,
      locate.offersLocate
        ? 'C. it still offers "Locate on page", which would flash whatever the selector matches HERE'
        : 'C. it no longer offers to locate something that is not on this page');
  }
} finally {
  await browser.close();
  server.kill('SIGTERM');
}

if (failures > 0) {
  console.error(`\nWALK NAVIGATION: ${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\nWALK NAVIGATION PASS ✅  "take me there" arrives for real, trusts an app that routes itself, and never points at the wrong page');
