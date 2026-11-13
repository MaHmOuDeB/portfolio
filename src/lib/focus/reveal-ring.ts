// Chrome and WebKit do not scroll a partly visible element when it takes focus, so a tall control
// (the contact message, a sideways-scrolling screenshot frame) near an edge of the screen keeps part
// of its focus ring off screen. revealRing scrolls the page by exactly the missing amount, at once (no
// smooth scrolling), so the whole ring is on screen. It does not use scrollIntoView: that works on the
// element's box and html's scroll padding, so a box that is taller than the padded screen (a short
// screen, high zoom) is left where it is with its ring cut off. An element taller than the screen is
// left where it is. Browser only.

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
  const above = r.top - reach - top;
  const below = r.bottom + reach - innerHeight;
  if (above < 0) scrollBy({ top: above, behavior: 'instant' });
  else if (below > 0) scrollBy({ top: below, behavior: 'instant' });
}
