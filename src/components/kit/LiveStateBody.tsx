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
import { EXPERIMENT } from '@/experiment.values';
import { MIN_PER_GROUP, type FigureBody } from '@/lib/figure/states';
import { berlinDate } from '@/lib/figure/time';
import { ConfidenceChart } from './ConfidenceChart';
import { Derived, derivedAttr, type DerivedRef } from './Derived';
import { KIT_TEXT_EN, type KitText } from './text';

type Props = {
  snapshot: LiveSnapshot;
  body: FigureBody;
  /** The Figure's id, for the chart. */
  id: string;
  /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs: readonly DerivedRef[];
  /** The kit's words and the language of its numbers; default English. */
  text?: KitText;
};

/** The quick-exit guardrail's window, from the pre-registration. */
const GUARDRAIL_SECONDS: number = EXPERIMENT.guardrail.quickExitSeconds;

const P = 'max-w-text text-base';

function Num({ refs, children }: { refs: readonly DerivedRef[]; children: ReactNode }) {
  return (
    <span data-num="" {...derivedAttr(refs)}>
      {children}
    </span>
  );
}

function When({ iso, refs, locale }: { iso: string; refs: readonly DerivedRef[]; locale: KitText['locale'] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso, { locale })}
    </time>
  );
}

/** `signed`: the sentence claims a bound's sign, so no bound that is not zero may print "0". */
function Interval({
  lower,
  upper,
  refs,
  signed,
  locale,
}: {
  lower: number;
  upper: number;
  refs: readonly DerivedRef[];
  signed?: boolean;
  locale: KitText['locale'];
}) {
  return <Num refs={refs}>{formatIntervalPoints(lower, upper, { awayFromZero: signed, locale })}</Num>;
}


const finite = (...vs: number[]) => vs.every(Number.isFinite);
const clamp = (v: number) => Math.min(MAX_POINTS, Math.max(-MAX_POINTS, v));

