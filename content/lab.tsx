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
  /** The sizing Figure's title (on the Lab, the one Figure's): the relationship, never a number. */
  sizingTitle: string;
  /** The duration Figure's title (the pair only). */
  durationTitle: string;
  /** The words beside each Figure's Simulated badge: true whatever the controls are set to. */
  label: string;
  /** The duration control's label. */
  trafficLabel: string;
};

/** Per context; the groups are visitors in a hypothetical test and lapsed customers on Retention. */
export const PLANNER_COPY: Record<PlannerContext, PlannerCopy> = {
  hypothetical: {
    sizingTitle: 'Smaller rises need more visitors and more weeks',
    durationTitle: 'The fewer visitors a day, the more weeks a test needs',
    label: 'Hypothetical test',
    trafficLabel: 'Visitors per day',
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
    <>Made-up numbers to plan with. Visitors are split evenly between the two groups.</>
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
export function DurationCaption({
  context,
  traffic,
  part = 'all',
}: {
  context: PlannerContext;
  traffic: number;
  /** The Lab's method row takes only the sentences after the first. */
  part?: 'all' | 'rest';
}): ReactNode {
  const count = <Derived value={traffic} unit="count" refs={SIMULATED} />;
  const first = (
    <>
      {context === 'retention' ? (
        <>If {count} customers a day enter the test, split equally between groups</>
      ) : (
        <>If a page gets {count} visitors a day, split equally between groups</>
      )}
      , this is how long both groups take to reach the size from the planner above, in whole weeks, rounded up.
    </>
  );
  const rest = (
    <>
      The traffic is a number to plan with, not a promise of actual traffic: it assumes every one of them enters the
      test and the same number arrives every day.
    </>
  );
  if (part === 'rest') return rest;
  return (
    <>
      {first} {rest}
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
// The planner's exhibit on the Lab: the sentence above the Figure, the one below it, its method row's
// summary, and the terms and the run-time method it holds. Plain words; the numbers are the planner's
// own constants.

export const PLANNER_LEAD_IN =
  "Set today's sign-up rate and the smallest rise worth acting on. Then set the daily traffic and watch both numbers.";
export const PLANNER_TAKEAWAY =
  'Halve the rise you want to catch and you need about four times the visitors. So before a test I agree the smallest rise worth acting on. Some pages are too quiet to show it within weeks. Then I test a bolder change or a busier page. That beats running for months with little chance of a clear answer.';
export const PLANNER_METHOD_SUMMARY = 'How I worked out the size and the weeks';

/** The terms the planner's method uses, each in one sentence, with the expert name for each. */
export function SizingTerms(): ReactNode {
  return (
    <>
      <strong className="font-semibold">Sample size</strong>: how many visitors each group needs before the test can tell
      a real difference of the size you care about from chance.{' '}
      <strong className="font-semibold">Minimum detectable effect</strong>: the smallest rise worth acting on, agreed
      before the test. <strong className="font-semibold">Power</strong>: the chance that a test detects an effect of a
      given size when the effect is really there; <Derived value={PLANNER_POWER} unit="share" refs={SIMULATED} /> means{' '}
      <Derived value={Math.round(PLANNER_POWER * 10)} unit="count" refs={SIMULATED} /> times in{' '}
      <Derived value={10} unit="count" refs={SIMULATED} />. <strong className="font-semibold">Significance level</strong>
      : the risk of a false winner when there is no real rise; <Derived value={PLANNER_ALPHA} unit="share" refs={SIMULATED} />{' '}
      means <Derived value={1} unit="count" refs={SIMULATED} /> time in{' '}
      <Derived value={Math.round(1 / PLANNER_ALPHA)} unit="count" refs={SIMULATED} />.
    </>
  );
}

/** The Lab's run-time method: the weeks at the traffic set, rounded up, and what the traffic assumes. */
export function PlannerWeeksMethod({ traffic }: { traffic: number }): ReactNode {
  return (
    <>
      The weeks are how long both groups take to reach that size at{' '}
      <Derived value={traffic} unit="count" refs={SIMULATED} /> {traffic === 1 ? 'visitor' : 'visitors'} a day, split equally between them, in whole
      weeks, rounded up. <DurationCaption context="hypothetical" traffic={traffic} part="rest" />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// The Lab page: its head, its opening, its four checks in the order of a test's life, its limits and
// its close. Plain words only: every number on the page is in the exhibits, each with its own source
// marker.

/** The page's head: the chip, the h1 and its quiet second clause. */
export const LAB_HEAD = {
  chip: 'Lab',
  title: 'Four ways an A/B test can mislead you,',
  quiet: 'and how I catch each one.',
} as const;

/** The page's opening, under its heading. */
export function LabIntro(): ReactNode {
  return (
    <p>
      An A/B test shows two versions of a page to two groups of visitors. Then it compares what each group does. A
      wrong reading can ship a change that does nothing, or drop one that works. These are the four checks I run before
      I trust a result. Each one below is a small model you can play with. Every number is made up or simulated.
    </p>
  );
}

/**
 * The four checks in the order of a test's life, which is the page's order: the section's anchor, when
 * in a test the check comes, the question (the card's title and the section's h2), one plain line, the
 * section's short label, and the Figure it holds.
 */
export const LAB_SECTIONS = [
  {
    id: 'sample-size',
    when: 'Before the test',
    question: 'Is the test big enough?',
    line: 'With too few visitors, a real gain looks like noise. I work out the size before the start.',
    label: 'Sample size and power',
    figure: 'planner',
  },
  {
    id: 'split-check',
    when: 'While it runs',
    question: 'Did each group get its share?',
    line: 'If the groups differ in size by more than chance allows, the setup is broken. Then no result can be trusted, however good it looks.',
    label: 'Sample ratio mismatch',
    figure: 'srm',
  },
  {
    id: 'peeking-at-results',
    when: 'When reading it',
    question: 'Did we stop too early?',
    line: 'Check every day, stop at the first win, and chance hands you false winners.',
    label: 'Peeking',
    figure: 'peeking',
  },
  {
    id: 'exaggeration',
    when: 'After a win',
    question: 'Is the win as big as it looks?',
    line: 'A small test tends to win only on a lucky draw. So its wins look bigger than they are.',
    label: "Winner's curse (type M error)",
    figure: 'curse',
  },
] as const;

/** The card a reader with one minute should open, and the chip that says so. */
export const LAB_START = { id: 'peeking-at-results', chip: 'One minute? Start here.' } as const;

export const LAB_LIMITS_TITLE = 'What these examples cannot show';

/** What the examples cannot show. */
export function LabLimits(): ReactNode {
  return (
    <ul className="list-disc pl-5">
      <li className="mt-2 first:mt-0">
        Every number here is made up or simulated. None comes from a real test or from this site&apos;s live test.
      </li>
      <li className="mt-2 first:mt-0">
        The planner assumes two equal groups, the same traffic every day and one reading at the end. Checking as you go
        needs a different plan, as the peeking example shows.
      </li>
      <li className="mt-2 first:mt-0">
        The peeking numbers come from one simulation with one conversion rate. Other settings give other rates.
      </li>
      <li className="mt-2 first:mt-0">
        The split check and the overstatement example use standard approximations. They tell you when to look closer.
        They are not a verdict on a real test.
      </li>
    </ul>
  );
}

/** The close: what the page shows about how I work, and where to go next. */
export function LabClose(): ReactNode {
  return (
    <p>
      I size a test before it starts. I check the split before I read anything. I decide in advance how often I will
      look. And I treat a surprising win from a small test with suspicion. The live test on this site follows the same
      rules on real visitors. Its plan was written down before the first visitor was counted. It checks its split after
      every completed day, and its method stays valid however often it is read. With this site&apos;s traffic it can
      only catch a large effect, and the plan says so.
    </p>
  );
}

export const LAB_CLOSE_LINKS = [
  { href: '/experiment', label: 'See the live test' },
  { href: '/work/audible', label: 'See how I sized and evaluated tests at Audible' },
] as const;

/** The head of the peeking example's own page, the interview link. */
export const LAB_PEEKING_HEAD = {
  chip: 'Lab',
  title: 'Peeking at results,',
  quiet: 'why checking early finds false winners.',
} as const;

/** The opening of the peeking example's own page. */
export function LabPeekingIntro(): ReactNode {
  return <p>One example from the Lab: what happens when a test is checked every day and stopped at the first win.</p>;
}
