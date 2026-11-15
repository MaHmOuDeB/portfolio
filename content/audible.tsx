// The Audible case study's prose: the opening, the glance card, the ship rule's introduction with
// the sentences around its Figure, why so many recommendations were adopted, the tool I built and
// its two timings, the AI tools, the method (the part a reader sees at once, and the three rows one
// click deeper), the limits, the links and the close. Each export is a server part without its own
// heading, so the page decides the outline and the anchors (src/components/audible/AudiblePage.tsx).
//
// Every figure is a <Fact> from the profile facts; the rest is plain words. The tests behind these
// figures are confidential, so the page shows no result of any of them: the interactive example uses
// a made-up product with made-up metric names. Each limit is said once near the top or beside its
// exhibit and once under Limits.
import type { ReactNode } from 'react';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import { Fact } from '@/components/kit/Fact';
import { Stat } from '@/components/kit/Stat';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT } from '@/lib/site';
import { HOME_LINKS } from './home-destinations.ts';

const ITEM = 'mt-4 first:mt-0';

/** The opening under the page title: what I did, in plain words, and who decided. */
export function AudibleIntro(): ReactNode {
  return (
    <p>
      For nearly two years as a working student at Audible I helped teams decide which changes to the website and app
      should stay. I contributed to the A/B tests, did the sample-size planning and the significance testing myself,
      and wrote a recommendation from each analysis; my manager made the decision.
    </p>
  );
}

/** A word around a pull figure ("about", "min"), set smaller than the figure, as in the Home proof band. */
const Unit = ({ children }: { children: string }) => <span data-proof-unit="">{children}</span>;

/**
 * The 20-second top of the page: three pull figures, one sentence on what the work was, then the
 * facts. The adoption figure carries the link to its context, small, on its own line under the label
 * (a full touch target, since it stands alone). The test count and the markets never share a line.
 */
export const AUDIBLE_GLANCE: GlanceParts = {
  points: [
    {
      id: 'tests',
      figure: <Fact id="profile.audible.experiments" />,
      label: 'A/B tests across web and mobile',
    },
    {
      id: 'adopted',
      figure: <Fact id="profile.audible.recommendations_adopted" />,
      label: (
        <>
          recommendations adopted{' '}
          <span className="block text-sm">
            <TextLink href="#why-so-many" standalone>
              Why so many?
            </TextLink>
          </span>
        </>
      ),
    },
    {
      id: 'setup',
      figure: (
        <>
          <Unit>about </Unit>
          <Fact id="profile.audible.setup_minutes_after" />
          <Unit> min</Unit>
        </>
      ),
      label: (
        <>
          to set up a test account, down from about <Fact id="profile.audible.setup_minutes_before" />, with a tool I
          built
        </>
      ),
    },
  ],
  outcome:
    'Each test needed a plan before it started and a recommendation when it ended: roll the change out permanently, or not.',
  when: 'Aug 2023 to Apr 2025.',
  role: 'Working student. I recommended; my manager decided.',
  methods:
    'Primary, secondary and guardrail metrics per team, sample-size and duration planning, significance testing, SQL segmentation.',
  tools: "Amazon's internal experimentation platforms, SQL, Excel, Tableau as a data source, Tampermonkey with a step recorder.",
  scope: 'Method and role. The results are confidential.',
};

/** The ship rule's introduction, before its Figure: the made-up product, and what a guardrail is. */
export function AudibleShipRule(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Chapter Club is a reading-club product I made up for this example. Its main metric is session completion, and its
        guardrail is help requests, where a rise is bad. A guardrail is a metric that must not get worse for a change to
        ship, even when the main metric improves.
      </p>
      <p className={ITEM}>This illustrates the general approach; teams also allowed neutral results with guardrails intact.</p>
    </>
  );
}

/** The sentence above the ship-rule Figure (what to look at) and the one below it (what it means). */
export const AUDIBLE_SHIP_LEAD_IN =
  'A change ships when the main number goes up and the safety number does not get worse. Move the ends of the two ranges and watch the call change.';
export const AUDIBLE_SHIP_TAKEAWAY =
  'The call follows from where the ranges fall, by a rule fixed in advance, not from how anyone feels about the change.';

