/**
 * doctor.ts — check the things that have actually gone wrong, and say so.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every real failure this tool has had was invisible from the outside. The
 * screenshot that died on a cross-origin image, the redraw engine locking the
 * tab on a big page, the chunk that never loaded behind a strict CSP, the
 * permission granted to a build that no longer existed — in every case the
 * tester saw a spinner or a shrug, and the explanation was sitting in a
 * console nobody opens.
 *
 * So this is not a generic health check. Every probe below is a post-mortem of
 * something that has already cost somebody an afternoon, phrased as a question
 * the page can answer about itself right now.
 *
 * WHERE IT LIVES, AND WHY THAT MATTERS
 * ------------------------------------
 * In Settings, behind a button, and nowhere else. A diagnostic that greets a
 * client with warnings about canvas tainting has made the product worse: they
 * cannot act on it, and it teaches them the tool is fragile. It runs when
 * somebody goes looking for it, which is exactly when it is useful.
 *
 * Nothing here is destructive: it reads state and renders one tiny canvas.
 */

import { isExactCaptureSupported, getExactCaptureStatus } from './screenCapture';

export type Verdict = 'ok' | 'warn' | 'bad' | 'info';

export interface Check {
  /** Short label, e.g. "Screenshot engine". */
  label: string;
  verdict: Verdict;
  /** One line a non-engineer can act on, or at least repeat to someone. */
  detail: string;
}

/** Roughly how many elements before the redraw engine locks the tab. */
const HEAVY_PAGE = 6000;

/**
 * Can this page's canvas actually be turned into an image?
 *
 * This is the exact failure that killed every screenshot on an image-heavy
 * page: drawing a cross-origin image succeeds, taints the canvas, and the
 * export throws. Rather than reason about it, we reproduce it in miniature —
 * one pixel, one read-back — which is the only answer that cannot be wrong.
 */
function canvasIsReadable(): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 1, 1);
    c.toDataURL();
    return true;
  } catch {
    return false;
  }
}

/** Images on the page the browser will not let us read back. */
function taintingImages(): number {
  let count = 0;
  const here = location.origin;
  for (const img of Array.from(document.images)) {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
    try {
      if (new URL(src, here).origin !== here && !img.crossOrigin) count++;
    } catch { /* an unparseable src is not evidence of anything */ }
  }
  return count;
}

export async function runDoctor(): Promise<Check[]> {
  const out: Check[] = [];
  if (typeof document === 'undefined') return out;

  // 1. Which engine will actually take the next screenshot.
  const supported = isExactCaptureSupported();
  const status = getExactCaptureStatus();
  out.push(
    !supported
      ? {
          label: 'Screenshot engine',
          verdict: 'warn',
          detail: 'This browser cannot photograph the tab, so screenshots are re-drawn. ' +
            'Charts, maps and anything on a canvas may come out blank. Chrome or Edge can photograph.',
        }
      : status === 'live'
        ? { label: 'Screenshot engine', verdict: 'ok', detail: 'Real photographs. This is the accurate one.' }
        : {
            label: 'Screenshot engine',
            verdict: 'warn',
            detail: 'Photographs are switched off, so screenshots are re-drawn and may not match the page.',
          },
  );

  // 2. The taint bug, reproduced rather than guessed at.
  const readable = canvasIsReadable();
  const risky = taintingImages();
  out.push(
    !readable
      ? {
          label: 'Screenshot encoding',
          verdict: 'bad',
          detail: 'This page cannot turn a drawing into an image at all. Re-drawn screenshots will fail here; use photographs.',
        }
      : risky > 0
        ? {
            label: 'Screenshot encoding',
            verdict: 'info',
            detail: `${risky} image(s) come from another site without permission to be read. ` +
              'They are skipped and appear blank in a re-drawn screenshot; photographs are unaffected.',
          }
        : { label: 'Screenshot encoding', verdict: 'ok', detail: 'Nothing on this page blocks screenshot encoding.' },
  );

  // 3. Page weight — the thing that locked the tab.
  const nodes = document.getElementsByTagName('*').length;
  out.push({
    label: 'Page size',
    verdict: nodes > HEAVY_PAGE ? 'warn' : 'ok',
    detail: nodes > HEAVY_PAGE
      ? `${nodes.toLocaleString()} elements. Too many to re-draw without freezing the tab, so re-drawn screenshots are refused here. Photographs work fine.`
      : `${nodes.toLocaleString()} elements. Comfortable for either engine.`,
  });

  // 4. Can the screenshot library actually be fetched? A strict script-src or
  //    an unreachable CDN turns capture into a spinner that never ends.
  try {
    await import('html2canvas');
    out.push({ label: 'Screenshot library', verdict: 'ok', detail: 'Loads correctly.' });
  } catch {
    out.push({
      label: 'Screenshot library',
      verdict: 'bad',
      detail: 'Blocked or unreachable — often a strict Content-Security-Policy. Re-drawn screenshots cannot work here.',
    });
  }

  // 5. Storage. Notes live in this browser until they are exported.
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota) {
      const usedPct = Math.round(((est.usage ?? 0) / est.quota) * 100);
      out.push({
        label: 'Storage',
        verdict: usedPct > 90 ? 'bad' : usedPct > 70 ? 'warn' : 'ok',
        detail: `${usedPct}% of this site's storage used. Notes are kept in this browser until you export them.`,
      });
    }
  } catch { /* not every browser will say, and that is not a fault */ }

  // 6. Dictation.
  const voice = typeof window !== 'undefined' &&
    !!((window as unknown as Record<string, unknown>).SpeechRecognition ||
       (window as unknown as Record<string, unknown>).webkitSpeechRecognition);
  out.push({
    label: 'Voice input',
    verdict: voice ? 'ok' : 'info',
    detail: voice ? 'Available — you can speak your notes.' : 'Not available in this browser. Typing still works.',
  });

  // 7. Secure context. getDisplayMedia and the microphone both need it, and
  //    "it works on my machine but not on the staging box" is usually this.
  out.push({
    label: 'Secure connection',
    verdict: window.isSecureContext ? 'ok' : 'bad',
    detail: window.isSecureContext
      ? 'https — photographs and voice are allowed.'
      : 'Not https. Photographs and voice are blocked by the browser on an insecure page.',
  });

  return out;
}
