import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoA11yViolations, test, waitForIslands } from './fixtures';

// The ChartFrame specimens on the kitchen sink (fictional data). The Playwright web server builds
// with KITCHEN_SINK=1. Each check runs at the narrowest and the widest size of the matrix.

const SPECIMENS = [
  'chartframe--static',
  'chartframe--narrow',
  'chartframe--wide',
  'chartframe--zero-width',
  'chartframe--all-equal',
  'chartframe--edge-ticks',
];
const WIDTHS = [375, 1440] as const;
const SLOW_PAGE_TIMEOUT = 90_000;

async function openAt(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/kitchen-sink');
  await expect(page.locator('[data-specimen="chartframe--static"]')).toBeVisible();
}

/** The frames a visitor sees: CSS hides the other layout of each responsive chart. */
const visibleFrames = (page: Page) => page.locator('[data-specimen^="chartframe--"] svg[data-chart-frame]:visible');

type EdgeTick = { text: string; anchor: string; pastLeft: number; pastRight: number; centre: number; start: number; end: number };

/**
 * The x tick labels of the "outer ticks close to the plot's ends" specimen, with the width of its
 * column: each label's computed anchor, how far it reaches past the frame on either side (negative
 * is inside), and where its centre, start and end sit against its tick, in px.
 */
