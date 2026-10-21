'use client';

// "3 of 5" between Previous and Next. It is controlled: `current` comes from the caller, and
// `onChange` fires only for a change the visitor asked for with a button or an arrow key, so it
// never fights a scroll that moves `current` from outside. The position is announced through a
// polite live region only after such a use. At an end the button is aria-disabled, not disabled,
// so focus is not dropped there, and a click does nothing. Hidden without JavaScript, where the
// steps are stacked still frames.
import { useState } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { cx } from '@/lib/cx';
import { normalizeSteps, stepDirection, stepLabel, stepTarget } from '@/lib/figure/steps';

export type StepNavProps = {
  /** 1-based. Clamped to 1 to total, so a stale or hostile value never throws. */
  current: number;
  total: number;
  /** Called with the new 1-based step, only after a button or arrow use that changes it. */
  onChange: (next: number) => void;
  /** The nav landmark's accessible name. */
  label: string;
  /** Where the printed position comes from, for data-derived. */
  refs: readonly DerivedRef[];
};

const BUTTON = cx(
  buttonClass('secondary'),
  'aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted aria-disabled:hover:bg-transparent',
);

export function StepNav({ current, total, onChange, label, refs }: StepNavProps) {
  const at = normalizeSteps(current, total);
  // The counter changes on every use, so the same text announced twice (3 of 5, then an outside
  // change, then 3 of 5 again) is a new node in the live region and is read again.
  const [announced, setAnnounced] = useState({ text: '', n: 0 });
  const marker = derivedAttr(refs);

  const move = (direction: 1 | -1) => {
    const target = stepTarget(at.current, at.total, direction);
    if (target === null) return;
    onChange(target);
    setAnnounced((prev) => ({ text: stepLabel(target, at.total), n: prev.n + 1 }));
  };

  return (
    <nav
      aria-label={label}
      data-js-only
      data-step-nav
      className="relative inline-flex items-center gap-3"
      onKeyDown={(e) => {
        const direction = stepDirection(e);
        if (direction === null) return;
        e.preventDefault();
        move(direction);
      }}
    >
      <button
        type="button"
        data-touch-target
        className={BUTTON}
        aria-disabled={at.current <= 1 ? 'true' : undefined}
        onClick={() => move(-1)}
      >
        Previous
      </button>
      <span data-step-count data-num="" {...marker} className="min-w-[5ch] text-center text-sm">
        {stepLabel(at.current, at.total)}
      </span>
      <button
        type="button"
        data-touch-target
        className={BUTTON}
        aria-disabled={at.current >= at.total ? 'true' : undefined}
        onClick={() => move(1)}
      >
        Next
      </button>
      <span aria-live="polite" data-step-live {...marker} className="sr-only">
        {announced.n > 0 ? <span key={announced.n}>{announced.text}</span> : null}
      </span>
    </nav>
  );
}
