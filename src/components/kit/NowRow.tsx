// The "Now" row under the ConfidenceChart: the large interval glyph drawn on a horizontal
// difference axis (B − A, the chart's y-domain laid flat) with a zero tick, labelled with the
// current interval. While the test is collecting there is no interval: the row draws the same axis
// with its zero tick and "B lower" and "B higher" at the ends, the hollow glyph (bar and dot in muted)
// at zero, says when the estimates appear and shows the progress line, in place of empty axes.
// It never prints a count above its target ("180 of 50"): once both groups have 50 views and no
// look has been computed, a running test (`due`) says the first estimate is due; otherwise only the
// rule is stated.
// Server-safe; the axis is an SVG with no viewBox, positioned by percentages, so it fits any width.
import { GLYPH_LENGTH, glyphGeometry } from '@/lib/figure/glyph';
import { formatIntervalPoints } from '@/lib/figure/cs-band';
import { linearFrac, pct } from '@/lib/figure/scales';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { Derived, derivedAttr, type DerivedRef } from './Derived';
import { ProgressLine } from './LiveLabels';

type Props = {
  /** The difference axis, in points: the chart's y-domain. */
  domain: [number, number];
  /** The current interval; the dot sits at `estimate`, or mid-interval without one. */
  interval?: { lower: number; upper: number; estimate?: number };
  /** Draws the collecting form instead. `due`: the test is running, so a next look will come. */
  collecting?: { nSmaller: number; plannedEnd: string; due?: boolean };
  /**
   * What the interval is: "now" while the test runs, "final" once it is decided (the interval does not
   * move any more), "last" while it is paused (frozen at the last look).
   */
  label?: 'now' | 'final' | 'last';
  /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs?: readonly DerivedRef[];
};

