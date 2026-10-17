// Small labels for live data: when it was updated, and how far a collecting test has got.
// Timestamps are Europe/Berlin. Server-safe (useId works in Server Components).
import { useId } from 'react';
import { berlinDate, updatedLabel } from '@/lib/figure/time';
import { Derived, derivedAttr, type DerivedRef } from './Derived';

type Refs = { /** Where the numbers come from: 'live' on the site, 'simulated' in the kitchen sink. */ refs?: readonly DerivedRef[] };

export function UpdatedLabel({
  updatedAt,
  renderedAt,
  refs = ['live'],
}: { updatedAt: string; renderedAt: string } & Refs) {
  return (
    <time dateTime={updatedAt} className="text-xs text-muted" {...derivedAttr(refs)}>
      {updatedLabel(updatedAt, renderedAt)}
    </time>
  );
}

export function ProgressLine({
  nSmaller,
  target,
  plannedEnd,
  refs = ['live'],
}: { nSmaller: number; target: number; plannedEnd: string } & Refs) {
  const labelId = useId();
  return (
    <div>
      <progress
        className="block h-2 w-64 max-w-full appearance-none overflow-hidden rounded-sm bg-line [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent"
        max={target}
        value={Math.min(nSmaller, target)}
        aria-labelledby={labelId}
      />
      <p className="mt-2 text-sm">
        <span id={labelId}>
          Progress: <Derived value={nSmaller} unit="count" refs={refs} /> of{' '}
          <Derived value={target} unit="count" refs={refs} /> in the smaller group
        </span>
        . Planned end:{' '}
        <time dateTime={plannedEnd} {...derivedAttr(refs)}>
          {berlinDate(plannedEnd)}
        </time>
        .
      </p>
    </div>
  );
}
