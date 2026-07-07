/**
 * selector.ts — generate a reasonably stable CSS selector for a DOM element,
 * for the element picker. Priority: #id → data-* → aria-label → name → path.
 *
 * SSR-safe: guards document.body before structural traversal.
 */

function isCleanId(id: string | null | undefined): boolean {
  return !!id && /^[a-zA-Z][\w-]*$/.test(id) && id.length <= 40;
}

function esc(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
  // Fallback for environments without CSS.escape (old Safari/IE): the value
  // is interpolated into a quoted attribute selector, so at minimum escape
  // backslashes and double-quotes to keep the selector syntactically valid.
  return value.replace(/[\\"]/g, '\\$&');
}

function nthOfTypePath(el: Element, maxDepth = 6): string {
  if (typeof document === 'undefined' || !document.body) return '';
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && node !== document.body && depth < maxDepth) {
    const current: Element = node;
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const sameTag = Array.from(parent.children).filter(
      (c) => c.tagName === current.tagName,
    );
    if (sameTag.length === 1) {
      parts.unshift(tag);
    } else {
      parts.unshift(`${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`);
    }
    node = parent;
    depth++;
  }
  return parts.join(' > ');
}

function isUniqueSelector(selector: string): boolean {
  if (!selector) return false;
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

export function getStableSelector(el: Element | null): string {
  if (typeof document === 'undefined') return '';
  if (!el || el.nodeType !== 1) return '';
  const tag = el.tagName.toLowerCase();

  // 1. Clean id
  const htmlEl = el as HTMLElement;
  if (isCleanId(htmlEl.id)) {
    const candidate = `#${esc(htmlEl.id)}`;
    if (isUniqueSelector(candidate)) return candidate;
  }

  // 2. Test/data attributes
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-id', 'data-key']) {
    const val = el.getAttribute(attr);
    if (val) {
      const candidate = `[${attr}="${esc(val)}"]`;
      if (isUniqueSelector(candidate)) return candidate;
    }
  }

  // 3. aria-label on interactive elements
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
    const label = el.getAttribute('aria-label');
    if (label) {
      const candidate = `${tag}[aria-label="${esc(label)}"]`;
      if (isUniqueSelector(candidate)) return candidate;
    }
  }

  // 4. name on form fields
  const name = el.getAttribute('name');
  if (name && ['input', 'select', 'textarea'].includes(tag)) {
    const candidate = `${tag}[name="${esc(name)}"]`;
    if (isUniqueSelector(candidate)) return candidate;
  }

  // 5. Structural fallback — best effort; on unusual DOMs this may still not
  // be unique, but there's no further strategy to fall back to.
  return nthOfTypePath(el);
}
