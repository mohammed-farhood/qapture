let locked = false;
let prevHtmlOverflow = '';
let prevBodyOverflow = '';

export function lockPageScroll(): void {
  if (typeof document === 'undefined' || locked) return;
  const html = document.documentElement;
  const body = document.body;
  prevHtmlOverflow = html.style.overflow;
  prevBodyOverflow = body ? body.style.overflow : '';
  html.style.overflow = 'hidden';
  if (body) body.style.overflow = 'hidden';
  locked = true;
}

export function unlockPageScroll(): void {
  if (typeof document === 'undefined' || !locked) return;
  document.documentElement.style.overflow = prevHtmlOverflow;
  if (document.body) document.body.style.overflow = prevBodyOverflow;
  locked = false;
}
