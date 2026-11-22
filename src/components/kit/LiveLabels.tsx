// Small labels for live data: when it was updated, and how far a collecting test has got.
// Timestamps are Europe/Berlin. Server-safe (useId works in Server Components).
import { useId } from 'react';
import { berlinDate, updatedLabel } from '@/lib/figure/time';
import { Derived, derivedAttr, type DerivedRef } from './Derived';
import { KIT_TEXT_EN, type KitText } from './text';

type Refs = { /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */ refs: readonly DerivedRef[] };

export function UpdatedLabel({
  updatedAt,
  renderedAt,
  refs,
  text = KIT_TEXT_EN,
}: { updatedAt: string; renderedAt: string; text?: Pick<KitText, 'locale' | 'live'> } & Refs) {
  return (
    <time dateTime={updatedAt} className="text-xs text-muted" {...derivedAttr(refs)}>
      {updatedLabel(updatedAt, renderedAt, { word: text.live.updated, locale: text.locale })}
    </time>
  );
}

export function ProgressLine({
  nSmaller,
  target,
  plannedEnd,
  plannedEndKind,
  refs,
  text = KIT_TEXT_EN,
}: {
  text?: Pick<KitText, 'locale' | 'live'>;
  nSmaller: number;
  target: number;
  plannedEnd: string;
  /** 'earliest' during the calibration: the run can end no sooner than this. */
  plannedEndKind: 'fixed' | 'earliest';
} & Refs) {
  const labelId = useId();
  return (
    <div>
      <progress
        className="block h-3 w-full appearance-none overflow-hidden rounded-sm border border-muted bg-bg [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-bg [&::-webkit-progress-value]:bg-accent"
        max={target}
        value={Math.min(nSmaller, target)}
        aria-labelledby={labelId}
      />
      <p className="mt-2 text-sm">
        <span id={labelId}>
          {text.live.progress({
            n: <Derived value={nSmaller} unit="count" refs={refs} locale={text.locale} />,
            target: <Derived value={target} unit="count" refs={refs} locale={text.locale} />,
          })}
        </span>
        . {plannedEndKind === 'earliest' ? text.live.earliestEnd : text.live.plannedEnd}:{' '}
        <time dateTime={plannedEnd} {...derivedAttr(refs)}>
          {berlinDate(plannedEnd, { locale: text.locale })}
        </time>
        {text.locale === 'de' ? null : '.'}
      </p>
    </div>
  );
}
