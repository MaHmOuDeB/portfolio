// Chrome and WebKit do not scroll a partly visible element when it takes focus, so a tall control
// (the contact message, a sideways-scrolling screenshot frame) near an edge of the screen keeps part
// of its focus ring off screen. revealRing scrolls such an element to the nearest edge, at once (no
// smooth scrolling); html's scroll padding leaves room for the ring and for the sticky header there.
// An element taller than the screen is left where it is. Browser only.

/** The focus ring's reach past the element's box: outline width plus offset, or 0 with no outline. */
function reachOf(el: Element): number {
  const s = getComputedStyle(el);
  return s.outlineStyle === 'none' ? 0 : Math.max(0, parseFloat(s.outlineWidth) + parseFloat(s.outlineOffset));
}

/** The px the sticky header covers at the top of the screen (0 when it scrolls away). */
function coveredTop(): number {
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (header === null || getComputedStyle(header).position !== 'sticky') return 0;
  return Math.max(0, header.getBoundingClientRect().bottom);
}

export function revealRing(el: Element): void {
  const reach = reachOf(el);
  const r = el.getBoundingClientRect();
  const top = coveredTop();
  if (r.height + 2 * reach > innerHeight - top) return;
  if (r.top - reach < top || r.bottom + reach > innerHeight) el.scrollIntoView({ block: 'nearest' });
}