async function edgeTicks(page: Page): Promise<{ column: number; ticks: EdgeTick[] }> {
  return page.locator('[data-specimen="chartframe--edge-ticks"] svg[data-chart-frame]:visible').evaluate((frame) => {
    const box = frame.getBoundingClientRect();
    const style = getComputedStyle(frame);
    const [left, right] = [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
    const ticks = [...frame.querySelectorAll<SVGTextElement>('[data-tick="x"]')].map((t) => {
      const r = t.getBoundingClientRect();
      const tickX = box.left + left + (Number.parseFloat(t.getAttribute('x')!) / 100) * (box.width - left - right);
      return {
        text: t.textContent ?? '',
        anchor: getComputedStyle(t).textAnchor,
        pastLeft: box.left - r.left,
        pastRight: r.right - box.right,
        centre: (r.left + r.right) / 2 - tickX,
        start: r.left - tickX,
        end: r.right - tickX,
      };
    });
    return { column: frame.closest('[data-chart]')!.getBoundingClientRect().width, ticks };
  });
}

/** Every label is inside the frame, and sits against its tick as its anchor says. */
function expectEdgeTicks(ticks: EdgeTick[], anchors: readonly string[], at: string) {
  expect(ticks.map((t) => t.text)).toEqual(['102,000', '150,000', '196,000']);
  for (const t of ticks) {
    const past = Math.max(t.pastLeft, t.pastRight);
    expect(past, `${at}: "${t.text}" is ${past.toFixed(1)} px past the frame`).toBeLessThanOrEqual(0.5);
  }
  expect(ticks.map((t) => t.anchor), at).toEqual(anchors);
  for (const t of ticks) {
    const off = t.anchor === 'start' ? t.start : t.anchor === 'end' ? t.end : t.centre;
    expect(Math.abs(off), `${at}: "${t.text}" sits ${off.toFixed(1)} px from its tick`).toBeLessThanOrEqual(1);
  }
}

for (const width of WIDTHS) {
  test.describe(`chart frame at ${width} px`, () => {
    test('every specimen shows exactly one frame, the layout that fits the width', async ({ page }) => {
      await openAt(page, width);
      for (const id of SPECIMENS) {
        await expect(page.locator(`[data-specimen="${id}"] svg[data-chart-frame]:visible`)).toHaveCount(1);
      }
      const expected = width < 640 ? 'narrow' : 'wide';
      await expect(
        page.locator('[data-specimen="chartframe--static"] svg[data-chart-frame]:visible'),
      ).toHaveAttribute('data-layout', expected);
      await expect(page.locator('[data-specimen="chartframe--narrow"] svg[data-chart-frame]:visible')).toHaveAttribute(
        'data-layout',
        'narrow',
      );
      await expect(page.locator('[data-specimen="chartframe--wide"] svg[data-chart-frame]:visible')).toHaveAttribute(
        'data-layout',
        'wide',
      );
    });

    test('tick labels render at 12 px or more and annotations at 14 px or more, unscaled', async ({ page }) => {
      await openAt(page, width);
      const sizes = await visibleFrames(page).evaluateAll((frames) =>
        frames.flatMap((frame) =>
          [...frame.querySelectorAll<SVGTextElement>('text[data-tick], text[data-annotation]')].map((t) => {
            const ctm = t.getScreenCTM()!;
            const style = getComputedStyle(t);
            return {
              kind: t.hasAttribute('data-annotation') ? 'annotation' : 'tick',
              fontSize: parseFloat(style.fontSize),
              fontWeight: style.fontWeight,
              scale: [ctm.a, ctm.d],
            };
          }),
        ),
      );
      const tickSizes = sizes.filter((s) => s.kind === 'tick');
      const notes = sizes.filter((s) => s.kind === 'annotation');
      expect(tickSizes.length).toBeGreaterThan(10);
      expect(notes.length).toBeGreaterThanOrEqual(3);
      for (const s of tickSizes) expect(s.fontSize).toBeGreaterThanOrEqual(12);
      for (const s of notes) {
        expect(s.fontSize).toBeGreaterThanOrEqual(14);
        expect(s.fontWeight).toBe('600');
      }
      // No viewBox stretches the text: one user unit is one CSS pixel.
      for (const s of sizes) expect(s.scale).toEqual([1, 1]);
    });

    test('no annotation sits on a mark', async ({ page }) => {
      await openAt(page, width);
      const hits = await visibleFrames(page).evaluateAll((frames) => {
        const out: string[] = [];
        for (const frame of frames) {
          const id = frame.closest('[data-specimen]')!.getAttribute('data-specimen');
          for (const note of frame.querySelectorAll<SVGTextElement>('text[data-annotation]')) {
            const r = note.getBoundingClientRect();
            const inside = (x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
            for (const mark of frame.querySelectorAll<SVGGeometryElement>('[data-mark]')) {
              const ctm = mark.getScreenCTM()!;
              const style = getComputedStyle(mark);
              // The stroke: points every half unit of the path, in screen space.
              if (style.stroke !== 'none') {
                const length = mark.getTotalLength();
                const steps = Math.max(200, Math.ceil(length * 2));
                for (let i = 0; i <= steps; i++) {
                  const p = mark.getPointAtLength((length * i) / steps).matrixTransform(ctm);
                  if (inside(p.x, p.y)) {
                    out.push(`${id}: stroke of ${mark.tagName} at ${Math.round(p.x)},${Math.round(p.y)}`);
                    break;
                  }
                }
              }
              // The fill: a 2 px grid over the annotation, tested in the mark's own coordinates.
              if (style.fill !== 'none') {
                const inverse = ctm.inverse();
                search: for (let x = r.left; x <= r.right; x += 2) {
                  for (let y = r.top; y <= r.bottom; y += 2) {
                    if (mark.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse))) {
                      out.push(`${id}: fill of ${mark.tagName} at ${Math.round(x)},${Math.round(y)}`);
                      break search;
                    }
                  }
                }
              }
            }
          }
        }
        return out;
      });
      expect(hits).toEqual([]);
    });

    test('the y labels sit in the left gutter and the zero-line words in the right margin, 4 px clear of the plot', async ({ page }) => {
      await openAt(page, width);
      const result = await visibleFrames(page).evaluateAll((frames) =>
        frames.map((f) => {
          // The baseline runs the whole width of the plot (a nested svg's own box is its content's, not its viewport).
          const plot = f.querySelector('line[data-baseline]')!.getBoundingClientRect();
          const frame = f.getBoundingClientRect();
          const boxes = (sel: string) => [...f.querySelectorAll<SVGTextElement>(sel)].map((t) => t.getBoundingClientRect());
          return {
            id: f.closest('[data-specimen]')!.getAttribute('data-specimen'),
            plotLeft: plot.left,
            plotRight: plot.right,
            frameLeft: frame.left,
            frameRight: frame.right,
            ticks: boxes('text[data-tick="y"]').map((r) => ({ left: r.left, right: r.right })),
            words: boxes('text[data-side], text[data-zero-label]').map((r) => ({ left: r.left, right: r.right })),
          };
        }),
      );
      expect(result.length).toBeGreaterThan(4);
      for (const r of result) {
        // The plot is the frame inset by the gutters, so the labels sit in the padding.
        expect(r.plotLeft, r.id!).toBeGreaterThan(r.frameLeft);
        for (const t of r.ticks) {
          expect(t.right, `${r.id}: a y tick overlaps the plot`).toBeLessThanOrEqual(r.plotLeft - 4);
          expect(t.left, `${r.id}: a y tick is clipped by the frame`).toBeGreaterThanOrEqual(r.frameLeft - 1);
        }
        for (const w of r.words) {
          expect(w.left, `${r.id}: a zero-line word overlaps the plot`).toBeGreaterThanOrEqual(r.plotRight + 4);
          expect(w.right, `${r.id}: a zero-line word is clipped by the frame`).toBeLessThanOrEqual(r.frameRight + 1);
        }
      }
      const sides = await visibleFrames(page).evaluateAll((frames) => frames.flatMap((f) => [...f.querySelectorAll('text[data-side]')]).length);
      expect(sides).toBe(8);
    });

    test(`outer x tick labels close to the plot's ends stay inside the frame, ${width < 640 ? 'anchored at their ticks' : 'centred on their ticks'}`, async ({ page }) => {
      await openAt(page, width);
      const { ticks } = await edgeTicks(page);
      // A phone column is too narrow to centre them; the widest column has the room.
      expectEdgeTicks(ticks, width < 640 ? ['start', 'middle', 'end'] : ['middle', 'middle', 'middle'], `${width} px`);
    });

    test('the stacked zero-line words keep an even gap of at least 2 px between their boxes', async ({ page }) => {
      await openAt(page, width);
      await page.evaluate(() => document.fonts.ready);
      const stacks = await visibleFrames(page).evaluateAll((frames) =>
        frames.flatMap((f) => {
          const box = (sel: string) => {
            const t = f.querySelector<SVGTextElement>(sel);
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? r : null;
          };
          const above = box('text[data-side="above"]');
          const zero = box('text[data-zero-label]');
          const below = box('text[data-side="below"]');
          if (!above || !zero || !below) return [];
          return [{ id: f.closest('[data-specimen]')!.getAttribute('data-specimen'), upper: zero.top - above.bottom, lower: below.top - zero.bottom }];
        }),
      );
      expect(stacks.length).toBeGreaterThan(0);
      for (const s of stacks) {
        expect(s.upper, `${s.id}: gap between the upper word and the zero label`).toBeGreaterThanOrEqual(2);
        expect(s.lower, `${s.id}: gap between the zero label and the lower word`).toBeGreaterThanOrEqual(2);
        expect(Math.abs(s.upper - s.lower), `${s.id}: the two gaps are ${s.upper.toFixed(2)} and ${s.lower.toFixed(2)} px`).toBeLessThan(1);
      }
    });

    test('every mark keeps its stroke width however far the layer stretches', async ({ page }) => {
      await openAt(page, width);
      const effects = await visibleFrames(page).evaluateAll((frames) =>
        frames.flatMap((f) => [...f.querySelectorAll('[data-mark]')].map((m) => getComputedStyle(m).vectorEffect)),
      );
      expect(effects.length).toBeGreaterThan(0);
      expect(new Set(effects)).toEqual(new Set(['non-scaling-stroke']));
    });

    test('the frames fill their column and the page does not scroll sideways', async ({ page }) => {
      await openAt(page, width);
      const fits = await visibleFrames(page).evaluateAll((frames) =>
        frames.map((f) => Math.abs(f.getBoundingClientRect().width - f.parentElement!.getBoundingClientRect().width) < 1),
      );
      expect(fits).not.toContain(false);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('has no accessibility violations', async ({ page }) => {
      // The axe scan of the whole sink takes about 10 s alone and 40 s in WebKit when every worker is busy.
      test.setTimeout(SLOW_PAGE_TIMEOUT);
      await openAt(page, width);
      await expectNoA11yViolations(page);
    });
  });
}

// The frame states, per outer label, the column width below which it anchors the label at its tick:
// 758 px for the first label of this specimen and 813 px for the last. Either side of each, the
// label is inside the frame and sits where its anchor says. Worked by hand at 13 px, from
// lib/figure/label-width: a digit 0.66 em, a comma 0.32 em, "4" 0.68 em. The gutter is 17 px (8.84 px
// for "4", rounded up, and the 8 px gap) and there is no right margin.
// "102,000" and "196,000" are each 4.28 em, 55.64 px: half of it, plus the 4 px gap, is 31.82 px.
// First tick, at 2% of the plot: 17 px of that is gutter, so the plot gives 14.82 px in its first 2%:
// 741 px of plot, a 758 px column.
// Last tick, at 96%: no right margin, so 31.82 px in the last 4%: 796 px of plot, plus the 17 px
// gutter, a 813 px column.
// The probe columns sit 13 px below 758, between the two, and 12 px above 813.
test('an outer x tick label goes from anchored at its tick to centred as the column passes the width the frame states', async ({ page }) => {
  // The column is the viewport less the page's side padding: measure that once, then set the column.
  await openAt(page, 1000);
  const padding = 1000 - (await edgeTicks(page)).column;
  expect(padding).toBeGreaterThanOrEqual(0);
  for (const [column, anchors] of [
    [745, ['start', 'middle', 'end']],
    [785, ['middle', 'middle', 'end']],
    [825, ['middle', 'middle', 'middle']],
  ] as const) {
    await page.setViewportSize({ width: column + padding, height: 900 });
    await expect.poll(async () => Math.round((await edgeTicks(page)).column)).toBe(column);
    expectEdgeTicks((await edgeTicks(page)).ticks, anchors, `a ${column} px column`);
  }
  // The widths are the ones the frame wrote for this chart.
  const rules = await page.locator('[data-specimen="chartframe--edge-ticks"] style').evaluateAll((els) => els.map((e) => e.textContent).join(''));
  expect(rules).toContain('@container (width < 758px){[data-chart="sink-chart-edge-ticks"] svg[data-layout="wide"] [data-tick-edge="first"]{text-anchor:start}}');
  expect(rules).toContain('@container (width < 813px){[data-chart="sink-chart-edge-ticks"] svg[data-layout="wide"] [data-tick-edge="last"]{text-anchor:end}}');
});

test('no text sits inside an svg that has a viewBox, and no chart prints NaN', async ({ page }) => {
  await page.goto('/kitchen-sink');
  await expect(page.locator('[data-specimen="chartframe--static"]')).toBeVisible();
  await expect(page.locator('svg[viewBox] text')).toHaveCount(0);
  const markup = await page.locator('[data-specimen^="chartframe--"]').evaluateAll((els) => els.map((e) => e.innerHTML).join(''));
  expect(markup).not.toMatch(/NaN|Infinity/);
});

test('the chart is drawn without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/kitchen-sink');
  const frame = page.locator('[data-specimen="chartframe--static"] svg[data-chart-frame]:visible');
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('text[data-annotation]')).toBeVisible();
  await context.close();
});

