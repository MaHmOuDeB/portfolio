// The frame every chart is drawn in: grid, axes, tick labels, the zero line and one annotation.
// Server-rendered SVG that fits any container width with or without JavaScript, because its text
// is never scaled: the outer <svg> has no viewBox (one unit is one CSS pixel) and x positions are
// percentages of the frame width. Only the marks sit in a stretched layer (MarkLayer), whose
// strokes keep their width. Below sm (640 px) a separate narrow layout is drawn. Server-safe, no
// hooks, so a client island can draw it too.
import type { ReactNode } from 'react';
import { linearFrac, pct, type Layout } from '@/lib/figure/scales';
import { derivedAttr, type DerivedRef } from './Derived';

export type { Layout };

/** The width of the mark layer in its own units: a mark's x is `ctx.xFrac(v) * MARK_UNITS`. */
export const MARK_UNITS = 1000;

export type AxisSpec = {
  domain: [number, number];
  /** Tick values per layout, usually from niceTicks. Values outside the domain are dropped. */
  ticks: { narrow: number[]; wide: number[] };
  /** One of the helpers in lib/figure/format, so a zero prints "0" and a minus is U+2212. */
  format: (v: number) => string;
  label: string;
  /** Where the tick numbers come from; spread on every tick label. Never empty. */
  refs: readonly DerivedRef[];
};

export type PlotContext = {
  layout: Layout;
  /** The plot height in px. */
  height: number;
  /** 0..1 across the plot: `* MARK_UNITS` inside the mark layer, `pct()` in an overlay. */
  xFrac: (v: number) => number;
  /** px from the top of the plot, the same inside the mark layer and in an overlay. */
  yPx: (v: number) => number;
};

export type Annotation = {
  /** Where the text sits, in data units of the x and y axes. It is vertically centred on y. */
  x: number;
  y: number;
  text: string;
  anchor: 'start' | 'end';
  /** Give refs when the text holds a computed number, so it carries data-derived. */
  refs?: readonly DerivedRef[];
};

export type ChartFrameProps = {
  id: string;
  /** States the finding. */
  ariaLabel: string;
  x: AxisSpec;
  y: AxisSpec & { zeroLabel?: string; aboveLabel?: string; belowLabel?: string };
  /** Plot height in px per layout. */
  height: { narrow: number; wide: number };
  /** Drawn inside MarkLayer: x in units 0..MARK_UNITS, y in px. Every mark carries data-mark. */
  marks: (ctx: PlotContext) => ReactNode;
  /** Drawn unstretched over the marks (dots keep their shape): x via pct(ctx.xFrac(v)), y in px. */
  overlays?: (ctx: PlotContext) => ReactNode;
  annotation?: (ctx: PlotContext) => Annotation;
  /** Draw one layout only, whatever the viewport (kitchen sink and tests). Omit for responsive. */
  layout?: Layout;
};

// Vertical room around the plot, in px. The y-axis label sits on the first line and the top tick
// label needs room above the top gridline; under the plot come the x ticks, then the x-axis label.
const PLOT_TOP = 40;
const AXIS_LABEL_BASELINE = 14;
const X_TICK_BASELINE = 20;
const X_LABEL_BASELINE = 40;
const BELOW_PLOT = 48;
/** Tick labels and the zero labels sit this far above (or below) their line. */
const LABEL_GAP = 4;
/** Room a side label needs between the zero line and the plot edge. */
const SIDE_LABEL_ROOM = 16;
/** Gap between the zero tick "0" and its label. */
const ZERO_LABEL_GAP = 6;

