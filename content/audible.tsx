// The Audible case study's prose: the opening, the glance card, the ship rule's introduction with
// the sentences around its Figure, why so many recommendations were adopted, the tool I built and
// its two timings, the method (the part a reader sees at once, and the three rows one click deeper),
// the limits, the links and the close. Each part is a server part without its own heading, so the
// page decides the outline and the anchors (src/components/audible/AudiblePage.tsx).
//
// Every figure is a <Fact> from the profile facts; the rest is plain words. The tests behind these
// figures are confidential, so the page shows no result of any of them: the interactive example uses
// a made-up product with made-up metric names. Each limit is said once near the top or beside its
// exhibit and once under Limits.
//
// The words are an `AudibleCopy`: AUDIBLE_EN here, the German twin in content/de/audible.tsx typed by
// the same type, so a missing key fails the typecheck. A sentence with numbers is a `Sentence` whose
// slots hold the numbers as elements (a <Fact> in the page's language), so the German sentence can put
// them where its grammar wants them. `blocks` turns a copy into the page's parts: the structure (the
// paragraphs, the lists, the links) is drawn once, from the copy's words. Server only: the ship-rule
// island gets its own words as props (src/lib/audible/text.ts).
import type { ReactNode } from 'react';
import { GLANCE_LABELS_EN, type GlanceLabels, type GlanceParts } from '@/components/depth/GlanceBlock';
import { Fact } from '@/components/kit/Fact';
import { Stat } from '@/components/kit/Stat';
import { TextLink } from '@/components/kit/TextLink';
import { EN_FRAMEWORK, type FrameworkText } from '@/lib/audible/text';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { sentenceNodes, slot, type Sentence } from '@/lib/retention/sentence';
import { CONTACT } from '@/lib/site';
import { HOME_LINKS } from './home-destinations.ts';
import { HOME_SITE } from './home.ts';
import type { FRAME_DE } from './de/frame';

const ITEM = 'mt-4 first:mt-0';

/** The anchor ids of the page's sections, in page order. */
export const AUDIBLE_SECTION_IDS = ['ship-rule', 'why-so-many', 'automation', 'method', 'limits', 'sources'] as const;
export type AudibleSectionId = (typeof AUDIBLE_SECTION_IDS)[number];

/** The numbers the sentences print, as elements in the page's language, and the page's link mapper. */
export type Slots = {
  tests: ReactNode;
  adopted: ReactNode;
  before: ReactNode;
  after: ReactNode;
  cut: ReactNode;
  markets: ReactNode;
  teams: ReactNode;
  href: (path: string) => string;
};

type FactName =
  | 'experiments'
  | 'recommendations_adopted'
  | 'setup_minutes_before'
  | 'setup_minutes_after'
  | 'setup_time_cut'
  | 'markets'
  | 'teams';

export function slotsFor(locale: Locale): Slots {
  const fact = (id: FactName) => <Fact id={`profile.audible.${id}`} locale={locale} />;
  return {
    tests: fact('experiments'),
    adopted: fact('recommendations_adopted'),
    before: fact('setup_minutes_before'),
    after: fact('setup_minutes_after'),
    cut: fact('setup_time_cut'),
    markets: fact('markets'),
    teams: fact('teams'),
    href: (path) => localHref(locale, path),
  };
}

