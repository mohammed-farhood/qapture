/**
 * cssColors.ts — make a page's colours legible to html2canvas.
 *
 * THE BUG THIS EXISTS FOR
 * -----------------------
 * html2canvas@1.4.1 ships its own CSS colour parser, and that parser predates
 * CSS Color 4. Handed `oklch(0.7 0.15 250)` it does not degrade, it does not
 * skip the element — it throws:
 *
 *     Attempting to parse an unsupported color function "oklch"
 *
 * The throw aborts the entire render, so the tester gets no screenshot at all.
 * Not a wrong screenshot: none.
 *
 * That would be an edge case if `oklch()` were exotic. It is the opposite.
 * Tailwind CSS v4 emits `oklch()` for every colour in its default palette, and
 * shadcn/ui, which is built on it, does the same for every theme token. Any
 * app built in the last couple of years on that stack therefore hits this on
 * its very first capture, on every page, forever — and because a retry re-runs
 * the identical render, the Retry button can never succeed either.
 *
 * `lab()`, `lch()`, `oklab()`, `color()` and `color-mix()` fail the same way.
 *
 * THE FIX
 * -------
 * Before html2canvas reads the cloned document, walk it and rewrite every
 * colour it would choke on into plain `rgb()`/`rgba()` — which its parser has
 * always understood — as an inline style on the cloned element. The clone is
 * throwaway, so the real page is never touched.
 *
 * The conversion is done by the browser itself: assign the value to a canvas
 * 2D `fillStyle` and read it back. Whatever colour space the browser can
 * paint, it can convert, so this stays correct for colour functions invented
 * after this file was written. A value the browser also rejects is left alone
 * rather than guessed at.
 *
 * Colours can also hide inside compound values — `linear-gradient(...)`,
 * `box-shadow`, `text-shadow` — so those are scanned and rewritten in place,
 * preserving the rest of the value.
 */

/**
 * Colour functions html2canvas@1.4.1 cannot parse.
 *
 * `color-mix` precedes `color` so the longer name wins the alternation, and
 * the leading word boundary keeps `lab` from matching inside `oklab`.
 */
const UNSUPPORTED_FN = /\b(?:oklch|oklab|lch|lab|color-mix|color)\(/i;

/** Same pattern, stateful, for scanning a compound value. */
function unsupportedFnScanner(): RegExp {
  return /\b(?:oklch|oklab|lch|lab|color-mix|color)\(/gi;
}

/** Plain colour properties, each holding exactly one colour. */
const COLOR_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'columnRuleColor',
  'caretColor',
  'fill',
  'stroke',
] as const;

/** Compound properties that may contain colours among other things. */
const COMPOUND_PROPS = ['backgroundImage', 'boxShadow', 'textShadow'] as const;

let probeCtx: CanvasRenderingContext2D | null | undefined;

/** A 1×1 canvas used purely as the browser's own colour parser. */
function getProbe(): CanvasRenderingContext2D | null {
  if (probeCtx !== undefined) return probeCtx;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    // Every conversion reads a pixel back, and a page can hold thousands of
    // colours — without this hint Chrome warns and falls off the GPU path.
    probeCtx = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    probeCtx = null;
  }
  return probeCtx;
}

/**
 * Convert one colour value to `rgba(r, g, b, a)`, or null if the browser
 * cannot parse it either.
 *
 * Two steps, and the second is the one that matters:
 *
 *  1. VALIDITY. Assigning an invalid value to fillStyle leaves the previous
 *     value in place, so the value is assigned over two different starting
 *     colours. Agreement means it parsed; disagreement means it was rejected.
 *
 *  2. CONVERSION BY PAINTING. Reading fillStyle back is NOT enough: Chrome
 *     round-trips `oklch(0.93 0.03 250)` as `oklch(0.93 0.03 250)`, because
 *     CSS Color 4 serialisation preserves the colour space. A string swap
 *     would hand html2canvas the exact value it cannot parse. So the colour is
 *     painted onto a 1×1 canvas and the pixel is read back — that forces the
 *     browser through its own colour-space conversion and yields plain sRGB
 *     bytes, which every version of html2canvas understands.
 *
 * Out-of-gamut colours are clipped to sRGB, which is what the screen shows
 * anyway on the overwhelming majority of displays.
 */
/**
 * Conversions are memoised: a page has thousands of elements but only a
 * handful of distinct colours, and each miss costs a paint plus a pixel read.
 */
const conversionCache = new Map<string, string | null>();

export function toRenderableColor(value: string): string | null {
  const ctx = getProbe();
  if (!ctx || !value) return null;
  const cached = conversionCache.get(value);
  if (cached !== undefined) return cached;
  const result = convertUncached(ctx, value);
  conversionCache.set(value, result);
  return result;
}

