// The body of a live Figure in each state of states.md: the state message (the copy deck's "State
// messages", verbatim) and the parts the state allows. Server-safe, no hooks. Every number carries
// data-derived with the caller's refs.
//
// - low-data: "A/B started dd.mm." first in the A/B phase, "Calibrating: …" in calibration; no
//   chart, only the collecting Now row.
// - calibration and ab: the chart and the Now row, with "SRM passed" in ok; ab adds the guardrail.
// - ship-b, stop-for-harm, inconclusive: the sentence, the chart and the Now row. Without 50 views
//   per group there is no interval to judge, so no verdict is shown and the row keeps collecting.
// - srm-suppressed: "SRM failed" in warn, the sentence and the counts, never an interval.
// - aa-failed: its sentence.
// - paused: "Paused on dd.mm: reason." above whatever the frozen data calls for (the last chart, the
//   collecting row, or the counts if the split check failed).
// The error runtime and the static default never reach a live body; they draw what the data calls for.
import type { ReactNode } from 'react';
import {
  contentBody,
  confidenceModel,
  intervalDigits,
  MAX_POINTS,
  safeCount,
  type LiveSnapshot,
} from '@/lib/figure/cs-band';
import { formatInterval, formatNumber, formatSignedNumber } from '@/lib/figure/format';
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

function Interval({ lower, upper, refs }: { lower: number; upper: number; refs: readonly DerivedRef[] }) {
  return <Num refs={refs}>{formatInterval(lower, upper, intervalDigits(lower, upper))}</Num>;
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

function Outcome({ body, snapshot, refs }: { body: 'ship-b' | 'stop-for-harm' | 'inconclusive'; snapshot: LiveSnapshot; refs: readonly DerivedRef[] }) {
  const m = confidenceModel(snapshot);
  if (m === null) return <p className={P}>The rules need <Derived value={MIN_PER_GROUP} unit="count" refs={refs} /> views per group, so no verdict is shown.</p>;
  const { lower, upper } = m.current;
  const interval = <Interval lower={lower} upper={upper} refs={refs} />;
  if (body === 'ship-b') {
    return (
      <p className={P}>
        Ship B. The lower end of the interval is above zero ({interval} points), the quick-exit guardrail is within its
        limit, and the split check passed.
      </p>
    );
  }
  if (body === 'stop-for-harm') {
    return (
      <p className={P}>
        Stopped: B did worse. The upper end of the interval is below zero ({interval} points).
      </p>
    );
  }
  const given = snapshot.ruledOutAbove;
  const ruledOut = given !== undefined && Number.isFinite(given) && given >= 0 ? clamp(given) : Math.max(Math.abs(lower), Math.abs(upper));
  return (
    <p className={P}>
      Inconclusive at the six-month limit: the difference runs from {interval} points, so an effect larger than <Num refs={refs}>{formatNumber(ruledOut, intervalDigits(lower, upper))}</Num> points is
      ruled out.{snapshot.nextStep ? <> What I&apos;ll do now: {snapshot.nextStep}.</> : null}
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
        Paused on <When iso={f.pausedOn} refs={refs} />: {f.reason}.
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
            <Derived value={safeCount(snapshot.nB)} unit="count" refs={refs} /> in B.
          </p>
        </>
      );
      break;
    case 'aa-failed': {
      const a = snapshot.aaFailed;
      content = a ? (
        <p className={P}>
          Calibration stopped on <When iso={a.on} refs={refs} />: {a.reason}. Calibration restarts on{' '}
          <When iso={a.restartsOn} refs={refs} />.
        </p>
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