/** The context of the adoption figure: the three reasons it is high. */
export function AudibleWhySoMany(): ReactNode {
  const reasons: readonly [title: string, body: string][] = [
    [
      'Strong bets.',
      'Most tests were machine-learning personalisation or carousel ordering, for habituated and not yet habituated members, against baselines without personalisation.',
    ],
    ['Vetted ideas.', 'Ideas reached a test through a pre-vetted, iterative pipeline in a mature team.'],
    [
      'A ship rule that allowed neutral results.',
      'A change could roll out with a neutral primary metric when the guardrails held and there was a product reason.',
    ],
  ];
  return (
    <>
      <p>
        Of my recommendations from <Fact id="profile.audible.experiments" /> tests,{' '}
        <Fact id="profile.audible.recommendations_adopted" /> were adopted, which means rolled out permanently. That is
        not a win rate. Three things explain it.
      </p>
      <ul className="mt-4 list-disc pl-6">
        {reasons.map(([title, body]) => (
          <li key={title} className="mt-2 first:mt-0">
            <strong className="font-semibold">{title}</strong> {body}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The test-account automation tool: what it was and what it cut. */
export function AudibleAutomation(): ReactNode {
  return (
    <p>
      Setting up a test account by hand took about <Fact id="profile.audible.setup_minutes_before" /> minutes. I noticed
      the bottleneck myself and built a tool for it: Tampermonkey with a step recorder. It cut the setup to about{' '}
      <Fact id="profile.audible.setup_minutes_after" /> minutes, about <Fact id="profile.audible.setup_time_cut" /> less.
    </p>
  );
}

/**
 * The two timings as two large figures, side by side from sm. They are my own approximate timings, so
 * the source lines say that, and where the tool was adopted; nothing here is drawn from data.
 */
export function AudibleSetupStats(): ReactNode {
  return (
    <div role="group" aria-label="Test-account setup time, by hand and with the tool" className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
      <Stat
        value={
          <>
            <Unit>about </Unit>
            <Fact id="profile.audible.setup_minutes_before" />
            <Unit> min</Unit>
          </>
        }
        label="by hand"
        source="My own timings, approximate."
      />
      <Stat
        value={
          <>
            <Unit>about </Unit>
            <Fact id="profile.audible.setup_minutes_after" />
            <Unit> min</Unit>
          </>
        }
        label="with the tool"
        source={
          <>
            Adopted team-wide, across <Fact id="profile.audible.markets" /> markets.
          </>
        }
      />
    </div>
  );
}

/** How the team came to use the tool. */
export function AudibleAdoption(): ReactNode {
  return (
    <p>
      To help the team adopt it, I wrote a guide to installing and using it, held a Q&amp;A meeting with stakeholders, and
      recorded a video showing how to use it. I have no usage count for it.
    </p>
  );
}

/**
 * The AI tools for the team. Two separate statements in two paragraphs: the evaluation, and the tools
 * I built. Nothing here says where the tools ran, and there is no figure for them.
 */
export function AudibleAiTools(): ReactNode {
  return (
    <>
      <p className={ITEM}>I evaluated Amazon Bedrock for team-efficiency use cases.</p>
      <p className={ITEM}>
        I also built internal AI tools that the wider team adopted. One reviews past A/B tests and their results and
        suggests new test ideas. The other generates the standard content of the Jira ticket for a test launch: the
        hypothesis, the metrics and the standard fields. I have no usage or time-saving figures for them.
      </p>
    </>
  );
}

/** The method a reader sees at once: my own planning and testing, and the consent-aware SQL work. */
export function AudibleMethod(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Before a test started, I planned its sample size and how long it had to run. When it ended, I did the
        significance testing and read the result against the metrics of the team that ran it.
      </p>
      <p className={ITEM}>
        I also contributed to CRM-driven personalisation for opted-in and opted-out members on the Home and Discovery
        pages, and wrote the SQL segmentation queries within the consent rules of the Digital Markets Act (DMA).
      </p>
    </>
  );
}

/** One click deeper: the teams, the teams' metric frameworks and the recommendation. */
export function AudibleTeams(): ReactNode {
  return (
    <>
      <p>
        Over my time there I worked with <Fact id="profile.audible.teams" /> teams, one after another as the teams were
        reorganised: Onsite &amp; App Experience, Early Engagement and Emerging Member Experience.
      </p>
      <p>
        The metric frameworks were the teams&apos; own. In Onsite &amp; App Experience, revenue was the primary metric and
        listening minutes the secondary one; in Early Engagement it was the other way round. Both used churn and
        incremental long-term value (ILTV) as guardrails: metrics that must not get worse.
      </p>
      <p>From the analysis I made a recommendation, and my manager signed off on the decision.</p>
    </>
  );
}

/** One click deeper: how the work and this page were checked. */
export function AudibleChecks(): ReactNode {
  return (
    <ul className="list-disc pl-6">
      <li className="mt-2 first:mt-0">
        I did the sample-size and duration planning before each test and the significance testing after it myself.
      </li>
      <li className="mt-2 first:mt-0">I set up tests as well as analysing them.</li>
      <li className="mt-2 first:mt-0">
        The ship rule on this page is unit-tested: every combination of bounds gives exactly one of the four calls, and
        the bounds at zero and at the guardrail limit fall on the stated side.
      </li>
    </ul>
  );
}

/** One click deeper: where the tests ran, and why no result of theirs is on this page. */
export function AudibleData(): ReactNode {
  return (
    <p>
      The tests ran on Amazon&apos;s internal experimentation platforms, in the Audible app and on the website. Their
      results are not public, so the example on this page uses a made-up product.
    </p>
  );
}

/** What this page cannot show. */
export function AudibleLimits(): ReactNode {
  const limits: readonly [key: string, body: string][] = [
    ['confidential', 'The results of these tests are confidential, so I cannot publish their effect sizes.'],
    [
      'not-a-win-rate',
      'The adoption count is not a win rate, and it does not represent all test ideas: the ideas were vetted before they reached a test, and a recommendation not to roll out is not counted.',
    ],
    [
      'simplified',
      'The ship rule on this page is simplified. You type the interval bounds in; nothing is estimated from observations, and a neutral result here needs no product reason.',
    ],
    ['approximate', 'The automation timings are approximate, as I reported them.'],
  ];
  return (
    <ul className="list-disc pl-6">
      {limits.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

/** Sources and links: where to read on, one link per line. */
export function AudibleLinks(): ReactNode {
  return (
    <ul>
      <li>
        <TextLink href={HOME_LINKS.retention} standalone>
          Customer retention and reactivation analysis, another case study
        </TextLink>
      </li>
      <li>
        <TextLink href={CONTACT.linkedin} standalone external>
          My LinkedIn profile
        </TextLink>
      </li>
    </ul>
  );
}

/** The close: what the page shows about how I work. */
export function AudibleClose(): ReactNode {
  return (
    <p>
      I plan before I test, separate my recommendation from the decision, and say plainly why a high adoption count is
      not a win rate.
    </p>
  );
}
