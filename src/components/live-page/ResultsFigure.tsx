// The Live test page's results under the confidence sequence. Server-safe.
//
// - The kit's ConfidenceChart is used only when every count it would print is 0 or at least 5
//   (`kitSafe`) and its own copy is true for the state: while the test runs, or once a pause or a
//   decision has an interval to show. It never gets the reader's own-view mark: this page assigns no
//   group.
// - Otherwise the page draws its own Figure, from the display shape only: the last interval drawn
//   (the kit's Now row, labelled "last" for a test that stopped or paused, "final" once a stop is
//   confirmed), or the difference axis with the hollow mark and a sentence that says why no estimate
//   is shown. Its table prints published cells.
// - With no data (a placeholder), a failed split check or a failed calibration, no result is shown,
//   and only a sentence says so.
import { ChartFrame } from '@/components/kit/ChartFrame';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { NowRow } from '@/components/kit/NowRow';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { intervalDigits, liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import { formatNumber, formatSignedNumber } from '@/lib/figure/format';
import { GLYPH_LENGTH, glyphGeometry } from '@/lib/figure/glyph';
import { MIN_PER_GROUP, resolveFigureBody, type FigureRuntime } from '@/lib/figure/states';
import type { HomeMode } from '@/lib/home/model';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { BUILD, provenanceOf } from './Values';

const ID = 'live-results';
const P = 'mt-2 max-w-text text-sm';
const GLYPH = glyphGeometry('large');
const AXIS_HEIGHT = { narrow: 80, wide: 120 } as const;
const CAPTION =
  'B minus A in percentage points of analysed views, under the confidence sequence, which stays valid however often it is looked at. Each look is a completed Berlin day.';

const RUNNING: readonly HomeMode[] = ['before-data', 'calibration', 'ab'];
const WITH_INTERVAL: readonly HomeMode[] = ['paused', 'ship-b', 'stop-for-harm', 'inconclusive'];

/** The snapshot the kit draws: the page's own, without a reader's view mark or a next-step line. */
function kitView(s: LiveSnapshot): LiveSnapshot {
  return {
    phase: s.phase,
    freshness: s.freshness,
    nA: s.nA,
    nB: s.nB,
    series: s.series,
    capPerArm: s.capPerArm,
    projectedHalfWidthAtCap: s.projectedHalfWidthAtCap,
    plannedEnd: s.plannedEnd,
    plannedEndKind: s.plannedEndKind,
    ...(s.decidedOn === undefined ? {} : { decidedOn: s.decidedOn }),
    ...(s.abStartedOn === undefined ? {} : { abStartedOn: s.abStartedOn }),
    ...(s.guardrail === undefined ? {} : { guardrail: s.guardrail }),
    ...(s.aaFailed === undefined ? {} : { aaFailed: s.aaFailed }),
    ...(s.ruledOutAbove === undefined ? {} : { ruledOutAbove: s.ruledOutAbove }),
  };
}

/** The drawn looks, with published counts. */
function seriesTable(d: LivePageDisplay): TableData {
  return {
    columns: ['Group A views', 'Group B views', 'Lower end', 'Estimate', 'Upper end'],
    rows: d.series.map((p) => [p.nA, p.nB, p.lower, p.estimate, p.upper]),
    formats: ['count', 'count', 'signedPoints', 'signedPoints', 'signedPoints'],
    rowDigits: d.series.map((p) => intervalDigits(p.lower, p.upper)),
    note: 'Analysed views per group, and B minus A in percentage points, one row per look drawn.',
    refs: d.refs,
  };
}

/** Why no estimate is shown, in a state with no interval drawn. */
function noEstimate(d: LivePageDisplay, closedNoDecision: boolean) {
  const target = <Derived value={MIN_PER_GROUP} unit="count" refs={BUILD} />;
  if (closedNoDecision) {
    return <p className={P}>{d.closedConfirmed ? 'Counting has closed with no estimate to show.' : 'The result is being confirmed, so no estimate is shown.'}</p>;
  }
  switch (d.mode) {
    case 'paused':
      return <p className={P}>Counting is paused, so no estimate is shown.</p>;
    case 'settings-unreadable':
      return <p className={P}>No estimate is shown while the experiment settings cannot be read.</p>;
    case 'held':
      return <p className={P}>The test stopped before an estimate could be drawn, so none is shown.</p>;
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return <p className={P}>No interval is shown with this decision.</p>;
    default: {
      const reached = typeof d.counts.smaller === 'number' && d.counts.smaller >= MIN_PER_GROUP;
      return reached ? (
        <p className={P}>Both groups have reached {target} views; no estimate is shown yet.</p>
      ) : (
        <>
          <p className={P}>
            Progress: <PublishedCountText value={d.counts.smaller} refs={d.refs} /> of {target} in the smaller group.
          </p>
          <p className={P}>Estimates appear at {target} views per group, as the pre-registration says.</p>
        </>
      );
    }
  }
}

/** The difference axis with the hollow mark on zero: no estimate, no observed mark. */
function HollowAxis({ label }: { label: string }) {
  return (
    <ChartFrame
      id={`${ID}-axis`}
      ariaLabel={label}
      height={AXIS_HEIGHT}
      x={{ domain: [0, MIN_PER_GROUP], ticks: { narrow: [], wide: [] }, format: (v) => formatNumber(v, 0), label: 'Views per group', refs: BUILD }}
      y={{
        domain: [-1, 1],
        ticks: { narrow: [0], wide: [0] },
        format: (v) => formatSignedNumber(v, 0),
        label: 'B − A (percentage points)',
        refs: BUILD,
        zeroLabel: 'no difference',
        aboveLabel: 'B higher',
        belowLabel: 'B lower',
      }}
      marks={() => null}
      overlays={(ctx) => (
        <svg data-results-glyph="" x="50%" y={ctx.yPx(0) - GLYPH.height / 2} width={1} height={GLYPH.height} overflow="visible">
          <g transform={`translate(${-GLYPH_LENGTH.large / 2} 0)`}>
            <IntervalGlyph size="large" variant="hollow" estimateAt={0.5} />
          </g>
        </svg>
      )}
    />
  );
}

export function ResultsFigure({ display: d, runtime }: { display: LivePageDisplay; runtime?: FigureRuntime }) {
  const P_BASE = 'max-w-text text-base';
  if (d.public.source === 'unavailable') return <p className={P_BASE}>No results are shown: this page has no data.</p>;
  if (d.mode === 'srm-suppressed') return <p className={P_BASE}>No result is shown while the split check has failed.</p>;
  if (d.mode === 'aa-failed') return <p className={P_BASE}>The calibration stopped, so no result is shown.</p>;

  const closedNoDecision = d.outcome === null && d.countingClosed;
  const refs: readonly DerivedRef[] = d.refs;
  const forced = runtime === undefined ? {} : { runtime };
  const kit =
    d.kitSafe && !closedNoDecision && (RUNNING.includes(d.mode) || (WITH_INTERVAL.includes(d.mode) && d.series.length > 0)) ? d.kitSnapshot : null;

  if (kit !== null) {
    const snapshot = kitView(kit);
    const state = liveFigureState(snapshot);
    return (
      <Figure
        id={ID}
        title="The interval of B minus A as views grow"
        state={{ ...state, ...forced }}
        caption={CAPTION}
        provenance={provenanceOf(refs)}
        table={seriesTable(d)}
      >
        <ConfidenceChart id={`${ID}-cs`} snapshot={snapshot} body={resolveFigureBody(state)} refs={refs} />
      </Figure>
    );
  }

  const last = d.series[d.series.length - 1];
  if (last !== undefined) {
    const stoppedEarly = d.mode === 'held' || d.mode === 'paused' || d.mode === 'settings-unreadable';
    const final = d.outcome !== null || (closedNoDecision && d.closedConfirmed);
    const label = stoppedEarly ? 'last' : final ? 'final' : 'now';
    const title =
      d.mode === 'held'
        ? 'The last interval before the test stopped'
        : d.mode === 'paused'
          ? 'The last interval before the pause'
          : d.mode === 'settings-unreadable'
            ? 'The last interval before the settings could not be read'
            : final
              ? 'The final interval'
              : closedNoDecision
                ? 'The latest interval, while the result is being confirmed'
                : 'The latest interval';
    const reach = Math.max(1, Math.abs(last.lower), Math.abs(last.upper)) * 1.15;
    return (
      <Figure id={ID} title={title} state={forced} caption={CAPTION} provenance={provenanceOf(refs)} table={seriesTable(d)}>
        <NowRow domain={[-reach, reach]} interval={{ lower: last.lower, upper: last.upper, estimate: last.estimate }} label={label} refs={refs} />
      </Figure>
    );
  }

  const running = RUNNING.includes(d.mode) && !closedNoDecision;
  const title = running ? 'No estimate yet' : 'No estimate is shown';
  return (
    <Figure
      id={ID}
      title={title}
      state={forced}
      caption="The difference between the groups, B minus A, in percentage points, with the hollow mark in place of an interval."
      provenance={provenanceOf(refs)}
      table={{ columns: ['Group', 'Analysed views'], rows: [['A', d.counts.a], ['B', d.counts.b]], formats: ['number', 'count'], refs }}
    >
      <HollowAxis label={title} />
      {noEstimate(d, closedNoDecision)}
    </Figure>
  );
}
