'use client';

// The "Step navigation" section of the kitchen sink: StepNav in a demo that owns its state, with a
// button that changes the step from outside (which must not be announced), then the first, middle,
// last and single-step states. The demo's step list shows aria-current="step"; the scroll moment
// that scrolls real steps is built later. Every number here is marked 'simulated'.
import { useState, useSyncExternalStore } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';
import { derivedAttr } from '@/components/kit/Derived';
import { StepNav } from '@/components/kit/StepNav';
import { cx } from '@/lib/cx';
import { Specimen } from './Specimen';

const REFS = ['simulated'] as const;
const SIMULATED = derivedAttr(REFS);
const OUTSIDE_STEP = 4;
// Fictional step titles, in words, so the list carries no numerals of its own.
const STEPS = ['Set the question', 'Collect the groups', 'Check the split', 'Read the estimate', 'Decide'] as const;
const noSubscription = () => () => {};

function Demo() {
  const [step, setStep] = useState(1);
  // True once hydrated, so a test clicks or presses keys only when the handlers are attached: the
  // buttons show from the first paint (data-js-only), and a click or key before hydration is lost.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div data-figure="sink-stepnav" {...(ready ? { 'data-ready': '' } : {})}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <StepNav current={step} total={STEPS.length} onChange={setStep} label="Fictional steps, demo" refs={REFS} />
        <button
          type="button"
          data-touch-target
          data-js-only
          className={buttonClass('secondary')}
          onClick={() => setStep(OUTSIDE_STEP)}
        >
          <span>
            Set to step <span {...SIMULATED}>{OUTSIDE_STEP}</span> from outside
          </span>
        </button>
      </div>
      <ol className="mt-4 max-w-text text-sm text-muted">
        {STEPS.map((title, i) => (
          <li
            key={title}
            data-step={i + 1}
            aria-current={i + 1 === step ? 'step' : undefined}
            className={cx('py-1', i + 1 === step && 'font-semibold text-ink')}
          >
            {title}
          </li>
        ))}
      </ol>
    </div>
  );
}

function At({ label, initial, total }: { label: string; initial: number; total: number }) {
  const [step, setStep] = useState(initial);
  return <StepNav current={step} total={total} onChange={setStep} label={label} refs={REFS} />;
}

export function StepNavSection() {
  return (
    <>
      <Specimen
        id="stepnav--demo"
        title="Step navigation demo"
        note="Previous, Next and the left and right arrow keys move the step and announce it. The outside button changes the step without an announcement, like a scroll would."
      >
        <Demo />
      </Specimen>
      <Specimen id="stepnav--first" title="First step" note="Previous is aria-disabled, so focus can stay on it.">
        <At label="Fictional steps, first" initial={1} total={5} />
      </Specimen>
      <Specimen id="stepnav--middle" title="Middle step" note="Both buttons are live.">
        <At label="Fictional steps, middle" initial={3} total={5} />
      </Specimen>
      <Specimen id="stepnav--last" title="Last step" note="Next is aria-disabled.">
        <At label="Fictional steps, last" initial={5} total={5} />
      </Specimen>
      <Specimen id="stepnav--single" title="A single step" note="Both buttons are aria-disabled.">
        <At label="Fictional steps, single" initial={1} total={1} />
      </Specimen>
    </>
  );
}
