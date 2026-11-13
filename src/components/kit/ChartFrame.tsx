// The frame every chart is drawn in: grid, axes, tick labels, the zero line and one annotation.
// Server-rendered SVG that fits any container width with or without JavaScript, because its text
// is never scaled: the outer <svg> has no viewBox (one unit is one CSS pixel) and x positions are
// percentages of the plot width. Only the marks sit in a stretched layer (MarkLayer), whose
// strokes keep their width. Below sm (640 px) a separate narrow layout is drawn. Server-safe, no
// hooks, so a client island can draw it too.
//
// Labels never sit on marks. The y tick numbers are in a left gutter, right-aligned and centred on
// their gridline; the words of the zero line ("no difference", "B higher", "B lower") are in a right
// margin, stacked on the zero line one text-xs line apart (the token's line height, in em, so the
// stack scales with its text) and all on the middle baseline: every engine then draws each word's box
// at the same offset from its line, and the line height's leading stays clear between two boxes at any
// zoom. The margins' widths count each character as an upper bound of its advance in the site font
// (lib/figure/label-width), so a label never runs past its margin. Both margins are padding of the <svg> (a replaced element's
// viewport is its content box), so the plot's percentages still run from 0 to 100% of the plot. The
// y scale is snapped to half pixels, so a horizontal 1 px line is never blurred over two rows.
//
// The annotation is guarded against the plot's width. Text is not measured on the server and the chart
// is as wide as its column, so the frame states, per layout, the narrowest column its annotation fits
// in (its estimated width against the room on its side of the anchor, plus the margins) and a container
// query hides it below that. The finding is still in the chart's accessible name, the Figure's title and
// its result line; a hidden annotation never lands on a tick, a margin word or a mark, or outside the frame.
//
// An x tick label is centred on its tick; only a tick on an end of the domain is anchored at its
// start or end. The outermost labels are guarded the same way as the annotation: below the column
// width where a centred label would come within a small gap of the frame's edge, a container query
// anchors it at its tick, on the side away from that edge, so it stays inside the plot and its margin.
import type { ReactNode } from 'react';
import { labelWidth } from '@/lib/figure/label-width';
import { linearFrac, pct, type Layout } from '@/lib/figure/scales';
import { derivedAttr, type DerivedRef } from './Derived';

export type { Layout };

/** The width of the mark layer in its own units: a mark's x is `ctx.xFrac(v) * MARK_UNITS`. */
export const MARK_UNITS = 1000;

export type AxisSpec = {
  domain: [number, number];
  /** Tick values per layout, usually from niceTicks. Values outside the domain are dropped. */
  ticks: { narrow: number[]; wide: number[] };
  /**
   * One of the helpers in lib/figure/format, so a zero is never signed ("0", or "0.0", "0.00" and
   * so on at the axis's fixed decimals) and a minus is U+2212. It needs enough digits for the tick
   * step: a repeated label, or a non-zero tick printed like zero, throws.
   */
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
  /** States the finding in words, without a digit (it throws otherwise). */
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
  /**
   * Draw one layout only, whatever the viewport. A public prop, used in production: a Figure with its
   * own narrow-width breakpoint (not sm) draws each layout itself and switches between them; the
   * kitchen sink and tests use it too. Omit for the frame's own responsive switch at sm.
   */
  layout?: Layout;
};

// The type of the chart text, from src/styles/tokens.css: labels are text-xs (13 px, line height 1.5),
// the annotation text-sm (15 px) semibold.
const XS_PX = 13;
const XS_LINE_EM = 1.5;
const SM_PX = 15;
// Horizontal room for the labels: the left gutter holds the widest y tick label, the right margin the
// widest zero-line word, each measured by labelWidth (an upper bound in the site font); a label is
// never clipped, because a wider one only widens its margin.
const MARGIN_GAP = 8;
/** The gap kept clear between the annotation and the plot's edge. */
const NOTE_EDGE_GAP = 8;
/** Kept clear between a centred outermost x tick label and the frame's edge. */
const TICK_EDGE_GAP = 4;

