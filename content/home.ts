// The Home page's content as data: the hero, the proof row, the two tracks (featured case studies and
// automation cards), "How I test", the questions, the tools band, the site band and the FAQ, plus
// the headline text helper.
// Prose with a figure is a list of parts: plain text, or `{ fact }` for a number that is printed from
// the facts data, never typed. The group A and B card headlines are frozen with the experiment
// (content/experiment/headlines.ts) and only re-exported here.
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module. Site links come from content/home-destinations.ts.
import { factText } from '../src/lib/facts/text.ts';
import { HEADLINES, type CardHeadlines, type HeadlinePart } from './experiment/headlines.ts';
import { HOME_LINKS } from './home-destinations.ts';
import { languagesSentence } from './languages.ts';

export { HEADLINES };
export type { HeadlinePart };

/** The three featured studies; the experiment varies only their headlines. */
export type Study = CardHeadlines['study'];

/** Parts as one string: plain text as written, each fact printed the way <Fact> prints it. */
export function headlineText(parts: readonly HeadlinePart[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : factText(part.fact))).join('');
}

/**
 * The hero's words, the same for every visitor: the chip, the sub line in three parts around its
 * two inline chips, and the buttons ("Read my CV" to the CV page, "Write to me" to Contact). The h1
 * is the site's line in two tones (HEADLINE in src/lib/site.ts), shared with the footer.
 */
export const HOME_HERO = {
  chip: 'Open to roles in Germany',
  sub: {
    lead: 'Analyst in Berlin with nearly two years of A/B testing at Audible (Amazon). I plan and analyse tests that end in a clear recommendation, and build the ',
    chips: ['Agents', 'Workflows'],
    join: ' and ',
    end: ' that take the manual work out.',
  },
  cv: 'Read my CV',
  contact: 'Write to me',
  /** One muted proof line under the buttons (figures are Facts), then a quiet link to the work. */
  proof: [
    { fact: 'profile.audible.experiments' },
    ' A/B tests at Audible. A tool my team adopted. ',
    { fact: 'profile.n8n.automated_tests' },
    ' automated tests in public code.',
  ] as readonly HeadlinePart[],
  work: 'See the work',
} as const;

/** The hero's sub line as one string, the two chips' words in place. */
export function heroSubText(): string {
  const { lead, chips, join, end } = HOME_HERO.sub;
  return `${lead}${chips[0]}${join}${chips[1]}${end}`;
}

/** Every word the band prints, the caption last. */
export function bandWords(): string[] {
  const { test, agents, recommendation, caption } = HOME_BAND;
  return [
    test.title, test.note, ...test.rows.flatMap((r) => [r.label, r.tag]), ...test.foot,
    agents.title, agents.note, ...agents.steps.flatMap((s) => [s.step, s.note]),
    ...Object.values(recommendation), caption,
  ];
}

/**
 * The band under the hero: the words on its three sheets and the visible caption under it, which
 * says the band is an illustration. No digits anywhere in it.
 */
export const HOME_BAND = {
  test: {
    title: 'Test',
    note: 'two groups, one metric',
    rows: [
      { label: 'A', tag: 'baseline' },
      { label: 'B', tag: 'higher' },
    ],
    foot: ['planned before the start', 'guardrails intact'],
  },
  agents: {
    title: 'Agents',
    note: 'each one checks the last',
    steps: [
      { step: 'Write', note: 'draft' },
      { step: 'Audit', note: 'every figure traced' },
      { step: 'Review', note: 'fresh eyes' },
    ],
  },
  recommendation: {
    title: 'Recommendation',
    note: 'from the evidence',
    verdict: 'Ship it.',
    why: 'Or do not. Either way it is written down, with the reasons.',
    toast: 'checks passed',
  },
  caption: 'An illustration: a test, the agents that check the work, and the recommendation.',
} as const;

/** The anchor of the first track, which the hero's primary button scrolls to. */
export const WORK_ANCHOR = 'work';

/** One proof figure: the side it belongs to, the figure and its caption (figures are fact parts). */
export type ProofItem = {
  id: string;
  side: 'Experiments' | 'Automation';
  figure: readonly HeadlinePart[];
  caption: readonly HeadlinePart[];
  /** The caption ends with the "Why so many?" link. */
  whySoMany?: boolean;
};

/** The proof row, in order. */
export const HOME_PROOF: readonly ProofItem[] = [
  {
    id: 'experiments',
    side: 'Experiments',
    figure: [{ fact: 'profile.audible.experiments' }],
    caption: ['A/B tests I contributed to at Audible, across web and mobile.'],
  },
  {
    id: 'adopted',
    side: 'Experiments',
    figure: [{ fact: 'profile.audible.recommendations_adopted' }],
    caption: ['of my recommendations adopted.'],
    whySoMany: true,
  },
  {
    id: 'setup',
    side: 'Automation',
    figure: ['about ', { fact: 'profile.audible.setup_minutes_after' }, ' min'],
    caption: [
      'to set up a test account, down from about ',
      { fact: 'profile.audible.setup_minutes_before' },
      ', with a tool I built. Adopted team-wide, across ',
      { fact: 'profile.audible.markets' },
      ' markets.',
    ],
  },
  {
    id: 'tests',
    side: 'Automation',
    figure: [{ fact: 'profile.n8n.automated_tests' }],
    caption: ['automated tests behind my workflow library for e-invoice intake.'],
  },
];