const G = glyphGeometry('large');
const ROW_HEIGHT = 40;
const MID = 12;
// The zero tick reaches past the dot and its 2 px ring (the dot's reach is 8.4 px each way of MID),
// and is painted after the dot, so the dot never hides it.
const ZERO_TICK = { top: 0, bottom: 24 };
const ZERO_LABEL_BASELINE = 36;
/** A dot's ring: half of the stroke shows outside the fill, so 2 px shows. */
const RING = 4;
const LABEL_HALO = { stroke: 'var(--color-bg)', strokeWidth: '4px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

function anchorFor(frac: number): 'start' | 'middle' | 'end' {
  return frac < 0.05 ? 'start' : frac > 0.95 ? 'end' : 'middle';
}

/**
 * The collecting axis: the difference axis laid flat, the zero tick labelled "0", "B lower" and
 * "B higher" at its ends, and the hollow glyph on the zero tick. The glyph is the same 96 px mark as
 * the filled one, drawn in muted (a bar in line would be 1.2:1 against the page).
 */
function CollectingAxis({ refs }: { refs: readonly DerivedRef[] }) {
  const capY = MID - G.capHeight / 2;
  const half = GLYPH_LENGTH.large / 2;
  const muted = 'var(--color-muted)';
  return (
    <svg aria-hidden="true" focusable="false" width="100%" height={ROW_HEIGHT} className="mt-1 block overflow-visible">
      <line x1={0} x2="100%" y1={MID + 0.5} y2={MID + 0.5} className="stroke-line" />
      <svg data-now-glyph="hollow" x="50%" y={0} width={1} height={ROW_HEIGHT} overflow="visible">
        <g transform={`translate(${-half} 0)`}>
          <rect x={0} y={capY} width={G.capWidth} height={G.capHeight} fill={muted} />
          <rect x={GLYPH_LENGTH.large - G.capWidth} y={capY} width={G.capWidth} height={G.capHeight} fill={muted} />
          <rect x={0} y={MID - G.bar / 2} width={GLYPH_LENGTH.large} height={G.bar} fill={muted} />
          <circle cx={half} cy={MID} r={G.dot / 2} fill="var(--color-bg)" stroke={muted} strokeWidth={G.bar} />
        </g>
      </svg>
      <line data-now-zero="" x1="50%" x2="50%" y1={ZERO_TICK.top} y2={ZERO_TICK.bottom} className="stroke-ink" />
      <text {...derivedAttr(refs)} x="50%" y={ZERO_LABEL_BASELINE} textAnchor="middle" className="text-xs fill-muted">
        0
      </text>
      <text x={0} y={ZERO_LABEL_BASELINE} textAnchor="start" className="text-xs fill-muted">
        B lower
      </text>
      <text x="100%" y={ZERO_LABEL_BASELINE} textAnchor="end" className="text-xs fill-muted">
        B higher
      </text>
    </svg>
  );
}

function Collecting({
  nSmaller,
  plannedEnd,
  due,
  refs,
}: {
  nSmaller: number;
  plannedEnd: string;
  due?: boolean;
  refs: readonly DerivedRef[];
}) {
  const target = <Derived value={MIN_PER_GROUP} unit="count" refs={refs} />;
  const rule = <p className="mt-2 text-sm">Estimates appear at {target} views per group, as the pre-registration says.</p>;
  if (nSmaller >= MIN_PER_GROUP && !due) {
    return (
      <div data-now-row="collecting" className="mt-4">
        <CollectingAxis refs={refs} />
        {rule}
      </div>
    );
  }
  if (nSmaller >= MIN_PER_GROUP) {
    return (
      <div data-now-row="due" className="mt-4">
        <CollectingAxis refs={refs} />
        <p className="mt-2 text-sm">{target} views per group are in; the first estimate appears at the next look.</p>
      </div>
    );
  }
  return (
    <div data-now-row="collecting" className="mt-4">
      <CollectingAxis refs={refs} />
      {rule}
      <div className="mt-2">
        <ProgressLine nSmaller={nSmaller} target={MIN_PER_GROUP} plannedEnd={plannedEnd} refs={refs} />
      </div>
    </div>
  );
}

export function NowRow({ domain, interval, collecting, label = 'now', refs = ['live'] }: Props) {
  if (collecting) return <Collecting {...collecting} refs={refs} />;
  if (!interval) return null;
  const lower = Math.min(interval.lower, interval.upper);
  const upper = Math.max(interval.lower, interval.upper);
  const estimate = interval.estimate ?? (lower + upper) / 2;
  const frac = linearFrac(domain);
  const [lo, hi] = [frac(lower), frac(upper)];
  const zero = Math.min(...domain) <= 0 && Math.max(...domain) >= 0 ? frac(0) : undefined;
  const capY = MID - G.capHeight / 2;
  return (
    <div data-now-row="interval" className="mt-4">
      <p className="text-sm font-semibold">
        {label}: <span {...derivedAttr(refs)}>{formatIntervalPoints(lower, upper)}</span>
      </p>
      <svg aria-hidden="true" focusable="false" width="100%" height={ROW_HEIGHT} className="mt-1 block overflow-visible">
        <line x1={0} x2="100%" y1={MID + 0.5} y2={MID + 0.5} className="stroke-line" />
        <rect data-now-bar="" x={pct(lo)} y={MID - G.bar / 2} width={pct(hi - lo)} height={G.bar} fill="var(--color-series-1)" />
        {[lo, hi].map((at, i) => (
          <line
            key={i}
            x1={pct(at)}
            x2={pct(at)}
            y1={capY}
            y2={capY + G.capHeight}
            stroke="var(--color-series-1)"
            strokeWidth={G.capWidth}
          />
        ))}
        <circle
          cx={pct(frac(estimate))}
          cy={MID}
          r={G.dot / 2}
          fill="var(--color-series-2)"
          stroke="var(--color-bg)"
          strokeWidth={RING}
          paintOrder="stroke"
        />
        {zero !== undefined ? (
          <>
            <line data-now-zero="" x1={pct(zero)} x2={pct(zero)} y1={ZERO_TICK.top} y2={ZERO_TICK.bottom} className="stroke-ink" />
            <text
              {...derivedAttr(refs)}
              x={pct(zero)}
              y={ZERO_LABEL_BASELINE}
              textAnchor={anchorFor(zero)}
              className="text-xs fill-muted"
              {...LABEL_HALO}
            >
              0
            </text>
          </>
        ) : null}
      </svg>
    </div>
  );
}
