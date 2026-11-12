// The Audible method page's prose: the intro, the summary, the problem, the data, the method, the
// ship rule's introduction, why so many recommendations were adopted, the automation tool, the
// findings, how I checked this, the limits and the links. Each export is a server section without its
// own heading, so the page decides the outline and the anchors (src/components/audible/AudiblePage.tsx).
//
// Every figure is a <Fact> from the profile facts; the rest is plain words. The tests behind these
// figures are confidential, so the page shows no result of any of them: the interactive example uses
// a made-up product with made-up metric names.
import type { ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT } from '@/lib/site';
import { HOME_LINKS } from './home-destinations.ts';

const ITEM = 'mt-4 first:mt-0';

/** The "Why so many?" link beside a short adoption figure, to the section that gives its context. */
const WhySoMany = () => <TextLink href="#why-so-many">Why so many?</TextLink>;

/** The line under the page title. */
export function AudibleIntro(): ReactNode {
  return (
    <p>
      Experimentation at Audible (Amazon), where I was a working student for nearly two years: how I plan and analyse
      experiments, and why so many of my recommendations were adopted.
    </p>
  );
}

/** The summary box: question, my role, method, result, decision, next step. */
export function AudibleSummary(): ReactNode {
  const items: readonly [label: string, body: ReactNode][] = [
    ['Question', <>Which changes to the Audible website and app should be rolled out permanently?</>],
    [
      'My role',
      <>
        A working student in marketing analytics and growth experimentation, mainly growth experimentation. I
        contributed to <Fact id="profile.audible.experiments" /> A/B tests across web and mobile, from the hypothesis to
        a recommendation, and worked with <Fact id="profile.audible.teams" /> teams over my time there, one after
        another.
      </>,
    ],
    [
      'Method',
      <>
        Each test was read against its team&apos;s metrics, with a primary metric and guardrails. I did the sample-size
        and duration planning before a test started and the significance testing when it ended.
      </>,
    ],
    [
      'Result',
      <>
        Of my recommendations from those tests, <Fact id="profile.audible.recommendations_adopted" /> were adopted, which
        means rolled out permanently. <WhySoMany />
      </>,
    ],
    ['Decision', <>I made each recommendation from the analysis; my manager signed off.</>],
    [
      'Next step',
      <>
        Below: the ship rule on a made-up product, why so many recommendations were adopted, and the tool I built for
        test-account setup.
      </>,
    ],
  ];
  return (
    <dl>
      {items.map(([label, body]) => (
        <div key={label} className={ITEM}>
          <dt className="font-semibold">{label}</dt>
          <dd className="mt-1">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What the tests were for. */
export function AudibleProblem(): ReactNode {
  return (
    <p>
      Teams at Audible tested changes to the website and the app before rolling them out to members. Each test needed a
      plan before it started and a recommendation when it ended: roll the change out permanently, or not.
    </p>
  );
}

/** Where the tests ran, and why no result of theirs is on this page. */
export function AudibleData(): ReactNode {
  return (
    <p>
      The tests ran on Amazon&apos;s internal experimentation platforms, in the Audible app and on the website. Their
      results are not public, so the example on this page uses a made-up product.
    </p>
  );
}

/** The teams, the planning and analysis, the teams' metric frameworks and the recommendation. */
export function AudibleMethod(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Over my time there I worked with <Fact id="profile.audible.teams" /> teams, one after another as the teams were
        reorganised: Onsite &amp; App Experience, Early Engagement and Emerging Member Experience.
      </p>
      <p className={ITEM}>
        Before a test started, I planned its sample size and how long it had to run. When it ended, I did the
        significance testing and read the result against the metrics of the team that ran it.
      </p>
      <p className={ITEM}>
        The metric frameworks were the teams&apos; own. In Onsite &amp; App Experience, revenue was the primary metric and
        listening minutes the secondary one; in Early Engagement it was the other way round. Both used churn and
        incremental long-term value (ILTV) as guardrails: metrics that must not get worse.
      </p>
      <p className={ITEM}>From the analysis I made a recommendation, and my manager signed off on the decision.</p>
    </>
  );
}

/** The ship rule's introduction, before its Figure. */
export function AudibleShipRule(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Chapter Club is a reading-club product I made up for this example. Its main metric is session completion, and its
        guardrail is help requests, where a rise is bad. You set the ends of each interval yourself: nothing is
        estimated from observations.
      </p>
      <p className={ITEM}>This illustrates the general approach; teams also allowed neutral results with guardrails intact.</p>
    </>
  );
}

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
        not a win rate, and three things made it high.
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

/** The test-account automation tool: what it cut, and how the team adopted it. */
export function AudibleAutomation(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Setting up a test account by hand took about <Fact id="profile.audible.setup_minutes_before" /> minutes. I noticed
        the bottleneck myself and built a tool for it: Tampermonkey with a step recorder. It cut the setup to about{' '}
        <Fact id="profile.audible.setup_minutes_after" /> minutes, about <Fact id="profile.audible.setup_time_cut" /> less,
        across <Fact id="profile.audible.markets" /> markets.
      </p>
      <p className={ITEM}>
        To help the team adopt it, I wrote a guide to installing and using it, held a Q&amp;A meeting with stakeholders, and
        recorded a video showing how to use it. It was adopted team-wide. I did not track its usage, so there is
        no count of users.
      </p>
    </>
  );
}

/** What the work shows, without any result of a test. */
export function AudibleFindings(): ReactNode {
  return (
    <ul className="list-disc pl-6">
      <li className="mt-2 first:mt-0">
        Adoption says more about how tests were chosen and when a change could ship than about a win rate: most were
        strong bets against plain baselines, the ideas were vetted before they were tested, and a neutral result could
        ship with guardrails intact.
      </li>
      <li className="mt-2 first:mt-0">
        The tool I owned outright changed the team&apos;s own workflow, not a product: test-account setup went from about{' '}
        <Fact id="profile.audible.setup_minutes_before" /> to about <Fact id="profile.audible.setup_minutes_after" />{' '}
        minutes, and it was adopted team-wide.
      </li>
    </ul>
  );
}

/** How the work and this page were checked. */
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
    [
      'approximate',
      'The automation timings are approximate, as I reported them, and the before and after chart is a reconstruction from them, not measured data.',
    ],
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