/**
 * The experience band under the stack: a small line, then two groups of plain text names. Each
 * group lists the start of an About timeline entry's place; the band prints the timeline's own name.
 */
export const HOME_EXPERIENCE = {
  title: 'Where I have worked and studied',
  groups: [
    { label: 'Work', from: ['Audible', 'Mercor'] },
    { label: 'Study', from: ['University of Europe', 'Jacobs University'] },
  ],
} as const;

/** The text of the "Why so many?" link in the proof row. */
export const WHY_SO_MANY = 'Why so many?';

/** The two tracks' headings and ledes. */
export const HOME_TRACKS = {
  experiments: {
    title: 'Experiments and analytics',
    lede: 'How I plan a test, read it honestly and write the recommendation.',
  },
  automation: {
    title: 'Automation and agents',
    lede: 'Tools I built so that people, including me, stop doing the same thing by hand.',
  },
} as const;

/**
 * The description and meta line of each featured card: the same in both groups, in the order of
 * HEADLINES. `href` is the case study (a same-origin site path).
 */
export const HOME_CASES: readonly {
  study: Study;
  href: string;
  description: readonly HeadlinePart[];
  meta: string;
}[] = [
  {
    study: 'audible',
    href: HOME_LINKS.whySoMany,
    description: ['How I planned and analysed A/B tests at Audible, and why so many of my recommendations were adopted.'],
    meta: 'Sample size, significance testing, 2023 to 2025',
  },
  {
    study: 'retention',
    href: HOME_LINKS.retention,
    description: [
      'Two years of orders from a UK online gift retailer: cohorts, segments and a win-back sample size. Public dataset, rebuilt in 2026.',
    ],
    meta: 'SQL, Python, cohort analysis, 2026',
  },
  {
    study: 'pulse',
    href: HOME_LINKS.pulse,
    description: [
      'An analytics dashboard I designed and built around a ',
      { fact: 'pulse.events.count' },
      '-event taxonomy. A demo, with no real users.',
    ],
    meta: 'Amplitude, React, event taxonomy, 2026',
  },
];

/**
 * The "Automation and agents" cards in display order: the project's name as a small label, and a
 * title that says what it does (a verb and its object; a figure in it is a fact part).
 */
export const HOME_AUTOMATION: readonly {
  id: string;
  label: string;
  title: readonly HeadlinePart[];
  href: string;
  description: readonly HeadlinePart[];
  meta: readonly HeadlinePart[];
}[] = [
  {
    id: 'automation',
    label: 'Test-account automation',
    title: [
      'Set up a test account in about ',
      { fact: 'profile.audible.setup_minutes_after' },
      ' minutes, not ',
      { fact: 'profile.audible.setup_minutes_before' },
    ],
    href: HOME_LINKS.automation,
    description: [
      'Tampermonkey with a step recorder. It cut test-account setup at Audible from about ',
      { fact: 'profile.audible.setup_minutes_before' },
      ' to about ',
      { fact: 'profile.audible.setup_minutes_after' },
      ' minutes and was adopted team-wide.',
    ],
    meta: ['Browser automation, ', { fact: 'profile.audible.markets' }, ' markets'],
  },
  {
    id: 'docproof',
    label: 'Docproof',
    title: ['Let agents write, and let checks decide'],
    href: HOME_LINKS.docproof,
    description: [
      'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
    ],
    meta: ['Multi-agent orchestration, Claude Code'],
  },
  {
    id: 'n8n',
    label: 'n8n workflow library',
    title: ['Check every e-invoice before a person has to'],
    href: HOME_LINKS.n8n,
    description: [
      'E-invoice intake and error alerts as reusable workflows, with ',
      { fact: 'profile.n8n.automated_tests' },
      ' automated tests. A portfolio project, not used by a client.',
    ],
    meta: ['n8n, XRechnung, ZUGFeRD'],
  },
  {
    id: 'marketingws',
    label: 'MarketingWS',
    title: ['Draft marketing copy, with a check for invented figures'],
    href: HOME_LINKS.marketingws,
    description: ["Copy variants for marketing workflows from one brief. The live demo runs on Groq's free tier."],
    meta: ['Python, FastAPI, Groq'],
  },
];

/**
 * The muted line under the experiments track's lede, chosen by the live test's phase: the same words
 * in both groups, and never the other group's headlines. Nothing when the test is paused, stopped,
 * decided or not configured.
 */
export const HOME_CARD_LINE = {
  calibration: 'These three headlines are what the test will compare. For now everyone sees the same ones.',
  ab: 'These three headlines are the test: other visitors see different wording.',
} as const;

/** A section head: the chip, the headline with its quiet clause, and an optional sub. */
export type SectionCopy = { chip: string; title: string; quiet?: string; sub?: string };