function Guardrail({ snapshot, refs, text }: { snapshot: LiveSnapshot; refs: readonly DerivedRef[]; text: KitText }) {
  const g = snapshot.guardrail;
  if (!g || !finite(g.lower, g.upper, g.limit)) return null;
  const [lower, upper] = [clamp(Math.min(g.lower, g.upper)), clamp(Math.max(g.lower, g.upper))];
  return (
    <p className={`mt-4 ${P}`}>
      {text.live.guardrail({
        seconds: <Num refs={refs}>{GUARDRAIL_SECONDS}</Num>,
        interval: <Interval lower={lower} upper={upper} refs={refs} locale={text.locale} />,
        limit: <Num refs={refs}>{formatSignedNumber(g.limit, 1, { locale: text.locale })}</Num>,
      })}
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

function NextStep({ snapshot, text }: { snapshot: LiveSnapshot; text: KitText }) {
  return snapshot.nextStep ? <>{text.live.nextStep({ step: snapshot.nextStep })}</> : null;
}

function Outcome({
  body,
  snapshot,
  refs,
  text,
}: {
  body: 'ship-b' | 'stop-for-harm' | 'inconclusive';
  snapshot: LiveSnapshot;
  refs: readonly DerivedRef[];
  text: KitText;
}) {
  const t = text.live;
  const m = confidenceModel(snapshot, { locale: text.locale });
  if (m === null) {
    // No interval may be shown, and the test has ended: no collecting row, no planned end, no
    // promise of a next look. Inconclusive can end this way (the cap came first, or its looks are
    // missing); ship-b and stop-for-harm need an interval, so without one no verdict is claimed.
    if (body !== 'inconclusive') return <p className={P}>{t.unavailable}</p>;
    if (smallerGroup(snapshot) >= MIN_PER_GROUP) {
      return (
        <p className={P}>
          {t.inconclusiveCap}
          <NextStep snapshot={snapshot} text={text} />
        </p>
      );
    }
    return (
      <p className={P}>
        {t.inconclusiveFew({ min: <Derived value={MIN_PER_GROUP} unit="count" refs={refs} locale={text.locale} /> })}
        <NextStep snapshot={snapshot} text={text} />
      </p>
    );
  }
  const { lower, upper } = m.current;
  const interval = <Interval lower={lower} upper={upper} refs={refs} signed={body !== 'inconclusive'} locale={text.locale} />;
  if (body === 'ship-b') {
    return (
      <p className={P}>
        <Lead>{t.shipLead}</Lead>
        {t.shipRest({ interval })}
      </p>
    );
  }
  if (body === 'stop-for-harm') {
    return (
      <p className={P}>
        <Lead>{t.stopLead}</Lead>
        {t.stopRest({ interval })}
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
      <Lead>{t.inconclusiveLead}</Lead>
      {t.inconclusiveRest({ interval, ruledOut: <Num refs={refs}>{formatNumber(ruledOut, digits, { locale: text.locale })}</Num> })}
      <NextStep snapshot={snapshot} text={text} />
    </p>
  );
}

export function LiveStateBody({ snapshot, body, id, refs, text = KIT_TEXT_EN }: Props) {
  const t = text.live;
  const locale = text.locale;
  const own = body === 'paused' || body === 'error' || body === 'default' ? contentBody(snapshot) : body;
  const chart = <ConfidenceChart id={id} snapshot={snapshot} body={body} refs={refs} text={text} />;
  const f = snapshot.freshness;
  const paused =
    body === 'paused' && f.kind === 'paused' ? (
      <p className={`mb-4 ${P}`}>
        <Status tone="warn">{t.paused}</Status>
        {t.pausedLine({ when: <When iso={f.pausedOn} refs={refs} locale={locale} />, reason: f.reason })}
      </p>
    ) : null;
  const count = (n: number) => <Derived value={safeCount(n)} unit="count" refs={refs} locale={locale} />;

  let content: ReactNode;
  switch (own) {
    case 'low-data':
      content = (
        <>
          {snapshot.phase === 'ab' && snapshot.abStartedOn ? (
            <p className={P}>{t.abStarted({ when: <When iso={snapshot.abStartedOn} refs={refs} locale={locale} /> })}</p>
          ) : null}
          {snapshot.phase === 'calibration' && body !== 'paused' ? <p className={P}>{t.calibrating}</p> : null}
          {chart}
        </>
      );
      break;
    case 'calibration':
    case 'ab': {
      const model = confidenceModel(snapshot, { locale });
      content = (
        <>
          {/* Only a test that is running says so; under a pause the pause sentence stands alone. */}
          {own === 'calibration' && body !== 'paused' ? <p className={P}>{t.calibrating}</p> : null}
          {/* Only a test that is running says so; under a pause the pause sentence stands alone. */}
          {own === 'ab' && body !== 'paused' ? (
            <p className={P}>
              {snapshot.abStartedOn ? (
                <>
                  {t.abStarted({ when: <When iso={snapshot.abStartedOn} refs={refs} locale={locale} /> })}
                  {' '}
                </>
              ) : null}
              {model && !model.includesZero ? t.stillRunning : t.includesZeroYet}
            </p>
          ) : null}
          <p className="mt-2 text-sm">
            <Status tone="ok">{t.srmPassed}</Status>
          </p>
          <div className="mt-4">{chart}</div>
          {own === 'ab' ? <Guardrail snapshot={snapshot} refs={refs} text={text} /> : null}
        </>
      );
      break;
    }
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      content = (
        <>
          {/* Under a pause the pause is the state, so no verdict is stated; the frozen chart stays. */}
          {body === 'paused' ? null : <Outcome body={own} snapshot={snapshot} refs={refs} text={text} />}
          <div className={body === 'paused' ? '' : 'mt-4'}>{chart}</div>
          {confidenceModel(snapshot, { locale }) ? <Guardrail snapshot={snapshot} refs={refs} text={text} /> : null}
        </>
      );
      break;
    case 'srm-suppressed':
      content = (
        <>
          <p className={P}>
            <Status tone="warn">{t.srmFailed}</Status>
            {t.srmFailedRest}
          </p>
          <p className={`mt-2 ${P}`}>{t.viewsSoFar({ a: count(snapshot.nA), b: count(snapshot.nB) })}</p>
        </>
      );
      break;
    case 'aa-failed': {
      const a = snapshot.aaFailed;
      content = a ? (
        <>
          <p className={P}>
            {t.calibrationStopped({ when: <When iso={a.on} refs={refs} locale={locale} />, reason: a.reason })}
            {a.restartsOn ? t.calibrationRestarts({ when: <When iso={a.restartsOn} refs={refs} locale={locale} /> }) : null}
          </p>
          <p className={`mt-2 ${P}`}>{t.viewsWhenStopped({ a: count(snapshot.nA), b: count(snapshot.nB) })}</p>
        </>
      ) : (
        <p className={P}>{t.calibrationStoppedPlain}</p>
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
