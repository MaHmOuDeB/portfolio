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
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { berlinStartOfDay } from '@/lib/experiment/time';
import { stopReasonKey } from '@/lib/experiment/reasons';
import { berlinDate } from '@/lib/figure/time';
import type { Locale } from '@/lib/i18n/locale';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { AB_START_STEP, CLOSED_STEP, CONFIRMING_STEP, RESTART_STEP, type NextStep } from '@/lib/live-page/next-step';
import type { LiveCopy } from '../../../content/live';
import { liveCopy } from './copy';
import { Count } from './Values';

function When({ iso, refs, locale }: { iso: string; refs: readonly DerivedRef[]; locale: Locale }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso, { locale })}
    </time>
  );
}
/** A Berlin calendar day ("2026-12-02"), printed as its date. */
const Day = ({ day, refs, locale }: { day: string; refs: readonly DerivedRef[]; locale: Locale }) => (
  <When iso={berlinStartOfDay(day)} refs={refs} locale={locale} />
);

/** The configured A/B start is a build value; fictional pages stay simulated. */
const startRefs = (d: LivePageDisplay): readonly DerivedRef[] => (d.refs.includes('simulated') ? ['simulated'] : ['build']);

/** A stored reason, without its own closing full stop (the sentence adds one). */
const reasonText = (r: string) => r.replace(/[.\s]+$/, '');

/**
 * A stored reason in the page's language. English prints the stored words. German prints the German
 * twin of a reason the site wrote; the owner's own note (a pause flag) has no twin and stays as
 * written, marked as English.
 */
export function reasonIn(reason: string, locale: Locale): ReactNode {
  if (locale === 'en') return reasonText(reason);
  const key = stopReasonKey(reason);
  return key !== null ? liveCopy(locale).reasons[key] : <span lang="en">{reasonText(reason)}</span>;
}

/** Where a split check failed and, unless the test is held, its published counts at that check. */
function SplitFailure({
  split,
  refs,
  lead,
  counts,
  locale,
}: {
  split: NonNullable<LivePageDisplay['split']>;
  refs: readonly DerivedRef[];
  lead: string;
  counts: boolean;
  locale: Locale;
}) {
  const t = liveCopy(locale).state;
  const bases = !counts ? [] : split.base === 'both' ? (['entry', 'analysed'] as const) : ([split.base] as const);
  return (
    <>
      {t.splitFailure({ lead: t.splitLead(lead), day: <Day day={split.day} refs={refs} locale={locale} />, base: t.base[split.base] })}
      {bases.map((b) => (
        <span key={b}>
          {t.viewsAt[b]({
            a: <Count value={split[b].a} refs={refs} locale={locale} />,
            b: <Count value={split[b].b} refs={refs} locale={locale} />,
          })}
        </span>
      ))}
    </>
  );
}

/** The state's own sentence(s). */
function stateSentence(d: LivePageDisplay, locale: Locale): ReactNode {
  const refs = d.refs;
  const t = liveCopy(locale).state;
  const day = (iso: string) => <When iso={iso} refs={refs} locale={locale} />;
  switch (d.mode) {
    case 'not-started':
      return t.notStarted;
    case 'closure-check':
      // No day: the stored day is the deciding look's, and the route stops counting only once the stop
      // is stored, up to a day later. The Home note prints no day either.
      return t.closureCheck;
    case 'unavailable':
      return d.closedConfirmed ? t.unavailableClosed : d.countingClosed ? t.unavailableCountingClosed : t.unavailable;
    case 'settings-unreadable':
      return t.settingsUnreadable;
    case 'held': {
      const held = d.held!;
      return t.held({
        reason: held.reason === 'inconsistent-counts' ? t.heldCounts : t.heldInterval,
        on: <Day day={held.on} refs={refs} locale={locale} />,
        split: d.split ? <SplitFailure split={d.split} refs={refs} lead={t.splitAlso} counts={false} locale={locale} /> : null,
      });
    }
    case 'srm-suppressed':
      return t.srm(d.split ? <SplitFailure split={d.split} refs={refs} lead={t.splitIt} counts locale={locale} /> : null);
    case 'aa-failed': {
      const split = d.split ? <SplitFailure split={d.split} refs={refs} lead={t.splitIt} counts locale={locale} /> : null;
      return d.aaFailed ? t.aaFailed({ on: day(d.aaFailed.on), reason: reasonIn(d.aaFailed.reason, locale), split }) : t.aaStopped(split);
    }
    case 'paused':
      return d.paused ? t.paused({ on: day(d.paused.on), reason: reasonIn(d.paused.reason, locale) }) : t.pausedPlain;
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return (
        <>
          {t.outcome[d.mode]}
          {d.afterDecisionSrm ? t.laterSplit : null}
        </>
      );
    case 'before-data':
    case 'calibration':
    case 'ab': {
      // Past the A/B's planned end (or a stored stop) before a decision is recorded.
      if (d.countingClosed) return d.closedConfirmed ? t.closedNoDecision : t.beingConfirmed;
      if (d.mode === 'ab') {
        return d.abStartedOn !== null ? t.abStarted(<When iso={d.abStartedOn} refs={startRefs(d)} locale={locale} />) : t.abRunning;
      }
      const c = d.calibration;
      return c !== null && c.ready && c.evaluatedOn !== null ? t.calibratingPassed(<Day day={c.evaluatedOn} refs={refs} locale={locale} />) : t.calibrating;
    }
  }
}

/** The English next-step sentence (as the model holds it) in the page's language. */
function nextText(text: string, copy: LiveCopy): string {
  if (text === CLOSED_STEP) return copy.next.closed;
  if (text === CONFIRMING_STEP) return copy.next.confirming;
  if (text === RESTART_STEP) return copy.next.restart;
  if (text === AB_START_STEP) return copy.next.abStart;
  return text;
}

/** The next step, with its date as a `<time>` where the sentence has one. */
function NextStepText({ step, locale }: { step: NextStep; locale: Locale }): ReactNode {
  const text = nextText(step.text, liveCopy(locale));
  if (step.date === undefined) return text;
  const [before, after] = text.split('{date}') as [string, string];
  return (
    <>
      {before}
      <When iso={step.date} refs={step.refs} locale={locale} />
      {after}
    </>
  );
}

export function StateExplanation({ model: d, locale = 'en' }: { model: LivePageDisplay; locale?: Locale }): ReactNode {
  return (
    <div data-live-state={d.mode} className="max-w-text text-base">
      <p>{stateSentence(d, locale)}</p>
      {d.nextStep !== null ? (
        <p data-next-step="" className="mt-3">
          <NextStepText step={d.nextStep} locale={locale} />
        </p>
      ) : null}
    </div>
  );
}
