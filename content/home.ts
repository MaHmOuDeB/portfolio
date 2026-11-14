// The Home page's content as data: the hero, the proof row, the two tracks (featured case studies and
// automation cards), the tiles, the site tile and the decision band, plus the headline text helper.
// Prose with a figure is a list of parts: plain text, or `{ fact }` for a number that is printed from
// the facts data, never typed. The group A and B card headlines are frozen with the experiment
// (content/experiment/headlines.ts) and only re-exported here.
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module. Site links come from content/home-destinations.ts.
import { factText } from '../src/lib/facts/text.ts';
import { HEADLINES, type CardHeadlines, type HeadlinePart } from './experiment/headlines.ts';
import { HOME_LINKS } from './home-destinations.ts';

export { HEADLINES };
export type { HeadlinePart };

/** The three featured studies; the experiment varies only their headlines. */
export type Study = CardHeadlines['study'];

/** Parts as one string: plain text as written, each fact printed the way <Fact> prints it. */
export function headlineText(parts: readonly HeadlinePart[]): string {
  return parts.map((part) => (typeof part === 'string' ? part : factText(part.fact))).join('');
}

/**
 * The hero's words, the same for every visitor. The buttons are "See the evidence" (to the first
 * track), the CV page and the contact page.
 */
export const HOME_HERO = {
  title: 'I test what works, and automate the rest.',
  sub: 'Analyst in Berlin for experimentation and AI automation. Nearly two years of A/B testing at Audible (Amazon), and I build agents and workflows that take over repetitive manual steps.',
  evidence: 'See the evidence',
  cv: 'CV',
  contact: 'Contact',
  /** The visible caption under the evidence field: the field is an illustration, not data. */
  fieldCaption: 'An illustration: a confidence band narrows as views grow.',
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
      ', with a tool I built. Used across ',
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

/** The "Automation and agents" cards in display order. */
export const HOME_AUTOMATION: readonly {
  id: string;
  title: string;
  href: string;
  description: readonly HeadlinePart[];
  meta: readonly HeadlinePart[];
}[] = [
  {
    id: 'automation',
    title: 'Test-account automation',
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
    title: 'Docproof',
    href: HOME_LINKS.docproof,
    description: [
      'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
    ],
    meta: ['Multi-agent orchestration, Claude Code'],
  },
  {
    id: 'n8n',
    title: 'n8n workflow library',
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
    title: 'MarketingWS',
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

/** The two tiles. */
export const HOME_TILES = {
  test: {
    title: 'I test.',
    lines: [
      'I plan the sample size and the run time before a test starts.',
      'I read the result against the primary metric and its guardrails.',
      'I write the recommendation: ship it, or do not.',
    ],
  },
  automate: {
    title: 'I automate.',
    lines: [
      'I turn repeated manual steps into tools a whole team can use.',
      'I build agents that work in steps and check each other.',
      'I put automated tests around my workflows and agent pipelines, so they stay right.',
    ],
  },
} as const;

/** The tools ribbon's label. */
export const TOOLS_LABEL = 'Tools I have shipped with';

/** The site tile: the test on this site is part of the evidence. */
export const HOME_SITE = {
  title: 'This site is part of the evidence.',
  text: 'It runs its own pre-registered A/B test on the three experiment cards above. I built it with coding agents, and every change passes its automated checks before it ships.',
  live: 'See the live test',
  lab: 'Try the Lab',
} as const;

/** The decision band. */
export const HOME_DECISION = {
  title: 'Your call.',
  text: 'Open to roles in AI automation, experimentation and product analytics in Germany. Based in Berlin.',
  write: 'Write to me',
  cv: 'Read my CV',
  linkedin: 'LinkedIn',
} as const;