/** "How I test": three tabs, each a title and the line it stands for (the old "I test." lines). */
export const HOME_HOW = {
  head: {
    chip: 'How I test',
    title: 'Know what a test',
    quiet: 'really says.',
    sub: 'Three steps before I recommend a change.',
  },
  tabs: [
    { id: 'plan', title: 'Plan', line: 'I plan the sample size and the run time before a test starts.' },
    { id: 'analyse', title: 'Analyse', line: 'I read the result against the primary metric and its guardrails.' },
    { id: 'recommend', title: 'Recommend', line: 'I write the recommendation: ship it, or do not.' },
  ],
} as const satisfies { head: SectionCopy; tabs: readonly { id: string; title: string; line: string }[] };

/** The heads of the two tracks (the ledes stay in HOME_TRACKS, which the Work page reads too). */
export const HOME_EXPERIMENTS_HEAD = {
  chip: 'Experiments and analytics',
  title: 'Open the work',
  quiet: 'and see how it was done.',
  sub: 'Each case study shows the method, the sources and what it cannot tell you.',
} as const satisfies SectionCopy;

export const HOME_AUTOMATION_HEAD = {
  chip: 'Automation and agents',
  title: 'Take the manual steps',
  quiet: "out of your team's week.",
  sub: HOME_TRACKS.automation.lede,
} as const satisfies SectionCopy;

/** The three "I automate." lines, in the ruled row under the automation cards. */
export const HOME_AUTOMATE_LINES = [
  'At Audible I built a browser tool and AI tools that the team adopted.',
  'I build agents that work in steps and check each other.',
  'I put automated tests around my workflows and agent pipelines, so they stay right.',
] as const;

/** The questions rows: two rows of question chips that slide in opposite directions. */
export const HOME_QUESTIONS = {
  head: { chip: 'Questions', title: 'The questions a team asks.', quiet: 'I bring the answers, written down.' },
  rows: [
    ['Is the sample big enough?', 'How long should the test run?', 'Did the guardrails hold?', 'Is the difference real?'],
    ['Should we ship it?', 'Which step can be automated?', "Who checks the agent's work?", 'Will it still work next month?'],
  ],
} as const satisfies { head: SectionCopy; rows: readonly (readonly string[])[] };

/** The tools band's line. */
export const TOOLS_LABEL = 'Tools I have shipped with';

/** The site band: the test on this site is part of the evidence. The Work page reads `title` and `text`. */
export const HOME_SITE = {
  title: 'This site is part of the evidence.',
  text: 'It runs its own pre-registered A/B test on the three experiment cards above. I built it with coding agents, and every change passes its automated checks before it ships.',
  live: 'See the live test',
  lab: 'Try the Lab',
} as const;

/** The site band's head on Home: the same headline in two tones. */
export const HOME_SITE_HEAD = {
  chip: 'Live test',
  title: 'This site is',
  quiet: 'part of the evidence.',
} as const satisfies SectionCopy;

/** The Home FAQ. Answers are parts, so each figure is printed from the facts data. */
export const HOME_FAQ: { head: SectionCopy; items: readonly { question: string; answer: readonly HeadlinePart[] }[] } = {
  head: { chip: 'FAQ', title: 'Questions hiring teams ask', sub: 'Short answers; the pages behind them have the detail.' },
  items: [
    {
      question: 'What roles are you looking for?',
      answer: ['Roles in AI automation, experimentation and product analytics in Germany. I am based in Berlin.'],
    },
    {
      question: 'What did you do at Audible?',
      answer: [
        'I was a working student for nearly two years, mainly in growth experimentation with some marketing analytics. I contributed to ',
        { fact: 'profile.audible.experiments' },
        ' A/B tests across web and mobile, did the sample-size planning and significance testing myself, and built a browser-automation tool, Tampermonkey with a step recorder, that cut test-account setup from about ',
        { fact: 'profile.audible.setup_minutes_before' },
        ' to about ',
        { fact: 'profile.audible.setup_minutes_after' },
        ' minutes.',
      ],
    },
    {
      question: 'Can I see the Audible results?',
      answer: [
        'No. Revenue, conversion and lift figures are confidential, so this site shows none of them. The Audible page explains how I worked, and the Lab shows the statistics on simulated data.',
      ],
    },
    {
      question: 'How do you work with AI?',
      answer: [
        'I build with Claude Code agents and skills. In Docproof, separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. My n8n workflow library has ',
        { fact: 'profile.n8n.automated_tests' },
        ' automated tests.',
      ],
    },
    {
      question: 'Is the code public?',
      answer: ['Yes. Docproof and the n8n workflow library are on GitHub under the MIT licence, and so is the code of this site.'],
    },
    {
      question: 'Which languages do you speak?',
      // From the About page's own list, so the two never disagree.
      answer: [languagesSentence()],
    },
    {
      // The contact form passes each message on to my inbox (the privacy notice says so), so "I answer myself." stays.
      question: 'How do I reach you?',
      answer: ['Through the contact form or on LinkedIn. I answer myself.'],
    },
  ],
};
