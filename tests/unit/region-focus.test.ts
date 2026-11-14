// A focused scrolling region (code block, scrolling table) has its ring scrolled fully into view.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LINK_SELECTOR, REGION_SELECTOR, revealRegionOnFocus } from '@/components/shell/RegionFocus';

class FakeElement {
  top = -1;
  height = 158;
  link = false;
  inHeader = false;
  constructor(private readonly region: boolean) {}
  matches(selector: string): boolean {
    if (selector === REGION_SELECTOR) return this.region;
    if (selector === LINK_SELECTOR) return this.link;
    return false;
  }
  closest(selector: string): unknown {
    return selector === '[data-site-header]' && this.inHeader ? {} : null;
  }
  getBoundingClientRect() {
    return { top: this.top, bottom: this.top + this.height, left: 16, right: 304, width: 288, height: this.height };
  }
}

/** A focused card link taller than the 180 px screen (the whole Home card at 400% zoom). */
function tallLink(top: number): FakeElement {
  const el = new FakeElement(false);
  el.link = true;
  el.height = 400;
  el.top = top;
  return el;
}

const scrolls: number[] = [];
const frames: Array<() => void> = [];

function stubBrowser() {
  scrolls.length = 0;
  vi.stubGlobal('scrollBy', (o: { top: number }) => scrolls.push(o.top));
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('innerHeight', 180);
  vi.stubGlobal('getComputedStyle', () => ({ outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '2px', position: 'static' }));
  frames.length = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => frames.push(cb));
  vi.stubGlobal('document', { querySelector: () => null, activeElement: null });
}

afterEach(() => vi.unstubAllGlobals());

describe('revealRegionOnFocus', () => {
  it('selects exactly the focusable regions', () => {
    expect(REGION_SELECTOR).toBe('[role="region"][tabindex="0"]');
  });

  it('scrolls a focused region whose ring is partly off screen, when it fits the screen', () => {
    stubBrowser();
    const region = new FakeElement(true);
    revealRegionOnFocus({ target: region as unknown as EventTarget });
    // Top at -1 with a 4 px ring: scroll up by 5 px, even though the box itself is nearly all in view.
    expect(scrolls).toEqual([-5]);
  });

  it('scrolls down by the missing amount when the ring hangs below the screen', () => {
    stubBrowser();
    const region = new FakeElement(true);
    region.top = 20;
    revealRegionOnFocus({ target: region as unknown as EventTarget });
    expect(scrolls).toEqual([2]);
  });

  it('scrolls by whole pixels, rounded away from the screen edge, so no fraction of the ring stays cut off', () => {
    // A browser moves the page by whole pixels: scrolling by -5.44 can land 0.44 px short.
    stubBrowser();
    const above = new FakeElement(true);
    above.top = -1.4375;
    revealRegionOnFocus({ target: above as unknown as EventTarget });
    expect(scrolls).toEqual([-6]);
    stubBrowser();
    const below = new FakeElement(true);
    below.top = 18.34375;
    revealRegionOnFocus({ target: below as unknown as EventTarget });
    expect(scrolls).toEqual([1]);
  });

  it('does nothing when the whole ring is already on screen', () => {
    stubBrowser();
    const region = new FakeElement(true);
    region.top = 10;
    revealRegionOnFocus({ target: region as unknown as EventTarget });
    expect(scrolls).toEqual([]);
  });

  it('leaves any other focus target alone', () => {
    stubBrowser();
    const other = new FakeElement(false);
    revealRegionOnFocus({ target: other as unknown as EventTarget });
    expect(scrolls).toEqual([]);
  });

  it('reveals again in the next frame, after the browser has made its own focus scroll', () => {
    stubBrowser();
    const region = new FakeElement(true);
    region.top = 10;
    (document as unknown as { activeElement: unknown }).activeElement = region;
    revealRegionOnFocus({ target: region as unknown as EventTarget });
    expect(scrolls).toEqual([]);
    // WebKit aligns the box with the top edge after the focus event: the ring is cut off again.
    region.top = 0;
    frames.forEach((f) => f());
    expect(scrolls).toEqual([-4]);
  });

  it('puts the ring top of a link taller than the screen at the top when that edge is above the screen', () => {
    stubBrowser();
    // Ring top at -120 - 4: scroll up by 124 px, so the top edge and its ring show.
    revealRegionOnFocus({ target: tallLink(-120) as unknown as EventTarget });
    expect(scrolls).toEqual([-124]);
  });

  it('puts the ring top of a tall link at the top when that edge is below the screen, in whole pixels', () => {
    stubBrowser();
    revealRegionOnFocus({ target: tallLink(200.6) as unknown as EventTarget });
    // 200.6 - 4 = 196.6, rounded down so the edge never lands a fraction above the top.
    expect(scrolls).toEqual([196]);
  });

  it('leaves a tall link alone when the top edge of its ring is already on screen', () => {
    stubBrowser();
    revealRegionOnFocus({ target: tallLink(30) as unknown as EventTarget });
    expect(scrolls).toEqual([]);
  });

  it('leaves a link that fits the screen to the browser, and a link in the header alone', () => {
    stubBrowser();
    const fits = new FakeElement(false);
    fits.link = true;
    revealRegionOnFocus({ target: fits as unknown as EventTarget });
    const header = tallLink(-120);
    header.inHeader = true;
    revealRegionOnFocus({ target: header as unknown as EventTarget });
    expect(scrolls).toEqual([]);
  });

  it('shows the top of a tall link again in the next frame, after the browser has made its own focus scroll', () => {
    stubBrowser();
    const link = tallLink(0);
    (document as unknown as { activeElement: unknown }).activeElement = link;
    revealRegionOnFocus({ target: link as unknown as EventTarget });
    expect(scrolls).toEqual([-4]);
    // The browser centres the tall box after the focus event: its top is above the screen again.
    link.top = -110;
    frames.forEach((f) => f());
    expect(scrolls).toEqual([-4, -114]);
  });

  it('does not reveal in the next frame when nothing is cut off or focus has moved on', () => {
    stubBrowser();
    const region = new FakeElement(true);
    region.top = 10;
    (document as unknown as { activeElement: unknown }).activeElement = region;
    revealRegionOnFocus({ target: region as unknown as EventTarget });
    frames.forEach((f) => f());
    expect(scrolls).toEqual([]);
    region.top = 0;
    (document as unknown as { activeElement: unknown }).activeElement = null;
    frames.forEach((f) => f());
    expect(scrolls).toEqual([]);
  });
});