export type AudibleCopy = {
  chip: string;
  /** The h1's words after the test count, and its quiet clause. */
  head: { lead: string; quiet: string };
  ask: string;
  intro: string;
  glanceLabels: GlanceLabels;
  glance: {
    tests: string;
    adopted: string;
    whySoMany: string;
    /** The label of the setup figure. Slot: before. */
    setup: Sentence;
    /** A word around a pull figure, set smaller than the figure. */
    units: { about: string; minutes: string; min: string };
    outcome: string;
    when: string;
    role: string;
    methods: string;
    tools: string;
    scope: string;
  };
  sections: Record<AudibleSectionId, { title: string; link: string }>;
  shipRule: readonly [string, string];
  shipLeadIn: string;
  shipTakeaway: string;
  /** Slots: tests, adopted. */
  whySoMany: { lead: Sentence; reasons: readonly (readonly [title: string, body: string])[] };
  /** Slots: before, after, cut. */
  automation: Sentence;
  setup: {
    group: string;
    byHand: string;
    byHandSource: string;
    withTool: string;
    /** Slot: markets. */
    withToolSource: Sentence;
  };
  adoption: string;
  method: string;
  summaries: { teams: string; checked: string; data: string };
  /** Slot: teams. */
  teamsFirst: Sentence;
  teamsRest: readonly [string, string];
  checks: readonly [string, string, string];
  data: string;
  limits: readonly (readonly [key: string, body: string])[];
  links: { retention: string; linkedin: string };
  close: string;
  closeLinks: { lab: string; live: string };
  next: { label: string; kicker?: string };
  /** The frame parts' labels; empty in English, where each part's own default applies. */
  frame: Partial<typeof FRAME_DE>;
  framework: FrameworkText;
};

export const AUDIBLE_EN: AudibleCopy = {
  chip: 'Case study',
  head: { lead: 'A/B tests at Audible (Amazon)', quiet: 'from the plan to the recommendation.' },
  ask: 'Ask me about this work',
  intro:
    'For nearly two years as a working student at Audible I helped teams decide which changes to the website and app should stay. I contributed to the A/B tests, did the sample-size planning and the significance testing myself, and wrote a recommendation from each analysis; my manager made the decision.',
  glanceLabels: GLANCE_LABELS_EN,
  glance: {
    tests: 'A/B tests across web and mobile',
    adopted: 'recommendations adopted',
    whySoMany: 'Why so many?',
    setup: ['to set up a test account, down from about ', slot('before'), ', with a tool I built'],
    units: { about: 'about ', minutes: ' minutes', min: ' min' },
    outcome:
      'Each test needed a plan before it started and a recommendation when it ended: roll the change out permanently, or not.',
    when: 'Aug 2023 to Apr 2025.',
    role: 'Working student. I recommended; my manager decided.',
    methods:
      'Primary, secondary and guardrail metrics per team, sample-size and duration planning, significance testing, SQL segmentation.',
    tools: "Amazon's internal experimentation platforms, SQL, Excel, Tableau as a data source, Tampermonkey with a step recorder.",
    scope: 'Method and role. The results are confidential.',
  },
  sections: {
    'ship-rule': { title: 'When to ship: try the rule yourself', link: 'When to ship' },
    'why-so-many': { title: 'Why so many were adopted', link: 'Why so many?' },
    automation: { title: 'Test-account automation', link: 'Automation' },
    method: { title: 'Method', link: 'Method' },
    limits: { title: 'Limits', link: 'Limits' },
    sources: { title: 'Sources and links', link: 'Sources' },
  },
  shipRule: [
    'Chapter Club is a reading-club product I made up for this example. Its main metric is session completion, and its guardrail is help requests, where a rise is bad. A guardrail is a metric that must not get worse for a change to ship, even when the main metric improves.',
    'This illustrates the general approach; teams also allowed neutral results with guardrails intact.',
  ],
  shipLeadIn:
    'A change ships when the main number goes up and the safety number does not get worse. Move the ends of the two ranges and watch the call change.',
  shipTakeaway:
    'The call follows from where the ranges fall, by a rule fixed in advance, not from how anyone feels about the change.',
  whySoMany: {
    lead: [
      'Of my recommendations from ',
      slot('tests'),
      ' tests,',
      ' ',
      slot('adopted'),
      ' were adopted, which means rolled out permanently. That is not a win rate. Three things explain it.',
    ],
    reasons: [
      [
        'Strong bets.',
        'Many tests were machine-learning personalisation or carousel ordering, for habituated and not yet habituated members, against baselines without personalisation.',
      ],
      ['Vetted ideas.', 'Ideas reached a test through a pre-vetted, iterative pipeline in a mature team.'],
      [
        'A ship rule that allowed neutral results.',
        'A change could roll out with a neutral primary metric when the guardrails held and there was a product reason.',
      ],
    ],
  },
  automation: [
    'Setting up a test account by hand took about ',
    slot('before'),
    ' minutes. I noticed the bottleneck myself and built a tool for it: Tampermonkey with a step recorder. It cut the setup to about',
    ' ',
    slot('after'),
    ' minutes, about ',
    slot('cut'),
    ' less.',
  ],
  setup: {
    group: 'Test-account setup time, by hand and with the tool',
    byHand: 'by hand',
    byHandSource: 'My own timings, approximate.',
    withTool: 'with the tool',
    withToolSource: ['Adopted team-wide, across ', slot('markets'), ' markets.'],
  },
  adoption:
    'To help the team adopt it, I wrote a guide to installing and using it, held a Q&A meeting with stakeholders, and recorded a video showing how to use it. I have no usage count for it.',
  method:
    'Before a test started, I planned its sample size and how long it had to run. When it ended, I did the significance testing and read the result against the metrics of the team that ran it.',
  summaries: { teams: 'The teams and their metrics', checked: 'How I checked this', data: 'Why there are no results here' },
  teamsFirst: [
    'Over my time there I worked with ',
    slot('teams'),
    ' teams, one after another as the teams were reorganised: Onsite & App Experience, Early Engagement and Emerging Member Experience.',
  ],
  teamsRest: [
    "The metric frameworks were the teams' own. In Onsite & App Experience, revenue was the primary metric and listening minutes the secondary one; in Early Engagement it was the other way round. Both used churn and incremental long-term value (ILTV) as guardrails: metrics that must not get worse.",
    'From the analysis I made a recommendation, and my manager signed off on the decision.',
  ],
  checks: [
    'I did the sample-size and duration planning before each test and the significance testing after it myself.',
    'I set up tests as well as analysing them.',
    'The ship rule on this page is unit-tested: every combination of bounds gives exactly one of the four calls, and the bounds at zero and at the guardrail limit fall on the stated side.',
  ],
  data: "The tests ran on Amazon's internal experimentation platforms, in the Audible app and on the website. Their results are not public, so the example on this page uses a made-up product.",
  limits: [
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
  ],
  links: { retention: 'Customer retention and reactivation analysis, another case study', linkedin: 'My LinkedIn profile' },
  close:
    'I plan before I test, separate my recommendation from the decision, and say plainly why a high adoption count is not a win rate.',
  closeLinks: { lab: HOME_SITE.lab, live: HOME_SITE.live },
  next: { label: 'Retention' },
  frame: {},
  framework: EN_FRAMEWORK,
};

