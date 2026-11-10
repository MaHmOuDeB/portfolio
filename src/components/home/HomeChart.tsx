'use client';

// The scroll moment's live chart: the kit's ConfidenceChart, sized from the box it is drawn in.
// A ResizeObserver reads two things, never the window:
// - the width of its own box: below 640 px the narrow layout, else the wide one;
// - the height of its sizer, which CSS gives the phone's sticky canvas only (`--chart-h-phone`,
//   40svh): the plot is that height less 88 px for the axes above and below it, and at least 80 px.
//   Everywhere else (the two-column stage, the stacked frames) the sizer has no height and the plot
//   is 280 px.
// The server cannot measure, so it draws the 280 px plot in both layouts (the viewport picks one, as
// the kit does). That is already the final geometry outside the phone canvas; inside it, CSS holds
// the chart's box at 40svh from the first paint and hides the unmeasured chart, so nothing around it
// moves when the measured chart appears. A small viewport unit does not change when a phone's toolbar
// collapses, so neither does the chart.
// The table is the caller's (counts printed by the small-count rule): it is shown only if the chart
// throws, in place of the chart, by the kit's error boundary.
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import { FigureErrorBoundary } from '@/components/kit/FigureErrorBoundary';
import { liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import type { Layout } from '@/lib/figure/scales';
import { resolveFigureBody } from '@/lib/figure/states';

/** The plot where no box sets it, and the room ChartFrame keeps for its axes (40 above, 48 below). */
const FIXED_PLOT = 280;
const AXES = 88;
const MIN_PLOT = 80;
/** The container width below which the narrow layout is drawn (the kit's sm). */
const NARROW_BELOW = 640;

/** The plot height for a sizer `fit` px tall: 0 (or unmeasurable) means no box, so the fixed plot. */
export function plotHeight(fit: number): number {
  if (!Number.isFinite(fit) || fit <= 0) return FIXED_PLOT;
  return Math.max(MIN_PLOT, fit - AXES);
}

/** The layout a container `width` px wide holds. */
export function chartLayout(width: number): Layout {
  return width < NARROW_BELOW ? 'narrow' : 'wide';
}

type Measured = { layout: Layout; plot: number };

export function HomeChart({
  snapshot,
  table,
  refs,
  ariaLabel,
}: {
  snapshot: LiveSnapshot;
  table: TableData;
  refs: readonly DerivedRef[];
  ariaLabel?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  // Unique per instance and the same on the server and in the browser: the canvas and a stacked frame
  // may draw the same chart in one page.
  const id = `home-chart-${useId().replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`;

  useLayoutEffect(() => {
    const box = root.current;
    const fit = sizer.current;
    if (box === null || fit === null) return;
    // The first observation arrives before the next paint; later ones only when a box changes size.
    const observer = new ResizeObserver(() => {
      const next = { layout: chartLayout(box.clientWidth), plot: plotHeight(fit.clientHeight) };
      setMeasured((prev) => (prev !== null && prev.layout === next.layout && prev.plot === next.plot ? prev : next));
    });
    observer.observe(box);
    observer.observe(fit);
    return () => observer.disconnect();
  }, []);

  const plot = measured?.plot ?? FIXED_PLOT;
  return (
    <div ref={root} data-home-chart="" data-plot={plot} data-measured={measured ? '' : undefined} className="relative">
      <div ref={sizer} data-home-chart-sizer="" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 w-px" />
      <FigureErrorBoundary id={id} body="live" table={table}>
        <ConfidenceChart
          id={id}
          snapshot={snapshot}
          body={resolveFigureBody(liveFigureState(snapshot))}
          refs={refs}
          layout={measured?.layout}
          height={{ narrow: plot, wide: plot }}
          ariaLabel={ariaLabel}
        />
      </FigureErrorBoundary>
    </div>
  );
}
