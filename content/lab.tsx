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
  /** The words beside each Figure's Simulated badge. */
  label: string;
  /** The duration control's label. */
  trafficLabel: string;
};

/** Per context; the groups are visitors in a hypothetical test and lapsed customers on Retention. */
export const PLANNER_COPY: Record<PlannerContext, PlannerCopy> = {
  hypothetical: {
    sizingTitle: 'Smaller rises need more visitors per group.',
    durationTitle: 'The fewer visitors a day, the more weeks a test needs.',
    label: 'Hypothetical test',
    trafficLabel: 'Total visitors per day',
  },
  retention: {
    sizingTitle: 'Smaller rises need more customers per group.',
    durationTitle: 'The fewer customers a day, the more weeks a test needs.',
    label: 'Hypothetical uplift, observed baseline',
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
      A hypothetical uplift on an observed baseline. The preset baseline,{' '}
      <Fact id="retention.winback.baseline_rate" />, is the share of lapsed customers in the case study&apos;s public
      dataset who ordered again; a rise of <Fact id="retention.winback.uplift_pp" /> points, to <SourcedTarget />, is an
      uplift to plan for, not the effect of any offer. Nobody was contacted and no test was run.
    </>
  ) : (
    <>
      A hypothetical test: the baseline conversion and the rise are numbers to plan with, not results from a real test
      or from the case studies.
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
      <code className="wrap-anywhere" {...derivedAttr(SIMULATED)}>
        {SAMPLE_SIZE_FORMULA}
      </code>
      . In points, the rise is the target minus the baseline; as a percent of the baseline, it is that difference
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
    </>
  );
}