function convertUncached(ctx: CanvasRenderingContext2D, value: string): string | null {
  try {
    ctx.fillStyle = '#000000';
    ctx.fillStyle = value;
    const fromBlack = String(ctx.fillStyle);
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = value;
    if (fromBlack !== String(ctx.fillStyle)) return null; // browser rejected it

    // Already plain enough for html2canvas — skip the paint.
    if (!UNSUPPORTED_FN.test(fromBlack)) return fromBlack;

    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255
      ? `rgb(${r}, ${g}, ${b})`
      : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  } catch {
    return null;
  }
}

/**
 * Rewrite every unsupported colour function inside a compound value.
 *
 * Parenthesis matching is done by hand rather than by regex because these
 * functions nest — `color-mix(in oklch, oklch(0.7 0.1 20), white)` is one
 * colour containing another, and a non-greedy regex would cut it in half.
 */
export function neutralizeColorFunctions(value: string): string {
  if (!value || !UNSUPPORTED_FN.test(value)) return value;
  const scanner = unsupportedFnScanner();
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(value)) !== null) {
    const start = match.index;
    if (start < last) continue; // inside a region already consumed
    let depth = 0;
    let i = start + match[0].length - 1; // the '(' itself
    for (; i < value.length; i++) {
      if (value[i] === '(') depth++;
      else if (value[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (i >= value.length) break; // unbalanced — leave the remainder alone
    const converted = toRenderableColor(value.slice(start, i + 1));
    // A colour neither we nor the browser can resolve becomes transparent:
    // losing one shade is survivable, losing the whole screenshot is not.
    out += value.slice(last, start) + (converted ?? 'rgba(0, 0, 0, 0)');
    last = i + 1;
    scanner.lastIndex = last;
  }
  return out + value.slice(last);
}

/** True when a value would make html2canvas throw. */
export function hasUnsupportedColor(value: string | null | undefined): boolean {
  return !!value && UNSUPPORTED_FN.test(value);
}

/**
 * A colour safe to hand html2canvas as its `backgroundColor` option.
 * That option bypasses the DOM walk below, so it needs converting too.
 */
export function safeBackgroundColor(value: string, fallback = '#ffffff'): string {
  if (!hasUnsupportedColor(value)) return value;
  return toRenderableColor(value) ?? fallback;
}

/**
 * Rewrite unsupported colours throughout a cloned document.
 *
 * @param doc - the clone html2canvas is about to render
 * @param aggressive - additionally drop gradients and shadows entirely. Used
 *   only for the second attempt, after a first render threw anyway: at that
 *   point a plain-looking screenshot beats no screenshot.
 * @returns how many elements were rewritten (0 means this page was never the
 *   problem, which is worth knowing when a capture fails for another reason).
 */
export function neutralizeDocumentColors(doc: Document, aggressive = false): number {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return 0;

  let touched = 0;
  // The clone includes <html> and <body>, whose background is what a region
  // over empty page area gets composited onto, so start at the root.
  const all = doc.querySelectorAll<HTMLElement>('*');
  const elements: HTMLElement[] = [doc.documentElement as HTMLElement, ...Array.from(all)];

  for (const el of elements) {
    if (!el || !el.style) continue;
    let changed = false;
    let computed: CSSStyleDeclaration;
    try {
      computed = view.getComputedStyle(el);
    } catch {
      continue; // exotic node — nothing to fix, and it must not stop the walk
    }

    for (const prop of COLOR_PROPS) {
      const value = computed[prop as unknown as number] as unknown as string
        ?? (computed as unknown as Record<string, string>)[prop];
      if (!hasUnsupportedColor(value)) continue;
      const converted = toRenderableColor(value);
      if (converted) {
        (el.style as unknown as Record<string, string>)[prop] = converted;
        changed = true;
      }
    }

    for (const prop of COMPOUND_PROPS) {
      const value = (computed as unknown as Record<string, string>)[prop];
      if (!value || value === 'none') continue;
      if (aggressive && prop !== 'backgroundImage') {
        (el.style as unknown as Record<string, string>)[prop] = 'none';
        changed = true;
        continue;
      }
      if (!hasUnsupportedColor(value)) continue;
      if (aggressive) {
        (el.style as unknown as Record<string, string>)[prop] = 'none';
        changed = true;
        continue;
      }
      (el.style as unknown as Record<string, string>)[prop] = neutralizeColorFunctions(value);
      changed = true;
    }

    if (changed) touched++;
  }
  return touched;
}
