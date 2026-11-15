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
export function DurationCaption({
  context,
  traffic,
  part = 'all',
}: {
  context: PlannerContext;
  traffic: number;
  /** The Lab shows the first sentence under the Figure and the rest in the method row. */
  part?: 'all' | 'first' | 'rest';
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
  if (part === 'first') return first;
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
// The planner's two exhibits on the Lab: the sentence above each Figure, the one below it, and the
// terms its method row defines. Plain words; the numbers are the planner's own constants.

export const SIZING_LEAD_IN =
  'Set how many visitors convert today and the smallest rise worth acting on. The large number is how many visitors each group needs.';
export const SIZING_TAKEAWAY =
  'Halve the rise you want to detect and the test needs about four times the visitors. So the first planning question is always: what is the smallest rise worth acting on?';
export const DURATION_LEAD_IN = 'Now set the daily traffic. The number is how many whole weeks the test has to run.';
export const DURATION_TAKEAWAY =
  'A quiet page can need months to show a small rise. Knowing that before the start lets a team test a bolder change or a busier page instead.';

/** The two terms the planner's method uses, each in one sentence. */
export function SizingTerms(): ReactNode {
  return (
    <>
      <strong className="font-semibold">Sample size</strong>: how many visitors each group needs before the test can tell
      a real difference of the size you care about from chance. <strong className="font-semibold">Power</strong>: the
      chance that a test detects an effect of a given size when the effect is really there;{' '}
      <Derived value={PLANNER_POWER} unit="share" refs={SIMULATED} /> means{' '}
      <Derived value={Math.round(PLANNER_POWER * 10)} unit="count" refs={SIMULATED} /> times in{' '}
      <Derived value={10} unit="count" refs={SIMULATED} />.
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
  title: 'Four ways an A/B test can mislead,',
  quiet: 'and the check for each.',
} as const;

/** The page's opening, under its heading. */
export function LabIntro(): ReactNode {
  return (
    <p>
      An A/B test shows two versions of a page to two groups of visitors and compares what they do. It only helps a
      business if the result can be trusted. These are the four checks I make before I believe a result. Move the
      controls: every number is made up or simulated, none comes from a real test.
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
    line: 'Too few visitors and a real improvement goes unseen. The size is worked out before the test starts.',
    label: 'Sample size and duration',
    figure: 'planner',
  },
  {
    id: 'split-check',
    when: 'While it runs',
    question: 'Did each group get its share?',
    line: 'If one group gets more visitors than planned, the set-up is broken and the result cannot be trusted.',
    label: 'Split check',
    figure: 'srm',
  },
  {
    id: 'peeking-at-results',
    when: 'When reading it',
    question: 'Did we stop too early?',
    line: 'Checking every day and stopping at the first win turns chance into winners.',
    label: 'Peeking at results',
    figure: 'peeking',
  },
  {
    id: 'exaggeration',
    when: 'After a win',
    question: 'Is the win as big as it looks?',
    line: 'Small tests that win tend to overstate the win.',
    label: 'Exaggeration',
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
        The numbers here are simulated or hypothetical. None of them comes from a real test or from this site&apos;s
        live test.
      </li>
      <li className="mt-2 first:mt-0">
        The planner assumes two groups of equal size, a result read once at the end, the same traffic every day and
        every visitor entering the test.
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

/** The close: what the page shows about how I work, and where to go next. */
export function LabClose(): ReactNode {
  return (
    <p>
      I size a test before it starts, check the split before I read anything, decide in advance how often I will look,
      and treat a small test&apos;s win with suspicion. The live test on this site sizes itself, checks its split and
      fixes its looks in advance, on real visitors.
    </p>
  );
}

export const LAB_CLOSE_LINKS = [
  { href: '/experiment', label: 'See the live test' },
  { href: '/work/audible', label: 'See how I planned tests at Audible' },
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