/** A word around a pull figure ("about", "min"), set smaller than the figure, as in the Home proof band. */
const Unit = ({ children }: { children: string }) => <span data-proof-unit="">{children}</span>;

/**
 * The page's parts, drawn once from a copy. Each is a server part without its own heading. The
 * adoption figure carries the link to its context, small, on its own line under the label (a full
 * touch target, since it stands alone). The test count and the markets never share a line.
 */
export function blocks(c: AudibleCopy, s: Slots) {
  const g = c.glance;
  const { href, ...numbers } = s;
  const nodes = (sentence: Sentence): ReactNode => sentenceNodes(sentence, numbers);
  return {
    intro: (): ReactNode => <p>{c.intro}</p>,

    /** The 20-second top of the page: three pull figures, one sentence, then the facts. */
    glance: (): GlanceParts => ({
      points: [
        { id: 'tests', figure: s.tests, label: g.tests },
        {
          id: 'adopted',
          figure: s.adopted,
          label: (
            <>
              {g.adopted}{' '}
              <span className="block text-sm">
                <TextLink href="#why-so-many" standalone>
                  {g.whySoMany}
                </TextLink>
              </span>
            </>
          ),
        },
        {
          id: 'setup',
          figure: (
            <>
              <Unit>{g.units.about}</Unit>
              {s.after}
              <Unit>{g.units.minutes}</Unit>
            </>
          ),
          label: nodes(g.setup),
        },
      ],
      outcome: g.outcome,
      when: g.when,
      role: g.role,
      methods: g.methods,
      tools: g.tools,
      scope: g.scope,
    }),

    /** The ship rule's introduction, before its Figure: the made-up product, and what a guardrail is. */
    shipRule: (): ReactNode => (
      <>
        <p className={ITEM}>{c.shipRule[0]}</p>
        <p className={ITEM}>{c.shipRule[1]}</p>
      </>
    ),

    /** The context of the adoption figure: the three reasons it is high. */
    whySoMany: (): ReactNode => (
      <>
        <p>{nodes(c.whySoMany.lead)}</p>
        <ul className="mt-4 list-disc pl-6">
          {c.whySoMany.reasons.map(([title, body]) => (
            <li key={title} className="mt-2 first:mt-0">
              <strong className="font-semibold">{title}</strong> {body}
            </li>
          ))}
        </ul>
      </>
    ),

    /** The test-account automation tool: what it was and what it cut. */
    automation: (): ReactNode => <p>{nodes(c.automation)}</p>,

    /**
     * The two timings as two large figures, side by side from sm. They are my own approximate timings, so
     * the source lines say that, and where the tool was adopted; nothing here is drawn from data.
     */
    setupStats: (): ReactNode => (
      <div role="group" aria-label={c.setup.group} className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8">
        <Stat
          value={
            <>
              <Unit>{g.units.about}</Unit>
              {s.before}
              <Unit>{g.units.min}</Unit>
            </>
          }
          label={c.setup.byHand}
          source={c.setup.byHandSource}
        />
        <Stat
          value={
            <>
              <Unit>{g.units.about}</Unit>
              {s.after}
              <Unit>{g.units.min}</Unit>
            </>
          }
          label={c.setup.withTool}
          source={nodes(c.setup.withToolSource)}
        />
      </div>
    ),

    /** How the team came to use the tool. */
    adoption: (): ReactNode => <p>{c.adoption}</p>,

    /** The method a reader sees at once: my own planning and testing. */
    method: (): ReactNode => <p>{c.method}</p>,

    /** One click deeper: the teams, the teams' metric frameworks and the recommendation. */
    teams: (): ReactNode => (
      <>
        <p>{nodes(c.teamsFirst)}</p>
        <p>{c.teamsRest[0]}</p>
        <p>{c.teamsRest[1]}</p>
      </>
    ),

    /** One click deeper: how the work and this page were checked. */
    checks: (): ReactNode => (
      <ul className="list-disc pl-6">
        {c.checks.map((body) => (
          <li key={body} className="mt-2 first:mt-0">
            {body}
          </li>
        ))}
      </ul>
    ),

    /** One click deeper: where the tests ran, and why no result of theirs is on this page. */
    data: (): ReactNode => <p>{c.data}</p>,

    /** What this page cannot show. */
    limits: (): ReactNode => (
      <ul className="list-disc pl-6">
        {c.limits.map(([key, body]) => (
          <li key={key} className="mt-2 first:mt-0">
            {body}
          </li>
        ))}
      </ul>
    ),

    /** Sources and links: where to read on, one link per line. */
    links: (): ReactNode => (
      <ul>
        <li>
          <TextLink href={href(HOME_LINKS.retention)} standalone>
            {c.links.retention}
          </TextLink>
        </li>
        <li>
          <TextLink href={CONTACT.linkedin} standalone external>
            {c.links.linkedin}
          </TextLink>
        </li>
      </ul>
    ),

    /** The close: what the page shows about how I work. */
    close: (): ReactNode => <p>{c.close}</p>,
  };
}
