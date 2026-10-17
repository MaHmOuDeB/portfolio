// The kitchen-sink demo Figure, drawn from its parameters: the visitors each group needs (from
// sampleSizePerArm, Cohen's h, two-sided) against the rise to detect, for a fictional sign-up page.
// Shared: the server draws the preview and the forced-state specimens with it, and the island
// (DemoInteractive) draws the live view with the same markup. Every number is marked 'simulated'.
import { line } from 'd3-shape';
import type { ReactNode } from 'react';
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks, pct } from '@/lib/figure/scales';
import type { FigureState } from '@/lib/figure/states';
import { sampleSizePerArm } from '@/lib/stats';
import { REFS, type DemoValues } from './DemoControls';

const ALPHA = 0.05;
/** The rise the result line and the annotation name, in percentage points. */
export const RISE = 2;
const RISE_MIN = 1;
const RISE_MAX = 10;
// The curve, sampled every tenth of a point.
const CURVE_RISES = Array.from({ length: (RISE_MAX - RISE_MIN) * 10 + 1 }, (_, i) => RISE_MIN + i / 10);
const TABLE_RISES = Array.from({ length: RISE_MAX - RISE_MIN + 1 }, (_, i) => RISE_MIN + i);

const SIMULATED = derivedAttr(REFS);

type Point = { rise: number; n: number };

export type DemoModel = { values: DemoValues; curve: Point[]; n: number; top: number };

export function demoModel(values: DemoValues): DemoModel {
  const power = Number(values.power);
  const perGroup = (rise: number) =>
    sampleSizePerArm({ baseline: values.baseline, mde: rise / 100, mdeType: 'absolute', alpha: ALPHA, power });
  const curve = CURVE_RISES.map((rise) => ({ rise, n: perGroup(rise) }));
  // The smallest rise needs the most visitors; leave room above it.
  return { values, curve, n: perGroup(RISE), top: curve[0]!.n * 1.08 };
}

/** The result line and the announcement: "1,234 visitors per group to detect a rise of 2 points". */
export function resultSentence(m: DemoModel): string {
  return `${formatNumber(m.n, 0)} visitors per group to detect a rise of ${RISE} points`;
}

export function demoTable(m: DemoModel): TableData {
  return {
    columns: ['Rise to detect (percentage points)', 'Visitors per group'],
    rows: TABLE_RISES.map((rise) => [rise, m.curve.find((p) => Math.abs(p.rise - rise) < 1e-9)!.n]),
    formats: ['number', 'count'],
    refs: REFS,
  };
}

// The curve and the current point move over duration-base after a change (CSS `d` and `cy`, where
// the browser animates them) and follow the thumb without easing during a drag (globals.css).
const MOVES = 'transition-[d,cy] duration-(--duration-base) ease-(--ease-standard)';

function Curve({ ctx, curve }: { ctx: PlotContext; curve: Point[] }) {
  const d = line<Point>()
    .x((p) => ctx.xFrac(p.rise) * MARK_UNITS)
    .y((p) => ctx.yPx(p.n))(curve) ?? '';
  return (
    <path
      data-mark=""
      d={d}
      style={{ d: `path("${d}")` }}
      className={MOVES}
      fill="none"
      stroke="var(--color-series-1)"
      strokeWidth={2}
    />
  );
}

// The point the result line names: a series-2 dot with a 2 px bg ring.
function Current({ ctx, n }: { ctx: PlotContext; n: number }) {
  const cy = ctx.yPx(n);
  return (
    <circle
      data-mark=""
      cx={pct(ctx.xFrac(RISE))}
      cy={cy}
      style={{ cy: `${cy}px` }}
      className={MOVES}
      r={4}
      fill="var(--color-series-2)"
      stroke="var(--color-bg)"
      strokeWidth={4}
      paintOrder="stroke"
    />
  );
}

export function DemoChart({ id, model }: { id: string; model: DemoModel }) {
  // The axis starts at 0 though the curve starts at RISE_MIN, so the y tick labels at the left
  // edge sit clear of the curve's steep start.
  const x: [number, number] = [0, RISE_MAX];
  const riseTicks = (count: number) => niceTicks(x, count).filter((v) => v >= RISE_MIN);
  const y: [number, number] = [0, model.top];
  return (
    <ChartFrame
      id={`${id}-chart`}
      ariaLabel="The visitors each group needs fall steeply as the rise to detect grows"
      x={{
        domain: x,
        ticks: { narrow: riseTicks(5), wide: riseTicks(10) },
        format: (v) => formatNumber(v, 0),
        label: 'Rise to detect (percentage points)',
        refs: REFS,
      }}
      y={{
        domain: y,
        ticks: { narrow: niceTicks(y, 3), wide: niceTicks(y, 5) },
        format: (v) => formatNumber(v, 0),
        label: 'Visitors per group',
        refs: REFS,
      }}
      height={{ narrow: 200, wide: 260 }}
      marks={(ctx) => <Curve ctx={ctx} curve={model.curve} />}
      overlays={(ctx) => <Current ctx={ctx} n={model.n} />}
      // Right of the point and a little above it: the curve falls away below the text.
      annotation={(ctx) => ({
        x: RISE + 0.4,
        y: model.n + model.top * 0.08,
        text:
          ctx.layout === 'narrow'
            ? `${formatNumber(model.n, 0)} per group`
            : `${formatNumber(model.n, 0)} per group for a rise of ${RISE} points`,
        anchor: 'start',
        refs: REFS,
      })}
    />
  );
}

export type DemoFigureViewProps = {
  id: string;
  values: DemoValues;
  controls?: ReactNode;
  announcement?: string;
  state?: FigureState;
  titleLevel?: 2 | 3 | 4;
};

export function DemoFigureView({ id, values, controls, announcement, state, titleLevel }: DemoFigureViewProps) {
  const model = demoModel(values);
  return (
    <Figure
      id={id}
      title="Smaller rises need many more visitors."
      titleLevel={titleLevel}
      state={state}
      provenance="simulated"
      table={demoTable(model)}
      controls={controls}
      result={<span {...SIMULATED}>{resultSentence(model)}</span>}
      announcement={announcement}
      caption={
        <>
          A hypothetical sign-up page, not a real test: the visitors each group needs before a rise in its sign-up
          rate is likely to show. Sample sizes from Cohen&apos;s h for a two-sided test at a significance level of{' '}
          <span {...SIMULATED}>{ALPHA}</span>.
        </>
      }
    >
      <DemoChart id={id} model={model} />
    </Figure>
  );
}