// Vertical room around the plot, in px. The y-axis label sits on the first line and the top tick
// label needs room above the top gridline; under the plot come the x ticks, then the x-axis label.
const PLOT_TOP = 40;
const AXIS_LABEL_BASELINE = 14;
const X_TICK_BASELINE = 20;
const X_LABEL_BASELINE = 40;
const BELOW_PLOT = 48;

const LABEL = 'text-xs fill-muted';
// The annotation's halo is 3 px: half of a 6 px stroke painted under the fill.
const NOTE_HALO = { stroke: 'var(--color-bg)', strokeWidth: '6px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

/** An id as it sits inside a double-quoted CSS attribute selector. */
const cssString = (v: string) => v.replace(/["\\\n]/g, '\\$&');

/** A 1 px line drawn on a pixel boundary looks sharp. */
const crisp = (y: number) => Math.round(y - 0.5) + 0.5;

/**
 * The narrowest container, in px, whose plot holds the annotation: its estimated width plus the edge
 * gap must fit in the share of the plot on its side of the anchor (the text grows left from an "end"
 * anchor and right from a "start" one). Infinity when the anchor leaves no room at all.
 */
function annotationMinWidth(note: Pick<Annotation, 'text' | 'anchor'>, frac: number, left: number, right: number): number {
  const room = note.anchor === 'end' ? frac : 1 - frac;
  if (!(room > 0)) return Number.POSITIVE_INFINITY;
  return left + right + Math.ceil((labelWidth(note.text, SM_PX) + NOTE_EDGE_GAP) / room);
}

/** The words of the zero line, top to bottom; the narrow layout puts "no difference" on two lines to keep the plot wide. */
function zeroWords(zero: string | undefined, layout: Layout): string[] {
  if (!zero) return [];
  const space = zero.indexOf(' ');
  return layout === 'narrow' && space > 0 ? [`${zero.slice(0, space)} `, zero.slice(space + 1)] : [zero];
}

function inDomain(v: number, [a, b]: [number, number]): boolean {
  return Number.isFinite(v) && v >= Math.min(a, b) && v <= Math.max(a, b);
}

/**
 * The printed tick labels, refused when the format is too coarse for the step: a non-zero tick that
 * prints like zero would claim a value it does not have, and a repeated label makes the axis lie.
 * Pick the digits from the tick step. Throws like the format helpers do on NaN.
 */
function tickLabels(axis: 'x' | 'y', ticks: readonly number[], format: (v: number) => string, withZero: boolean): string[] {
  const zero = format(0);
  const labels = ticks.map(format);
  const seen = new Set<string>(withZero ? [zero] : []);
  ticks.forEach((v, i) => {
    const label = labels[i]!;
    if (v !== 0 && label === zero) {
      throw new TypeError(`the ${axis} tick ${String(v)} prints like zero ("${label}"); give the format more digits`);
    }
    if (seen.has(label)) throw new TypeError(`the ${axis} tick label "${label}" appears twice; give the format more digits`);
    seen.add(label);
  });
  return labels;
}

/** Centred on its tick, except a tick on an end of the domain, which starts or ends there. */
function xAnchor(frac: number): 'start' | 'middle' | 'end' {
  return frac <= 0 ? 'start' : frac >= 1 ? 'end' : 'middle';
}

/**
 * The narrowest container, in px, in which a label centred on a tick stays inside the frame: its
 * estimated half width and the edge gap, past the margin on its side, must fit in the share of the
 * plot on that side of the tick. 0 when it always fits.
 */
function tickEdgeMinWidth(label: string, room: number, margin: number, left: number, right: number): number {
  const over = labelWidth(label, XS_PX) / 2 + TICK_EDGE_GAP - margin;
  return over > 0 ? left + right + Math.ceil(over / room) : 0;
}

type TickEdge = { index: number; edge: 'first' | 'last'; min: number };

/** The outermost centred x tick labels that a narrow column would push past the frame's edge. */
function tickEdges(fracs: readonly number[], labels: readonly string[], left: number, right: number): TickEdge[] {
  const last = fracs.length - 1;
  if (last < 0) return [];
  const guard = (index: number, edge: TickEdge['edge']): TickEdge | null => {
    const frac = fracs[index]!;
    if (xAnchor(frac) !== 'middle') return null;
    const min = edge === 'first' ? tickEdgeMinWidth(labels[index]!, frac, left, left, right) : tickEdgeMinWidth(labels[index]!, 1 - frac, right, left, right);
    return min > 0 ? { index, edge, min } : null;
  };
  const first = guard(0, 'first');
  const end = guard(last, 'last');
  // One tick is both: the side that needs the wider column decides.
  if (last === 0) return first && (!end || first.min >= end.min) ? [first] : end ? [end] : [];
  return [first, end].filter((e): e is TickEdge => e !== null);
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
  // Whole pixels: every y is the middle of a pixel row, so a 1 px horizontal stroke stays sharp.
  const ctx: PlotContext = { layout, height, xFrac, yPx: (v) => crisp((1 - yFrac(v)) * height) };

  const xTick = derivedAttr(p.x.refs);
  const yTick = derivedAttr(p.y.refs);
  const hasZero = inDomain(0, p.y.domain);
  const zeroY = hasZero ? crisp(ctx.yPx(0)) : 0;
  const [yLo, yHi] = [Math.min(...p.y.domain), Math.max(...p.y.domain)];
  const yTicks = p.y.ticks[layout].filter((v) => inDomain(v, p.y.domain) && v !== 0);
  const xTicks = p.x.ticks[layout].filter((v) => inDomain(v, p.x.domain));
  const yLabels = tickLabels('y', yTicks, p.y.format, hasZero);
  const xLabels = tickLabels('x', xTicks, p.x.format, false);
  const note = p.annotation?.(ctx);
  const above = hasZero && p.y.aboveLabel && yHi > 0 ? p.y.aboveLabel : undefined;
  const below = hasZero && p.y.belowLabel && yLo < 0 ? p.y.belowLabel : undefined;
  const words = zeroWords(hasZero ? p.y.zeroLabel : undefined, layout);
  const rightWords = [above, below, ...words].filter((w): w is string => !!w);
  const left = Math.ceil(Math.max(...[...yLabels, hasZero ? p.y.format(0) : ''].map((l) => labelWidth(l, XS_PX)))) + MARGIN_GAP;
  const right = rightWords.length ? Math.ceil(Math.max(...rightWords.map((w) => labelWidth(w.trim(), XS_PX)))) + MARGIN_GAP : 0;
  // The stack, one line apart and centred on the zero line: the zero label's first line starts half
  // its block above the line, and the side words sit one line beyond the block.
  const zeroTop = -((words.length - 1) / 2) * XS_LINE_EM;
  const sideDy = ((Math.max(words.length, 1) + 1) / 2) * XS_LINE_EM;
  const className = responsive ? (layout === 'narrow' ? 'block sm:hidden' : 'block max-sm:hidden') : 'block';
  const noteMin = note ? annotationMinWidth(note, xFrac(note.x), left, right) : 0;
  // Below that width the annotation is hidden (display: none), per chart and layout.
  const hideNote = Number.isFinite(noteMin)
    ? `@container (width < ${noteMin}px){[data-chart="${cssString(p.id)}"] svg[data-layout="${layout}"] [data-annotation]{display:none}}`
    : `[data-chart="${cssString(p.id)}"] svg[data-layout="${layout}"] [data-annotation]{display:none}`;
  // Below its width an outermost centred x tick label is anchored at its tick, away from the edge.
  const xFracs = xTicks.map((v) => xFrac(v));
  const edges = tickEdges(xFracs, xLabels, left, right);
  const edgeAt = new Map(edges.map((e) => [e.index, e.edge]));
  const edgeRules = edges
    .map(
      (e) =>
        `@container (width < ${e.min}px){[data-chart="${cssString(p.id)}"] svg[data-layout="${layout}"] [data-tick-edge="${e.edge}"]{text-anchor:${e.edge === 'first' ? 'start' : 'end'}}}`,
    )
    .join('');

  return (
    <>
      {/* Before the frame, so the frame stays the last element of its layout. */}
      {edgeRules ? <style>{edgeRules}</style> : null}
      <svg
        data-chart-frame=""
        data-layout={layout}
        role="img"
        aria-label={p.ariaLabel}
        width="100%"
        height={PLOT_TOP + height + BELOW_PLOT}
        className={`${className} overflow-visible`}
        style={{ paddingLeft: left, paddingRight: right }}
      >
        <text data-axis-label="" className={LABEL} x={-left} y={AXIS_LABEL_BASELINE}>
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
            <text
              key={i}
              data-tick="y"
              data-num=""
              {...yTick}
              className={LABEL}
              x={0}
              dx={-MARGIN_GAP}
              y={crisp(ctx.yPx(v))}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {yLabels[i]}
            </text>
          ))}
          {hasZero ? (
            <text
              data-tick="y"
              data-zero-tick=""
              data-num=""
              {...yTick}
              className={LABEL}
              x={0}
              dx={-MARGIN_GAP}
              y={zeroY}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {/* WebKit does not inherit dominant-baseline into a tspan, so each one sets it itself. */}
              <tspan dominantBaseline="middle">{p.y.format(0)}</tspan>
            </text>
          ) : null}
          {words.length > 0 ? (
            <text data-zero-label="" className={LABEL} x="100%" dx={MARGIN_GAP} y={zeroY} dominantBaseline="middle">
              {words.map((w, i) => (
                <tspan key={i} x="100%" dx={MARGIN_GAP} dy={`${i === 0 ? zeroTop : XS_LINE_EM}em`} dominantBaseline="middle">
                  {w}
                </tspan>
              ))}
            </text>
          ) : null}
          {above ? (
            <text data-side="above" className={LABEL} x="100%" dx={MARGIN_GAP} y={zeroY} dy={`${-sideDy}em`} dominantBaseline="middle">
              {above}
            </text>
          ) : null}
          {below ? (
            <text data-side="below" className={LABEL} x="100%" dx={MARGIN_GAP} y={zeroY} dy={`${sideDy}em`} dominantBaseline="middle">
              {below}
            </text>
          ) : null}
          {xTicks.map((v, i) => (
            <text
              key={i}
              data-tick="x"
              data-num=""
              {...xTick}
              className={LABEL}
              x={pct(xFracs[i]!)}
              y={height + X_TICK_BASELINE}
              textAnchor={xAnchor(xFracs[i]!)}
              data-tick-edge={edgeAt.get(i)}
            >
              {xLabels[i]}
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
      {note && noteMin > 0 ? <style>{hideNote}</style> : null}
    </>
  );
}

export function ChartFrame(p: ChartFrameProps) {
  // The accessible name states the finding in words; its numbers live in the table and the readout,
  // where they carry data-derived. A digit here would escape the truth audit's markers.
  if (/\d/.test(p.ariaLabel)) {
    throw new TypeError(`a chart's ariaLabel states the finding in words and holds no digit: "${p.ariaLabel}"`);
  }
  const layouts: Layout[] = p.layout ? [p.layout] : ['narrow', 'wide'];
  return (
    <div data-chart={p.id} className="w-full" style={{ containerType: 'inline-size' }}>
      {layouts.map((layout) => (
        <Frame key={layout} p={p} layout={layout} responsive={!p.layout} />
      ))}
    </div>
  );
}
