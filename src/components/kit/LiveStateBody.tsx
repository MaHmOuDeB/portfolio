// The body of a live Figure in each state of the state matrix (src/lib/figure/states.ts): the state
// message and the parts the state allows. Server-safe, no hooks. Every number carries
// data-derived with the caller's refs.
//
// - low-data: "A/B started dd.mm." first in the A/B phase, "Calibrating: …" in calibration; no
//   chart, only the collecting Now row.
// - calibration and ab: the chart and the Now row, with "SRM passed" in ok; ab adds the guardrail.
// - ship-b, stop-for-harm, inconclusive: the sentence, the chart and the Now row. A sentence that
//   says a bound is above or below zero never prints that bound as "0". Without an interval to
//   show, an ended test never reads as running (no collecting row, no planned end): inconclusive
//   says it ended (and, under 50 views per group, why no interval shows); ship-b and stop-for-harm
//   (which the rules never reach without one) say the interval is not available.
// - srm-suppressed: "SRM failed" in warn, the sentence and the counts, never an interval.
// - aa-failed: its sentence.
// - paused: "Paused on dd.mm: reason." above whatever the frozen data calls for (the last chart, the
//   collecting row, or the counts if the split check failed).
// The error runtime and the static default never reach a live body; they draw what the data calls for.
import type { ReactNode } from 'react';
import {
  ceilAt,
  contentBody,
  confidenceModel,
  formatIntervalPoints,
  intervalDigits,
  MAX_POINTS,
  safeCount,
  smallerGroup,
  type LiveSnapshot,
} from '@/lib/figure/cs-band';
import { formatNumber, formatSignedNumber } from '@/lib/figure/format';
import { MIN_PER_GROUP, type FigureBody } from '@/lib/figure/states';
import { berlinDate } from '@/lib/figure/time';
import { ConfidenceChart } from './ConfidenceChart';
import { Derived, derivedAttr, type DerivedRef } from './Derived';

type Props = {
  snapshot: LiveSnapshot;
  body: FigureBody;
  /** The Figure's id, for the chart. */
  id?: string;
  refs?: readonly DerivedRef[];
};

/** The quick-exit guardrail's window, from the pre-registration. */
const GUARDRAIL_SECONDS = 5;

const P = 'max-w-text text-base';

function Num({ refs, children }: { refs: readonly DerivedRef[]; children: ReactNode }) {
  return <span {...derivedAttr(refs)}>{children}</span>;
}

function When({ iso, refs }: { iso: string; refs: readonly DerivedRef[] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso)}
    </time>
  );
}

/** `signed`: the sentence claims a bound's sign, so no bound that is not zero may print "0". */
function Interval({ lower, upper, refs, signed }: { lower: number; upper: number; refs: readonly DerivedRef[]; signed?: boolean }) {
  return <Num refs={refs}>{formatIntervalPoints(lower, upper, { awayFromZero: signed })}</Num>;
}


const finite = (...vs: number[]) => vs.every(Number.isFinite);
const clamp = (v: number) => Math.min(MAX_POINTS, Math.max(-MAX_POINTS, v));

function Guardrail({ snapshot, refs }: { snapshot: LiveSnapshot; refs: readonly DerivedRef[] }) {
  const g = snapshot.guardrail;
  if (!g || !finite(g.lower, g.upper, g.limit)) return null;
  const [lower, upper] = [clamp(Math.min(g.lower, g.upper)), clamp(Math.max(g.lower, g.upper))];
  return (
    <p className={`mt-4 ${P}`}>
      Leaving within <Num refs={refs}>{GUARDRAIL_SECONDS}</Num> seconds, B − A: <Interval lower={lower} upper={upper} refs={refs} />{' '}
      points; limit <Num refs={refs}>{formatSignedNumber(g.limit, 1)}</Num>.
    </p>
  );
}

function Status({ tone, children }: { tone: 'ok' | 'warn'; children: string }) {
  return <span className={`font-semibold ${tone === 'ok' ? 'text-ok' : 'text-warn'}`}>{children}</span>;
}

/** The lead of a verdict, in semibold: the sentence after it is regular weight. */
function Lead({ children }: { children: string }) {
  return <span className="font-semibold">{children}</span>;
}

function NextStep({ snapshot }: { snapshot: LiveSnapshot }) {
  return snapshot.nextStep ? <> What I&apos;ll do now: {snapshot.nextStep}.</> : null;
}

