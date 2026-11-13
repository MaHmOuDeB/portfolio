// A focused scrolling region (code block, scrolling table) has its ring scrolled fully into view.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REGION_SELECTOR, revealRegionOnFocus } from '@/components/shell/RegionFocus';

class FakeElement {
  top = -1;
  constructor(private readonly region: boolean) {}
  matches(selector: string): boolean {
    return this.region && selector === REGION_SELECTOR;
  }
  getBoundingClientRect() {
    return { top: this.top, bottom: this.top + 158, left: 16, right: 304, width: 288, height: 158 };
  }
}

const scrolls: number[] = [];

function stubBrowser() {
  scrolls.length = 0;
  vi.stubGlobal('scrollBy', (o: { top: number }) => scrolls.push(o.top));
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('innerHeight', 180);
  vi.stubGlobal('getComputedStyle', () => ({ outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '2px', position: 'static' }));
  vi.stubGlobal('document', { querySelector: () => null });
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
});
