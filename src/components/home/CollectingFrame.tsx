// The Evidence step's collecting state, when the kit's chart may not be used: a group count prints
// as "<5", or the test stopped (held, paused or closed) before a look could be drawn. The kit's
// collecting Now row prints the exact counts in its progress line and its table, so Home draws its
// own: the difference axis with the public ChartFrame (B − A from −1 to +1 with only the 0 tick,
// views per group named but not numbered), the hollow glyph on the zero line,
// no observed mark, and a progress sentence built from the published smaller count, text only (no
// <progress>, whose value would expose the exact count). Its table masks the counts the same way.
// A stopped test is never promised a next look or an estimate. Server-safe.
import type { ReactNode } from 'react';
import { ChartFrame } from '@/components/kit/ChartFrame';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { formatNumber, formatSignedNumber } from '@/lib/figure/format';
import { GLYPH_LENGTH, glyphGeometry } from '@/lib/figure/glyph';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { berlinDate } from '@/lib/figure/time';
import type { HomeModel } from '@/lib/home/model';
import { PublishedCountText } from './PublishedCountText';

type Props = {
  counts: HomeModel['counts'];
  plannedEnd: string;
  plannedEndKind: 'fixed' | 'earliest';
  /** false while the test runs; otherwise why no estimate is shown. */
  stopped: false | 'paused' | 'stopped' | 'confirming';
  refs: readonly DerivedRef[];
  /** The Figure's id, so a page can draw the frame twice. */
  id?: string;
};

const BUILD: readonly DerivedRef[] = ['build'];
const HEIGHT = { narrow: 80, wide: 120 } as const;
const GLYPH = glyphGeometry('large');
const P = 'mt-2 max-w-text text-sm';

const Target = () => <Derived value={MIN_PER_GROUP} unit="count" refs={BUILD} />;

/** The progress sentence: running, or why no estimate is shown, never a count above its target. */
function Progress({ counts, plannedEnd, plannedEndKind, stopped, refs }: Props): ReactNode {
  const smaller = <PublishedCountText value={counts.smaller} refs={refs} />;
  const reached = typeof counts.smaller === 'number' && counts.smaller >= MIN_PER_GROUP;
  if (stopped === 'confirming') return <p className={P}>The result is being confirmed, so no estimate is shown.</p>;
  if (stopped === 'paused' || stopped === 'stopped') {
    const lead = stopped === 'paused' ? 'Counting is paused' : 'Counting stopped';
    return reached ? (
      <p className={P}>
        {lead} after both groups reached <Target /> views, and no estimate is shown.
      </p>
    ) : (
      <p className={P}>
        {lead} at {smaller} of <Target /> in the smaller group, so no estimate is shown.
      </p>
    );
  }
  if (reached) {
    // Never "60 of 50", and no promise: the step that draws this frame says what comes next.
    return (
      <p className={P}>
        Both groups have reached <Target /> views; no estimate is shown here.
      </p>
    );
  }
  return (
    <>
      <p className={P}>
        Progress: {smaller} of <Target /> in the smaller group. {plannedEndKind === 'earliest' ? 'Earliest end' : 'Planned end'}:{' '}
        <time dateTime={plannedEnd} {...derivedAttr(refs)}>
          {berlinDate(plannedEnd)}
        </time>
        .
      </p>
      <p className={P}>
        Estimates appear at <Target /> views per group, as the pre-registration says.
      </p>
    </>
  );
}

export function CollectingFrame(props: Props) {
  const { counts, stopped, refs, id = 'home-collecting' } = props;
  const label = stopped === false ? 'No estimate yet' : 'No estimate is shown';
  return (
    <div data-collecting-frame={stopped === false ? 'collecting' : stopped}>
      <Figure
        id={id}
        titleLevel={4}
        title={label}
        caption="The difference between the groups, B minus A, in percentage points, with the hollow mark in place of an interval."
        // Live only when the counts are: fixture and build data are never "Live from this site".
        provenance={refs.includes('live') ? 'live' : 'simulated'}
        table={{ columns: ['Group', 'Views'], rows: [['A', counts.a], ['B', counts.b]], formats: ['number', 'count'], refs }}
      >
        <ChartFrame
          id={`${id}-chart`}
          ariaLabel={label}
          height={HEIGHT}
          // No x ticks: the centred glyph is no position on this axis and must not read as a number of views.
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
            // The hollow glyph centred on the zero line, as the kit's Now row places it.
            <svg
              data-collecting-glyph=""
              x="50%"
              y={ctx.yPx(0) - GLYPH.height / 2}
              width={1}
              height={GLYPH.height}
              overflow="visible"
            >
              <g transform={`translate(${-GLYPH_LENGTH.large / 2} 0)`}>
                <IntervalGlyph size="large" variant="hollow" estimateAt={0.5} />
              </g>
            </svg>
          )}
        />
        <Progress {...props} />
      </Figure>
    </div>
  );
}