function Outcome({ body, snapshot, refs }: { body: 'ship-b' | 'stop-for-harm' | 'inconclusive'; snapshot: LiveSnapshot; refs: readonly DerivedRef[] }) {
  const m = confidenceModel(snapshot);
  if (m === null) {
    // No interval may be shown, and the test has ended: no collecting row, no planned end, no
    // promise of a next look. Inconclusive can end this way (the cap came first, or its looks are
    // missing); ship-b and stop-for-harm need an interval, so without one no verdict is claimed.
    if (body !== 'inconclusive') return <p className={P}>The interval for this look is not available.</p>;
    if (smallerGroup(snapshot) >= MIN_PER_GROUP) {
      return (
        <p className={P}>
          Inconclusive at the six-month limit.
          <NextStep snapshot={snapshot} />
        </p>
      );
    }
    return (
      <p className={P}>
        Inconclusive at the six-month limit: fewer than <Derived value={MIN_PER_GROUP} unit="count" refs={refs} /> views
        per group arrived, so no interval is shown.
        <NextStep snapshot={snapshot} />
      </p>
    );
  }
  const { lower, upper } = m.current;
  const interval = <Interval lower={lower} upper={upper} refs={refs} signed={body !== 'inconclusive'} />;
  if (body === 'ship-b') {
    return (
      <p className={P}>
        <Lead>Ship B.</Lead> The lower end of the interval is above zero ({interval} points), the quick-exit guardrail is
        within its limit, and the split check passed.
      </p>
    );
  }
  if (body === 'stop-for-harm') {
    return (
      <p className={P}>
        <Lead>Stopped: B did worse.</Lead> The upper end of the interval is below zero ({interval} points).
      </p>
    );
  }
  // The interval rules out effects beyond its larger end; a caller's figure may only be larger.
  const reach = Math.max(Math.abs(lower), Math.abs(upper));
  const given = snapshot.ruledOutAbove;
  const digits = intervalDigits(lower, upper);
  const ruledOut = ceilAt(given !== undefined && Number.isFinite(given) ? Math.max(clamp(given), reach) : reach, digits);
  return (
    <p className={P}>
      <Lead>Inconclusive at the six-month limit:</Lead> the difference runs from {interval} points, so an effect larger than{' '}
      <Num refs={refs}>{formatNumber(ruledOut, digits)}</Num> points is ruled out.
      <NextStep snapshot={snapshot} />
    </p>
  );
}

export function LiveStateBody({ snapshot, body, id = 'live', refs = ['live'] }: Props) {
  const own = body === 'paused' || body === 'error' || body === 'default' ? contentBody(snapshot) : body;
  const chart = <ConfidenceChart id={id} snapshot={snapshot} body={body} refs={refs} />;
  const f = snapshot.freshness;
  const paused =
    body === 'paused' && f.kind === 'paused' ? (
      <p className={`mb-4 ${P}`}>
        <Status tone="warn">Paused</Status> on <When iso={f.pausedOn} refs={refs} />: {f.reason}.
      </p>
    ) : null;

  let content: ReactNode;
  switch (own) {
    case 'low-data':
      content = (
        <>
          {snapshot.phase === 'ab' && snapshot.abStartedOn ? (
            <p className={P}>
              A/B started <When iso={snapshot.abStartedOn} refs={refs} />.
            </p>
          ) : null}
          {snapshot.phase === 'calibration' ? <p className={P}>Calibrating: both groups see the same page.</p> : null}
          {chart}
        </>
      );
      break;
    case 'calibration':
    case 'ab':
      content = (
        <>
          {own === 'calibration' ? <p className={P}>Calibrating: both groups see the same page.</p> : null}
          <p className={`${own === 'calibration' ? 'mt-2 ' : ''}text-sm`}>
            <Status tone="ok">SRM passed</Status>
          </p>
          <div className="mt-4">{chart}</div>
          {own === 'ab' ? <Guardrail snapshot={snapshot} refs={refs} /> : null}
        </>
      );
      break;
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      content = (
        <>
          <Outcome body={own} snapshot={snapshot} refs={refs} />
          <div className="mt-4">{chart}</div>
          {confidenceModel(snapshot) ? <Guardrail snapshot={snapshot} refs={refs} /> : null}
        </>
      );
      break;
    case 'srm-suppressed':
      content = (
        <>
          <p className={P}>
            <Status tone="warn">SRM failed</Status>. The split check failed, so no verdict is shown.
          </p>
          <p className={`mt-2 ${P}`}>
            Views so far: <Derived value={safeCount(snapshot.nA)} unit="count" refs={refs} /> in A,{' '}
            <Derived value={safeCount(snapshot.nB)} unit="count" refs={refs} /> in B, where the design expects an even
            split.
          </p>
        </>
      );
      break;
    case 'aa-failed': {
      const a = snapshot.aaFailed;
      content = a ? (
        <>
          <p className={P}>
            Calibration stopped on <When iso={a.on} refs={refs} />: {a.reason}. Calibration restarts on{' '}
            <When iso={a.restartsOn} refs={refs} />.
          </p>
          <p className={`mt-2 ${P}`}>
            Views when it stopped: <Derived value={safeCount(snapshot.nA)} unit="count" refs={refs} /> in A,{' '}
            <Derived value={safeCount(snapshot.nB)} unit="count" refs={refs} /> in B.
          </p>
        </>
      ) : (
        <p className={P}>Calibration stopped.</p>
      );
      break;
    }
    default:
      content = chart;
  }

  return (
    <div data-live-body={own}>
      {paused}
      {content}
    </div>
  );
}
