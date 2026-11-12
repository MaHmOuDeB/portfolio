import type { Page } from '@playwright/test';

// Shared by the exaggeration Figure's own spec and the Lab page's: where the current dot and its ring
// sit on the visible chart.

/**
 * The dot and its ring against the plot of the visible exaggeration chart. The plot is measured from
 * the frame: its left and right edges are the frame's padding (the kit's gutters), its bottom is the
 * baseline and its top is the plot height above it (a nested SVG's bounding box is its content, so
 * the mark layer cannot be measured directly). The ring is the dot's stroke, painted under the fill.
 */
export async function dotGeometry(page: Page) {
  return page.locator('figure[data-figure="curse"]').evaluate((root) => {
    const svg = [...root.querySelectorAll<SVGSVGElement>('svg[data-chart-frame]')].find((s) => s.getClientRects().length > 0)!;
    const dot = svg.querySelector<SVGCircleElement>('[data-curse-dot]');
    if (!dot) return null;
    const frame = svg.getBoundingClientRect();
    const pad = getComputedStyle(svg);
    const base = svg.querySelector('[data-baseline]')!.getBoundingClientRect();
    const bottom = (base.top + base.bottom) / 2;
    const height = svg.querySelector<SVGSVGElement>('[data-mark-layer]')!.height.baseVal.value;
    const plot = { left: frame.left + parseFloat(pad.paddingLeft), right: frame.right - parseFloat(pad.paddingRight), top: bottom - height, bottom };
    const d = dot.getBoundingClientRect();
    const cs = getComputedStyle(dot);
    const ring = parseFloat(cs.strokeWidth) / 2;
    const outer = { left: d.left - ring, right: d.right + ring, top: d.top - ring, bottom: d.bottom + ring };
    const cx = (d.left + d.right) / 2;
    const cy = (d.top + d.bottom) / 2;
    const fig = root.getBoundingClientRect();
    // clipped: an ancestor that does not show overflow and does not hold the whole ring
    const clippedBy: string[] = [];
    for (let el: Element | null = dot.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const o = getComputedStyle(el);
      if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
      const r = el.getBoundingClientRect();
      if (outer.left < r.left - 0.5 || outer.right > r.right + 0.5 || outer.top < r.top - 0.5 || outer.bottom > r.bottom + 0.5) clippedBy.push(el.tagName);
    }
    const ticks = [...svg.querySelectorAll('[data-tick]')].map((t) => t.getBoundingClientRect());
    return {
      ratio: Number(dot.dataset.ratio),
      value: Number(dot.dataset.exaggeration),
      centreInPlot: cx >= plot.left - 0.5 && cx <= plot.right + 0.5 && cy >= plot.top - 0.5 && cy <= plot.bottom + 0.5,
      atLeftEdge: Math.abs(cx - plot.left) <= 1,
      atRightEdge: Math.abs(cx - plot.right) <= 1,
      ringBelowPlotTop: outer.top >= plot.top - 0.5,
      inFigure: outer.left >= fig.left - 0.5 && outer.right <= fig.right + 0.5,
      inViewport: outer.left >= 0 && outer.right <= document.documentElement.clientWidth,
      clippedBy,
      overlapsTick: ticks.some((t) => outer.left < t.right && t.left < outer.right && outer.top < t.bottom && t.top < outer.bottom),
      ring: { stroke: cs.stroke, width: cs.strokeWidth, order: cs.paintOrder },
    };
  });
}
