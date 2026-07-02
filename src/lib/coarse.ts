/**
 * coarse.ts — detect a coarse (touch) primary pointer so components can gate
 * new touch-only behaviour behind it without changing existing mouse/desktop
 * behaviour.
 *
 * "Coarse" follows the CSS `(pointer: coarse)` media feature — the primary
 * input can't hover/point with fine precision (touchscreens). Falls back to
 * `navigator.maxTouchPoints` for environments where matchMedia is unavailable
 * or throws.
 *
 * SSR-safe: all paths guard typeof window / navigator.
 */

import { useState, useEffect } from 'react';

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch { /* ignore */ }
  return typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;
}

export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => isCoarsePointer());
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const on = () => setCoarse(isCoarsePointer());
    if (mq.addEventListener) mq.addEventListener('change', on);
    else if (mq.addListener) mq.addListener(on);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', on);
      else if (mq.removeListener) mq.removeListener(on);
    };
  }, []);
  return coarse;
}
