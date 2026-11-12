// What the Live test page says about the state of the experiment: the state's own sentence, then
// the next step when there is one. Server-safe, no hooks; it reads the allowlisted display shape
// only, so every count it prints is a published cell (PublishedCountText) and every date is a
// `<time>` with its refs.
//
// The state comes from the Home model's mode (the same precedence the Home note uses), never from a
// second reading of the data. A stop is said to have happened only when it is confirmed; a stored
// stop that the current data does not match promises no update, no resume and no date that moves;
// a held test never reads as running, passed or inconclusive; this page assigns no group, so it never
// says which group the reader is in.
import type { ReactNode } from 'react';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { berlinStartOfDay } from '@/lib/experiment/time';
import { berlinDate } from '@/lib/figure/time';
import type { LivePageDisplay } from '@/lib/live-page/model';
import type { NextStep } from '@/lib/live-page/next-step';

function When({ iso, refs }: { iso: string; refs: readonly DerivedRef[] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso)}
    </time>
  );
}
/** A Berlin calendar day ("2026-12-02"), printed as its date. */
const Day = ({ day, refs }: { day: string; refs: readonly DerivedRef[] }) => <When iso={berlinStartOfDay(day)} refs={refs} />;

/** The configured A/B start is a build value; fictional pages stay simulated. */
const startRefs = (d: LivePageDisplay): readonly DerivedRef[] => (d.refs.includes('simulated') ? ['simulated'] : ['build']);

const BASE_WORDS = { entry: 'entry views', analysed: 'analysed views', both: 'entry and analysed views' } as const;
/** A stored reason, without its own closing full stop (the sentence adds one). */
const reasonText = (r: string) => r.replace(/[.\s]+$/, '');

/** Where a split check failed and, unless the test is held, its published counts at that check. */
function SplitFailure({ split, refs, lead, counts }: { split: NonNullable<LivePageDisplay['split']>; refs: readonly DerivedRef[]; lead: string; counts: boolean }) {
  const bases = !counts ? [] : split.base === 'both' ? (['entry', 'analysed'] as const) : ([split.base] as const);
  return (
    <>
      {` ${lead} `}
      <Day day={split.day} refs={refs} />, on {BASE_WORDS[split.base]}.
      {bases.map((b) => (
        <span key={b}>
          {` ${b === 'entry' ? 'Entry' : 'Analysed'} views at that check: `}
          <PublishedCountText value={split[b].a} refs={refs} /> in group A and <PublishedCountText value={split[b].b} refs={refs} /> in group B.
        </span>
      ))}
    </>
  );
}

const OUTCOME_WORDS = {
  'ship-b': 'Ship B.',
  'stop-for-harm': 'Stop for harm.',
  inconclusive: 'Inconclusive at the limit; this is not evidence of no effect.',
} as const;
const CALIBRATING = 'Calibrating: both groups see the same page.';

/** The state's own sentence(s). */
function stateSentence(d: LivePageDisplay): ReactNode {
  const refs = d.refs;
  switch (d.mode) {
    case 'not-started':
      return 'The experiment has not started. Nothing is counted yet.';
    case 'closure-check':
      // No day: the stored day is the deciding look's, and the route stops counting only once the stop
      // is stored, up to a day later. The Home note prints no day either.
      return 'Counting has stopped for this run. I am checking the stored result before showing it.';
    case 'unavailable':
      return d.closedConfirmed
        ? 'The live counts could not be loaded, and counting has closed.'
        : d.countingClosed
          ? 'The live counts could not be loaded.'
          : 'The live counts could not be loaded. They will appear at the next update.';
    case 'settings-unreadable':
      return 'Counting is stopped because the experiment settings could not be read.';
    case 'held': {
      const held = d.held!;
      return (
        <>
          {held.reason === 'inconsistent-counts'
            ? 'The test stopped because the counts failed a consistency check.'
            : 'The test stopped because the interval failed a consistency check.'}
          {' Results use only the data up to the last check that passed. The check failed on '}
          <Day day={held.on} refs={refs} />.
          {d.split ? <SplitFailure split={d.split} refs={refs} lead="The split check also failed on" counts={false} /> : null}
        </>
      );
    }
    case 'srm-suppressed':
      return (
        <>
          The split check failed, so no result is shown.
          {d.split ? <SplitFailure split={d.split} refs={refs} lead="It failed on" counts /> : null}
        </>
      );
    case 'aa-failed':
      return (
        <>
          {d.aaFailed ? (
            <>
              Calibration stopped on <When iso={d.aaFailed.on} refs={refs} />: {reasonText(d.aaFailed.reason)}.
            </>
          ) : (
            'Calibration stopped.'
          )}
          {d.split ? <SplitFailure split={d.split} refs={refs} lead="It failed on" counts /> : null}
        </>
      );
    case 'paused':
      return d.paused ? (
        <>
          Paused on <When iso={d.paused.on} refs={refs} />: {reasonText(d.paused.reason)}.
        </>
      ) : (
        'The experiment on this site is paused.'
      );
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return (
        <>
          {OUTCOME_WORDS[d.mode]}
          {d.afterDecisionSrm ? ' A later split check failed; the recorded decision is unchanged.' : null}
        </>
      );
    case 'before-data':
    case 'calibration':
    case 'ab': {
      // Past the A/B's planned end (or a stored stop) before a decision is recorded.
      if (d.countingClosed) return d.closedConfirmed ? 'Counting has closed; no decision is recorded in this snapshot.' : 'The result is being confirmed.';
      if (d.mode === 'ab') {
        return d.abStartedOn !== null ? (
          <>
            A/B started <When iso={d.abStartedOn} refs={startRefs(d)} />.
          </>
        ) : (
          'The A/B test is running.'
        );
      }
      const c = d.calibration;
      return c !== null && c.ready && c.evaluatedOn !== null ? (
        <>
          {`${CALIBRATING} The calibration passed its checks on `}
          <Day day={c.evaluatedOn} refs={refs} />.
        </>
      ) : (
        CALIBRATING
      );
    }
  }
}

/** The next step, with its date as a `<time>` where the sentence has one. */
function NextStepText({ step }: { step: NextStep }): ReactNode {
  if (step.date === undefined) return step.text;
  const [before, after] = step.text.split('{date}') as [string, string];
  return (
    <>
      {before}
      <When iso={step.date} refs={step.refs} />
      {after}
    </>
  );
}

export function StateExplanation({ model: d }: { model: LivePageDisplay }): ReactNode {
  return (
    <div data-live-state={d.mode} className="max-w-text text-base">
      <p>{stateSentence(d)}</p>
      {d.nextStep !== null ? (
        <p data-next-step="" className="mt-3">
          <NextStepText step={d.nextStep} />
        </p>
      ) : null}
    </div>
  );
}
