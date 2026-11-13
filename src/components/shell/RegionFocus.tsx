'use client';

// Every scrolling region on the site (a code block, a table that scrolls sideways) is a tab stop with
// role="region". Chrome and WebKit leave a partly visible element where it is when it takes focus, so
// on a small screen or at high zoom part of its ring can stay off screen. One listener for the whole
// page scrolls such a region fully into view (revealRing), instead of a handler on each one.
import { useEffect } from 'react';
import { revealRing } from '@/lib/focus/reveal-ring';

export const REGION_SELECTOR = '[role="region"][tabindex="0"]';

/** Reveals the ring of a focused scrolling region; any other focus target is left alone. */
export function revealRegionOnFocus(event: Pick<FocusEvent, 'target'>): void {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(REGION_SELECTOR)) return;
  revealRing(target);
  // WebKit makes its own focus scroll after the focus event and aligns the box, not the ring, with the
  // edge, which undoes the scroll above. Check once more in the next frame, before it is painted; this
  // scrolls only when part of the ring is cut off, so it changes nothing where the first pass held.
  requestAnimationFrame(() => {
    if (document.activeElement === target) revealRing(target);
  });
}

export function RegionFocus(): null {
  useEffect(() => {
    document.addEventListener('focusin', revealRegionOnFocus);
    return () => document.removeEventListener('focusin', revealRegionOnFocus);
  }, []);
  return null;
}
