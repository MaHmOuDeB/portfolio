// The Home page's content as data: the three featured case studies, the tools I have built and the
// headline text helper. Prose with a figure is a list of parts: plain text, or `{ fact }` for a
// number that is printed from the facts data, never typed. The group A and B card headlines are
// frozen with the experiment (content/experiment/headlines.ts) and only re-exported here.
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
 * The hero's lines, the same for every visitor. `role` is the site's role line; `place` names the
 * city and the degree; `proof` is followed by the "Why so many?" link to the adoption context.
 */
export const HOME_HERO: {
  readonly role: string;
  readonly place: string;
  readonly proof: readonly HeadlinePart[];
  readonly whySoMany: string;
  readonly lab: string;
  readonly linkedin: string;
} = {
  role: 'Experimentation & growth analyst',
  place: 'Berlin, MSc Data Science',
  proof: [
    'Nearly two years at Audible (Amazon): ',
    { fact: 'profile.audible.experiments' },
    ' A/B tests across web and mobile, ',
    { fact: 'profile.audible.recommendations_adopted' },
    ' recommendations adopted.',
  ],
  whySoMany: 'Why so many?',
  lab: 'Try the lab',
  linkedin: 'LinkedIn',
};

/** The link text of every featured case-study card, the same in both groups. */
export const CASE_LINK_TEXT = 'Read the case study';

/**
 * The description under a card headline: the same in both groups, in the order of HEADLINES.
 * `href` is the case study (a same-origin site path).
 */
export const HOME_CASES: readonly { study: Study; href: string; description: readonly HeadlinePart[] }[] = [
  {
    study: 'audible',
    href: HOME_LINKS.whySoMany,
    description: ['How I plan and analyse experiments, and why so many of my recommendations were adopted.'],
  },
  {
    study: 'retention',
    href: HOME_LINKS.retention,
    description: [
      'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cohorts, customer segments and a win-back sample size.',
    ],
  },
  {
    study: 'pulse',
    href: HOME_LINKS.pulse,
    description: ['A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.'],
  },
];

/** The "Tools I've built" rows in display order; `name` is the row's label, `parts` its line. */
export const HOME_TOOLS: readonly { id: string; name: string; href: string; parts: readonly HeadlinePart[] }[] = [
  {
    id: 'automation',
    name: 'Test-account automation',
    href: HOME_LINKS.automation,
    parts: [
      'Tampermonkey with a step recorder: test-account setup from about ',
      { fact: 'profile.audible.setup_minutes_before' },
      ' to about ',
      { fact: 'profile.audible.setup_minutes_after' },
      ' minutes across ',
      { fact: 'profile.audible.markets' },
      ' markets, adopted team-wide.',
    ],
  },
  {
    id: 'docproof',
    name: 'Docproof',
    href: HOME_LINKS.docproof,
    parts: ['Document verification with multi-agent orchestration and automated checks.'],
  },
  {
    id: 'marketingws',
    name: 'MarketingWS',
    href: HOME_LINKS.marketingws,
    parts: ["Copy variants for marketing workflows; the live demo depends on Groq's free tier."],
  },
];
