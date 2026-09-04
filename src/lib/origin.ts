/**
 * origin.ts — which component drew this element, and where it lives.
 *
 * WHY THIS EXISTS
 * ---------------
 * A selector says where a thing is on the SCREEN. It does not say where it is
 * in the SOURCE, and those are the two different questions a report has to
 * answer. An agent given `.grid > div:nth-child(3) button` has to go and find
 * which file renders that, and the measured cost of not telling it is large:
 * agents that cannot localise a change apply correct fixes to the wrong file.
 *
 * React already knows. Every DOM node rendered by React carries a fibre under
 * a `__reactFiber$…` key, the fibre chain names the component, and a
 * development build additionally records the file and line the element was
 * written on. None of that is a hack we invent — it is React's own debug data,
 * and when it is absent (a production build, a non-React page) this returns
 * nothing rather than guessing.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It never reports a host element (`div`, `button`) as the component — those
 * are the tags the selector already named. It walks up to the nearest thing
 * with a real name, which is the unit somebody would actually go and edit.
 *
 * It also stops at the first named component rather than reporting the whole
 * tree. `App > Layout > Page > Card > Button` is not more useful than `Card`;
 * it is the same information with the answer buried in it.
 */

export interface QaOrigin {
  /** The component that rendered this, e.g. "PriceCard". */
  component?: string;
  /** Source file, when a development build recorded one. */
  file?: string;
  /** Line in that file. */
  line?: number;
}

/** React attaches its fibre under a key with a per-build random suffix. */
function fiberOf(el: Element): Fiberish | null {
  for (const key in el) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) {
      return (el as unknown as Record<string, Fiberish>)[key] ?? null;
    }
  }
  return null;
}

interface Fiberish {
  type?: unknown;
  return?: Fiberish | null;
  _debugSource?: { fileName?: string; lineNumber?: number } | null;
  _debugOwner?: Fiberish | null;
}

/** The display name of a fibre's component, or null for a host tag. */
function nameOf(fiber: Fiberish): string | null {
  const type = fiber.type as
    | { displayName?: string; name?: string; render?: { displayName?: string; name?: string } }
    | string
    | null
    | undefined;
  // A string type is a host element -- 'div', 'button'. The selector already
  // said that, so it is not an answer to "which component".
  if (!type || typeof type === 'string') return null;
  const direct = type.displayName || type.name;
  if (direct) return direct;
  // memo() / forwardRef() wrap the real component one level down.
  const inner = type.render?.displayName || type.render?.name;
  return inner || null;
}

/**
 * Trim an absolute build path down to something a human and an agent can both
 * use: everything from the project's source root. `/Users/me/app/src/x.tsx`
 * becomes `src/x.tsx`, which is what the repository actually calls it.
 */
function tidyPath(file: string): string {
  const marks = ['/src/', '/app/', '/components/', '/pages/', '/lib/'];
  for (const mark of marks) {
    const at = file.lastIndexOf(mark);
    if (at !== -1) return file.slice(at + 1);
  }
  return file.split('/').slice(-2).join('/');
}

/** How far up the tree to look before giving up. */
const MAX_WALK = 30;

/**
 * Where the element came from in the source, as far as the page will admit.
 *
 * Returns undefined rather than a half-answer: a report that names no file is
 * honest, and one that names the wrong file is worse than silence.
 */
export function resolveOrigin(el: Element | null | undefined): QaOrigin | undefined {
  if (!el || typeof window === 'undefined') return undefined;
  let fiber: Fiberish | null;
  try {
    fiber = fiberOf(el);
  } catch {
    return undefined;
  }
  if (!fiber) return undefined;

  const out: QaOrigin = {};
  let hops = 0;
  for (let f: Fiberish | null = fiber; f && hops < MAX_WALK; f = f.return ?? null, hops++) {
    if (!out.component) {
      const name = nameOf(f);
      if (name) out.component = name;
    }
    if (!out.file) {
      // _debugSource is the element's own JSX position, which is the line
      // somebody would actually open -- better than the component's file when
      // the two differ.
      const src = f._debugSource;
      if (src?.fileName) {
        out.file = tidyPath(src.fileName);
        if (typeof src.lineNumber === 'number') out.line = src.lineNumber;
      }
    }
    if (out.component && out.file) break;
  }

  return out.component || out.file ? out : undefined;
}
