// The scroll moment's live chart as markup, with no hooks, so the server can draw it: the box
// HomeChart measures (its sizer included) around the kit's ConfidenceChart. The server draws each
// chart with it as the preview the page shows until the chart's code has loaded (or for good, if that
// code cannot load); the client HomeChart, loaded later, draws the same markup and then measures it.
// Server-safe.
//
// The sizing rule lives here so both sides share it:
// - below a 640 px container the narrow layout, else the wide one;
// - the plot is the sizer's height less 88 px for the axes above and below it (ChartFrame's 40 and
//   48), at least 80 px; a sizer with no height (everywhere but the phone's sticky canvas) gives the
//   fixed 280 px plot, which is also what the server draws.
import type { ReactNode, Ref } from 'react';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import type { DerivedRef } from '@/components/kit/Derived';
import { liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import type { Layout } from '@/lib/figure/scales';
import { resolveFigureBody } from '@/lib/figure/states';

/** The plot where no box sets it, and the room ChartFrame keeps for its axes (40 above, 48 below). */
export const FIXED_PLOT = 280;
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

/** The measured box: `data-measured` once HomeChart has read it, the sizer CSS gives a height in the phone canvas. */
export function HomeChartBox({
  plot,
  measured,
  rootRef,
  sizerRef,
  children,
}: {
  plot: number;
  measured: boolean;
  rootRef?: Ref<HTMLDivElement>;
  sizerRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div ref={rootRef} data-home-chart="" data-plot={plot} data-measured={measured ? '' : undefined} className="relative">
      <div ref={sizerRef} data-home-chart-sizer="" aria-hidden="true" className="pointer-events-none absolute top-0 left-0 w-px" />
      {children}
    </div>
  );
}

export type HomeChartDrawing = {
  /** Unique in the page: the canvas and a stacked frame may draw the same chart. */
  id: string;
  snapshot: LiveSnapshot;
  refs: readonly DerivedRef[];
  ariaLabel?: string;
  /** Unset until measured: both layouts, CSS picks one. */
  layout?: Layout;
  plot: number;
};

/** The kit's chart at a plot height, in one layout or (unmeasured) both. */
export function HomeChartDrawing({ id, snapshot, refs, ariaLabel, layout, plot }: HomeChartDrawing) {
  return (
    <ConfidenceChart
      id={id}
      snapshot={snapshot}
      body={resolveFigureBody(liveFigureState(snapshot))}
      refs={refs}
      layout={layout}
      height={{ narrow: plot, wide: plot }}
      ariaLabel={ariaLabel}
    />
  );
}

/** The server's chart: unmeasured, the fixed plot in both layouts. */
export function HomeChartPreview(props: Omit<HomeChartDrawing, 'layout' | 'plot'>) {
  return (
    <HomeChartBox plot={FIXED_PLOT} measured={false}>
      <HomeChartDrawing {...props} plot={FIXED_PLOT} />
    </HomeChartBox>
  );
}
