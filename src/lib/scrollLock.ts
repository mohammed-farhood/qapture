let lockCount = 0;
let prevHtmlOverflow = '';
let prevBodyOverflow = '';

export function lockPageScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    prevHtmlOverflow = html.style.overflow;
    prevBodyOverflow = body ? body.style.overflow : '';
    html.style.overflow = 'hidden';
    if (body) body.style.overflow = 'hidden';
  }
  lockCount++;
}

export function unlockPageScroll(): void {
  if (typeof document === 'undefined' || lockCount === 0) return;
  lockCount--;
  if (lockCount === 0) {
    document.documentElement.style.overflow = prevHtmlOverflow;
    if (document.body) document.body.style.overflow = prevBodyOverflow;
  }
}
