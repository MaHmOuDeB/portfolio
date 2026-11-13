// The Lab's copy, as typed TSX: the sample-size planner's titles, labels and captions in its two
// contexts. A hypothetical test (the Lab) plans with made-up inputs; the Retention context starts from
// the case study's observed baseline and plans a hypothetical uplift on it. Every number is a <Fact>,
// a <Derived> that names its source, or a computed value marked simulated; the rest is plain words.
//
// Client-safe: the planner's lazy island renders these captions too, so this file imports only the
// kit's server-safe parts, the facts, the planner's constants and the formula, never a source export.
// The control row the page loads at once does not import it.
import type { ReactNode } from 'react';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { getFact } from '@/lib/facts';
import { PLANNER_NOUN, type PlannerContext } from '@/lib/lab/full-planner-values';
import { PLANNER_ALPHA, PLANNER_POWER } from '@/lib/lab/planner-values';
import { SAMPLE_SIZE_FORMULA } from '@/lib/stats';

const SIMULATED = ['simulated'] as const;

type PlannerCopy = {
  /** The sizing Figure's title: the relationship, never a number. */
  sizingTitle: string;
  /** The duration Figure's title. */
  durationTitle: string;
  /** The words beside each Figure's Simulated badge: true whatever the controls are set to. */
  label: string;
  /** The duration control's label. */
  trafficLabel: string;
};

/** Per context; the groups are visitors in a hypothetical test and lapsed customers on Retention. */
export const PLANNER_COPY: Record<PlannerContext, PlannerCopy> = {
  hypothetical: {
    sizingTitle: 'Smaller rises need more visitors per group',
    durationTitle: 'The fewer visitors a day, the more weeks a test needs',
    label: 'Hypothetical test',
    trafficLabel: 'Total visitors per day',
  },
  retention: {
    sizingTitle: 'Smaller rises need more customers per group',
    durationTitle: 'The fewer customers a day, the more weeks it takes to fill both groups',
    label: 'Hypothetical uplift',
    trafficLabel: 'Total customers per day',
  },
};

/** 34%: the observed baseline plus the uplift the win-back test was sized to detect, in whole points. */
function SourcedTarget() {
  const baseline = getFact('retention.winback.baseline_rate').value as number;
  const upliftPoints = getFact('retention.winback.uplift_pp').value as number;
  return (
    <Derived
      value={Math.round(baseline * 100 + upliftPoints) / 100}
      unit="share"
      decimals={0}
      refs={['retention.winback.baseline_rate', 'retention.winback.uplift_pp']}
    />
  );
}

/** What the inputs are, per context: the first sentences of the sizing caption. */
export function SizingContextNote({ context }: { context: PlannerContext }): ReactNode {
  return context === 'retention' ? (
    <>
      The preset is a hypothetical uplift on an observed baseline. Its baseline,{' '}
      <Fact id="retention.winback.baseline_rate" />, is the share of lapsed customers in the case study&apos;s public
      dataset who ordered again within the window; a rise of <Fact id="retention.winback.uplift_pp" /> points, to <SourcedTarget />, is an
      uplift to plan for, not the effect of any offer. Nobody was contacted and no test was run.
    </>
  ) : (
    <>
      A hypothetical test: the baseline conversion and the rise are numbers to plan with, not results from a real test.
    </>
  );
}

/** The method and its assumptions, with the formula that produced the readout. */
export function SizingMethod({ context }: { context: PlannerContext }): ReactNode {
  return (
    <>
      Sample sizes from Cohen&apos;s h for a two-sided test at a significance level of{' '}
      <Derived value={PLANNER_ALPHA} unit="share" refs={SIMULATED} /> and a power of{' '}
      <Derived value={PLANNER_POWER} unit="share" refs={SIMULATED} />, with the {PLANNER_NOUN[context]} split equally between the two groups
      and the result read once, at the end:{' '}
      {/* The formula on a line of its own, wrapping at its spaces, with its full stop after it. */}
      <span data-formula="" className="my-2 block">
        <code {...derivedAttr(SIMULATED)}>{SAMPLE_SIZE_FORMULA}</code>.
      </span>{' '}
      In points, the rise is the target minus the baseline; as a percent of the baseline, it is that difference
      divided by the baseline. Either way the sample is the same.
    </>
  );
}

/** The duration caption: hypothetical traffic, whole weeks rounded up, no promise of real visitors. */
export function DurationCaption({ context, traffic }: { context: PlannerContext; traffic: number }): ReactNode {
  const count = <Derived value={traffic} unit="count" refs={SIMULATED} />;
  return (
    <>
      {context === 'retention' ? (
        <>If {count} customers a day enter the test, split equally between groups</>
      ) : (
        <>If a page gets {count} visitors a day, split equally between groups</>
      )}
      , this is how long both groups take to reach the size from the planner above, in whole weeks, rounded up. The
      traffic is a number to plan with, not a promise of actual traffic: it assumes every one of them enters the test
      and the same number arrives every day.
      {context === 'retention' ? (
        <>
          {' '}
          Each customer&apos;s result is known only once their window for ordering again has passed, so the test runs
          that much longer after the last one enters.
        </>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The Lab page: its intro, its four examples in page order with what each one is for, and its limits.
// Plain words only: every number on the page is in the Figures, each with its own source marker.

/** The page's opening, under its heading. */
export function LabIntro(): ReactNode {
  return (
    <p>
      I use these examples to show what a test can and cannot tell me. Each one runs on numbers you set or on a
      simulation; none of them is data from a real test.
    </p>
  );
}

/** The four examples in page order: the section's anchor and heading, and one plain sentence on what it is for. */
export const LAB_SECTIONS = [
  {
    id: 'sample-size',
    title: 'Sample size and duration',
    figure: 'planner',
    purpose: 'How many visitors each group needs to detect a given rise, and how many weeks that takes at a given traffic.',
  },
  {
    id: 'peeking-at-results',
    title: 'Peeking at results',
    figure: 'peeking',
    purpose: 'What checking a running test every day does to its false positives, and what each fix costs.',
  },
  {
    id: 'split-check',
    title: 'Split check',
    figure: 'srm',
    purpose: 'Whether the groups got the share of visitors they were meant to get, or whether the assignment and the logging need a closer look.',
  },
  {
    id: 'exaggeration',
    title: 'Exaggeration',
    figure: 'curse',
    purpose: 'Why an effect that passes the threshold in a test with little power looks bigger than it is.',
  },
] as const;

/** What the examples cannot show. */
export function LabLimits(): ReactNode {
  return (
    <ul className="list-disc pl-5">
      <li className="mt-2 first:mt-0">
        The numbers here are simulated or hypothetical. None of them comes from a real test or from this site&apos;s
        live test.
      </li>
      <li className="mt-2 first:mt-0">
        The planner assumes two groups of equal size, a result read once at the end and the same traffic every day.
        Checking the result as it comes in needs a different plan, as the peeking example shows.
      </li>
      <li className="mt-2 first:mt-0">
        The peeking results come from one seeded simulation with one conversion rate and one number of visitors per
        look. Other settings give other rates, and the Monte Carlo range covers only the simulation&apos;s own noise.
      </li>
      <li className="mt-2 first:mt-0">
        The split check and the exaggeration example use standard approximations: a chi-square test on counts, and an
        estimate that is normally distributed with a known standard error. What they show is a reason to look closer,
        not a verdict on a real test.
      </li>
    </ul>
  );
}

/** The opening of the peeking example's own page, the interview link. */
export function LabPeekingIntro(): ReactNode {
  return <p>One example from the Lab: what checking a running test every day does to its false positives.</p>;
}
