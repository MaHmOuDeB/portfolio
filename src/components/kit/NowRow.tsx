// The "Now" row under the ConfidenceChart: the large interval glyph drawn on a horizontal
// difference axis (B − A, the chart's y-domain laid flat) with a zero tick, labelled with the
// current interval. While the test is collecting there is no interval: the row draws the hollow
// grey glyph, says when the estimates appear and shows the progress line, in place of empty axes.
// Once both groups have 50 views but no look has been computed, it says the first estimate is due
// instead, so it never prints a count above its target ("180 of 50").
// Server-safe; the axis is an SVG with no viewBox, positioned by percentages, so it fits any width.
import { glyphGeometry } from '@/lib/figure/glyph';
import { formatIntervalPoints } from '@/lib/figure/cs-band';
import { linearFrac, pct } from '@/lib/figure/scales';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { Derived, derivedAttr, type DerivedRef } from './Derived';
import { IntervalGlyph } from './IntervalGlyph';
import { ProgressLine } from './LiveLabels';

type Props = {
  /** The difference axis, in points: the chart's y-domain. */
  domain: [number, number];
  /** The current interval; the dot sits at `estimate`, or mid-interval without one. */
  interval?: { lower: number; upper: number; estimate?: number };
  /** Draws the collecting form instead. */
  collecting?: { nSmaller: number; plannedEnd: string };
  /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs?: readonly DerivedRef[];
};

const G = glyphGeometry('large');
const ROW_HEIGHT = 40;
const MID = 12;
const ZERO_TICK = { top: 2, bottom: 22 };
const ZERO_LABEL_BASELINE = 36;
/** A dot's ring: half of the stroke shows outside the fill, so 2 px shows. */
const RING = 4;
const LABEL_HALO = { stroke: 'var(--color-bg)', strokeWidth: '4px', paintOrder: 'stroke', strokeLinejoin: 'round' } as const;

function anchorFor(frac: number): 'start' | 'middle' | 'end' {
  return frac < 0.05 ? 'start' : frac > 0.95 ? 'end' : 'middle';
}

function Collecting({ nSmaller, plannedEnd, refs }: { nSmaller: number; plannedEnd: string; refs: readonly DerivedRef[] }) {
  const target = <Derived value={MIN_PER_GROUP} unit="count" refs={refs} />;
  if (nSmaller >= MIN_PER_GROUP) {
    return (
      <div data-now-row="due" className="mt-4">
        <IntervalGlyph size="large" variant="hollow" estimateAt={0.5} />
        <p className="mt-2 text-sm">{target} views per group are in; the first estimate appears at the next look.</p>
      </div>
    );
  }
  return (
    <div data-now-row="collecting" className="mt-4">
      <IntervalGlyph size="large" variant="hollow" estimateAt={0.5} />
      <p className="mt-2 text-sm">Estimates appear at {target} views per group, as the pre-registration says.</p>
      <div className="mt-2">
        <ProgressLine nSmaller={nSmaller} target={MIN_PER_GROUP} plannedEnd={plannedEnd} refs={refs} />
      </div>
    </div>
  );
}

export function NowRow({ domain, interval, collecting, refs = ['live'] }: Props) {
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
        now: <span {...derivedAttr(refs)}>{formatIntervalPoints(lower, upper)}</span>
      </p>
      <svg aria-hidden="true" focusable="false" width="100%" height={ROW_HEIGHT} className="mt-1 block overflow-visible">
        <line x1={0} x2="100%" y1={MID + 0.5} y2={MID + 0.5} className="stroke-line" />
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
      </svg>
    </div>
  );
}