// Every chart on the kitchen sink at the four widths of the matrix: a visible annotation stays inside the
// plot (so it cannot reach a tick, a margin word or leave the frame) and sits on no label and no mark. An
// annotation that does not fit its plot is hidden (ChartFrame's container query), never squeezed in.
for (const width of [375, 768, 1024, 1440]) {
  test(`@matrix every annotation fits its plot at ${width} px or is hidden`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'the viewport is set here, so one project covers it');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/kitchen-sink');
    await waitForIslands(page);
    const report = await page.evaluate(() => {
      const out = { visible: 0, hidden: 0, problems: [] as string[] };
      for (const frame of document.querySelectorAll<SVGSVGElement>('svg[data-chart-frame]')) {
        if (!frame.checkVisibility()) continue; // the other layout of a responsive chart
        const id = frame.closest('[data-specimen]')?.getAttribute('data-specimen') ?? '(figure)';
        const plot = frame.querySelector('line[data-baseline]')!.getBoundingClientRect();
        const box = frame.getBoundingClientRect();
        const labels = [...frame.querySelectorAll<SVGTextElement>('text:not([data-annotation])')].map((t) => ({ r: t.getBoundingClientRect(), s: (t.textContent ?? '').trim() }));
        for (const note of frame.querySelectorAll<SVGTextElement>('text[data-annotation]')) {
          if (getComputedStyle(note).display === 'none') {
            out.hidden += 1;
            continue;
          }
          out.visible += 1;
          const r = note.getBoundingClientRect();
          if (r.left < plot.left - 1 || r.right > plot.right + 1) out.problems.push(`${id}: the annotation leaves the plot (${Math.round(r.left)}..${Math.round(r.right)} against ${Math.round(plot.left)}..${Math.round(plot.right)})`);
          if (r.left < box.left - 1 || r.right > box.right + 1) out.problems.push(`${id}: the annotation leaves the frame`);
          for (const l of labels) {
            const overlap = r.left < l.r.right && r.right > l.r.left && r.top < l.r.bottom && r.bottom > l.r.top;
            if (overlap) out.problems.push(`${id}: the annotation overlaps the label "${l.s}"`);
          }
          for (const mark of frame.querySelectorAll<SVGGeometryElement>('[data-mark]')) {
            const ctm = mark.getScreenCTM()!;
            const style = getComputedStyle(mark);
            if (style.stroke !== 'none') {
              const length = mark.getTotalLength();
              const steps = Math.max(200, Math.ceil(length * 2));
              for (let i = 0; i <= steps; i++) {
                const p = mark.getPointAtLength((length * i) / steps).matrixTransform(ctm);
                if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) {
                  out.problems.push(`${id}: the annotation sits on a stroke`);
                  break;
                }
              }
            }
            // A fill (the band) with no stroke of its own: a 2 px grid over the annotation, in the mark's coordinates.
            if (style.fill !== 'none') {
              const inverse = ctm.inverse();
              search: for (let x = r.left; x <= r.right; x += 2) {
                for (let y = r.top; y <= r.bottom; y += 2) {
                  if (mark.isPointInFill(new DOMPoint(x, y).matrixTransform(inverse))) {
                    out.problems.push(`${id}: the annotation sits on a filled area`);
                    break search;
                  }
                }
              }
            }
          }
        }
      }
      return out;
    });
    expect(report.problems).toEqual([]);
    expect(report.visible, 'some annotation is drawn').toBeGreaterThan(0);
    // Room enough from the tablet width up: nothing is hidden there.
    if (width >= 1024) expect(report.hidden).toBe(0);
  });
}
