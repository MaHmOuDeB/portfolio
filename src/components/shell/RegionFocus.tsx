'use client';

// Every scrolling region on the site (a code block, a table that scrolls sideways) is a tab stop with
// role="region". Chrome and WebKit leave a partly visible element where it is when it takes focus, so
// on a small screen or at high zoom part of its ring can stay off screen. One listener for the whole
// page scrolls such a region fully into view (revealRing), instead of a handler on each one. A link
// taller than the screen (a whole card at 400% zoom) can never show its whole ring, so the same
// listener shows the top edge of its ring at the top of the screen (revealTop).
import { useEffect } from 'react';
import { revealRing, revealTop } from '@/lib/focus/reveal-ring';

export const REGION_SELECTOR = '[role="region"][tabindex="0"]';
export const LINK_SELECTOR = 'a[href]';

function reveal(target: HTMLElement): void {
  if (target.matches(REGION_SELECTOR)) revealRing(target);
  else revealTop(target);
}

/** Reveals the ring of a focused scrolling region, or the top of a tall link; any other focus target is left alone. */
export function revealRegionOnFocus(event: Pick<FocusEvent, 'target'>): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const region = target.matches(REGION_SELECTOR);
  // A link in the sticky header is always on screen; the header is never scrolled for it.
  if (!region && !(target.matches(LINK_SELECTOR) && target.closest('[data-site-header]') === null)) return;
  reveal(target);
  // The browser makes its own focus scroll after the focus event (WebKit aligns the box, not the ring,
  // with the edge; Chrome centres a tall box), which can undo the scroll above. WebKit makes it either
  // straight after the event or late, with the next frame's layout or from a timer after that frame,
  // so check again in each of the next two frames, before each is painted. A check scrolls only when
  // part of the ring is cut off, so it changes nothing where the earlier pass held; after that a scroll
  // is the reader's own and is left alone.
  recheck(target, RECHECK_FRAMES);
}

const RECHECK_FRAMES = 2;

function recheck(target: HTMLElement, frames: number): void {
  requestAnimationFrame(() => {
    if (document.activeElement !== target) return;
    reveal(target);
    if (frames > 1) recheck(target, frames - 1);
  });
}

export function RegionFocus(): null {
  useEffect(() => {
    document.addEventListener('focusin', revealRegionOnFocus);
    return () => document.removeEventListener('focusin', revealRegionOnFocus);
  }, []);
  return null;
}