const LABEL = 'text-xs fill-muted';
// A 2 px bg halo keeps a tick label readable where a band or a line runs under it.
const TICK_HALO = { stroke: 'var(--color-bg)', strokeWidth: '4px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;
// The annotation's halo is 3 px: half of a 6 px stroke painted under the fill.
const NOTE_HALO = { stroke: 'var(--color-bg)', strokeWidth: '6px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

/** A 1 px line drawn on a pixel boundary looks sharp. */
const crisp = (y: number) => Math.round(y - 0.5) + 0.5;

function inDomain(v: number, [a, b]: [number, number]): boolean {
  return Number.isFinite(v) && v >= Math.min(a, b) && v <= Math.max(a, b);
}

function xAnchor(i: number, count: number, frac: number): 'start' | 'middle' | 'end' {
  if (count === 1) return frac === 0 ? 'start' : frac === 1 ? 'end' : 'middle';
  return i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle';
}

/** The stretched layer for marks: <svg viewBox="0 0 1000 h" preserveAspectRatio="none">. */
export function MarkLayer({ height, children }: { height: number; children: ReactNode }) {
  return (
    <svg
      data-mark-layer=""
      width="100%"
      height={height}
      viewBox={`0 0 ${MARK_UNITS} ${height}`}
      preserveAspectRatio="none"
      className="**:[vector-effect:non-scaling-stroke]"
    >
      {children}
    </svg>
  );
}

function Frame({ p, layout, responsive }: { p: ChartFrameProps; layout: Layout; responsive: boolean }) {
  const height = p.height[layout];
  const xFrac = linearFrac(p.x.domain);
  const yFrac = linearFrac(p.y.domain);
  const ctx: PlotContext = { layout, height, xFrac, yPx: (v) => (1 - yFrac(v)) * height };

  const xTick = derivedAttr(p.x.refs);
  const yTick = derivedAttr(p.y.refs);
  const hasZero = inDomain(0, p.y.domain);
  const zeroY = hasZero ? crisp(ctx.yPx(0)) : 0;
  const [yLo, yHi] = [Math.min(...p.y.domain), Math.max(...p.y.domain)];
  const yTicks = p.y.ticks[layout].filter((v) => inDomain(v, p.y.domain) && v !== 0);
  const xTicks = p.x.ticks[layout].filter((v) => inDomain(v, p.x.domain));
  const note = p.annotation?.(ctx);
  const className = responsive ? (layout === 'narrow' ? 'block sm:hidden' : 'block max-sm:hidden') : 'block';

  return (
    <svg
      data-chart-frame=""
      data-layout={layout}
      role="img"
      aria-label={p.ariaLabel}
      width="100%"
      height={PLOT_TOP + height + BELOW_PLOT}
      className={className}
    >
      <text data-axis-label="" className={LABEL} x={0} y={AXIS_LABEL_BASELINE}>
        {p.y.label}
      </text>
      <g transform={`translate(0 ${PLOT_TOP})`}>
        {yTicks.map((v, i) => (
          <line key={i} data-grid="" x1={0} x2="100%" y1={crisp(ctx.yPx(v))} y2={crisp(ctx.yPx(v))} className="stroke-line" />
        ))}
        <line data-baseline="" x1={0} x2="100%" y1={crisp(height)} y2={crisp(height)} className="stroke-line" />
        <MarkLayer height={height}>{p.marks(ctx)}</MarkLayer>
        {hasZero ? <line data-zero-line="" x1={0} x2="100%" y1={zeroY} y2={zeroY} className="stroke-ink" /> : null}
        {p.overlays?.(ctx)}

        {yTicks.map((v, i) => (
          <text key={i} data-tick="y" {...yTick} className={LABEL} {...TICK_HALO} x={0} y={crisp(ctx.yPx(v)) - LABEL_GAP}>
            {p.y.format(v)}
          </text>
        ))}
        {hasZero ? (
          <text data-tick="y" data-zero-tick="" {...yTick} className={LABEL} {...TICK_HALO} x={0} y={zeroY - LABEL_GAP}>
            <tspan>{p.y.format(0)}</tspan>
            {p.y.zeroLabel ? <tspan dx={ZERO_LABEL_GAP}>{p.y.zeroLabel}</tspan> : null}
          </text>
        ) : null}
        {hasZero && p.y.aboveLabel && yHi > 0 && zeroY >= SIDE_LABEL_ROOM ? (
          <text data-side="above" className={LABEL} x="100%" y={zeroY - LABEL_GAP} textAnchor="end">
            {p.y.aboveLabel}
          </text>
        ) : null}
        {hasZero && p.y.belowLabel && yLo < 0 && height - zeroY >= SIDE_LABEL_ROOM ? (
          <text
            data-side="below"
            className={LABEL}
            x="100%"
            y={zeroY + LABEL_GAP}
            textAnchor="end"
            dominantBaseline="hanging"
          >
            {p.y.belowLabel}
          </text>
        ) : null}

        {xTicks.map((v, i) => (
          <text
            key={i}
            data-tick="x"
            {...xTick}
            className={LABEL}
            x={pct(xFrac(v))}
            y={height + X_TICK_BASELINE}
            textAnchor={xAnchor(i, xTicks.length, xFrac(v))}
          >
            {p.x.format(v)}
          </text>
        ))}
        <text data-axis-label="" className={LABEL} x="100%" y={height + X_LABEL_BASELINE} textAnchor="end">
          {p.x.label}
        </text>

        {note ? (
          <text
            data-annotation=""
            {...(note.refs ? derivedAttr(note.refs) : {})}
            className="text-sm font-semibold fill-ink"
            {...NOTE_HALO}
            x={pct(xFrac(note.x))}
            y={ctx.yPx(note.y)}
            textAnchor={note.anchor}
            dominantBaseline="middle"
          >
            {note.text}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

export function ChartFrame(p: ChartFrameProps) {
  const layouts: Layout[] = p.layout ? [p.layout] : ['narrow', 'wide'];
  return (
    <div data-chart={p.id} className="w-full">
      {layouts.map((layout) => (
        <Frame key={layout} p={p} layout={layout} responsive={!p.layout} />
      ))}
    </div>
  );
}
