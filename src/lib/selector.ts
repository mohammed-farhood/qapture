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
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value;
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

export function getStableSelector(el: Element | null): string {
  if (typeof document === 'undefined') return '';
  if (!el || el.nodeType !== 1) return '';
  const tag = el.tagName.toLowerCase();

  // 1. Clean id
  const htmlEl = el as HTMLElement;
  if (isCleanId(htmlEl.id)) return `#${esc(htmlEl.id)}`;

  // 2. Test/data attributes
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-id', 'data-key']) {
    const val = el.getAttribute(attr);
    if (val) return `[${attr}="${esc(val)}"]`;
  }

  // 3. aria-label on interactive elements
  if (['button', 'a', 'input', 'select', 'textarea'].includes(tag)) {
    const label = el.getAttribute('aria-label');
    if (label) return `${tag}[aria-label="${esc(label)}"]`;
  }

  // 4. name on form fields
  const name = el.getAttribute('name');
  if (name && ['input', 'select', 'textarea'].includes(tag)) {
    return `${tag}[name="${esc(name)}"]`;
  }

  // 5. Structural fallback
  return nthOfTypePath(el);
}
