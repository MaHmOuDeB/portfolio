// Sharing metadata as data: the title, description and sharing image of every public page, and the
// cards the sharing images are drawn from (scripts/og-render.ts, `npm run og:render`). Numbers come
// from the facts data through factText, never typed.
//
// SEO_PAGES lists every shipped page except SEO_EXCLUDED_ROUTES, and tests/unit/seo/metadata.test.ts
// keeps it equal to the page files under src/app: a new page fails that test until it has an entry
// here (or is excluded). A title says what the page is for, as a search result shows it; it need not
// be the page's h1 (the test pins each one).
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module.
import type { FactId } from '../src/lib/facts/index.ts';
import { ogAlt, type OgCard } from '../src/lib/seo/og-template.ts';
import { HEADLINE, SITE } from '../src/lib/site.ts';
import { factText } from '../src/lib/facts/text.ts';

export type SeoEntry = {
  path: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  factIds: readonly FactId[];
};

/**
 * Pages that are never in the sitemap and set their own metadata: /exclude (the owner's opt-out,
 * noindex) and /demo (the interview mode, noindex, follow). The per-group Home pages under /v/*,
 * the API, data.json and the dev-only kitchen sink are not pages a visitor requests, so they never
 * appear in the inventory at all.
 */
export const SEO_EXCLUDED_ROUTES: readonly string[] = ['/exclude', '/demo'];

/**
 * The site's sharing line: the Home description and the site card's line. It is the hero's sub line
 * with its two inline chips as plain lower-case words; a unit test keeps the two equal (this module
 * does not import the Home content, so the experiment's copy never reaches a sharing image).
 */
export const SITE_SHARING_LINE =
  'Analyst in Berlin with nearly two years of A/B testing at Audible (Amazon). I plan and analyse tests that end in a clear recommendation, and build the agents and workflows that take the manual work out.';

/** The site card's headline: the hero's line in one tone. */
export const SITE_SHARING_HEADLINE = `${HEADLINE.lead} ${HEADLINE.quiet}`;

/** The Home page's title in a link preview (og:title, twitter:title). */
export const HOME_SHARE_TITLE = `${SITE.name}: ${HEADLINE.lead.charAt(0).toLowerCase()}${HEADLINE.lead.slice(1)} ${HEADLINE.quiet}`;

/**
 * A case card's headline states its landing page's finding in the page's own words. The cards have their
 * own text here, so a change to the experiment's copy never changes a sharing image.
 */
const CASE_TITLES = {
  // The Audible page's h1, "25+ A/B tests at Audible (Amazon)", its figure from the facts.
  audible: `${factText('profile.audible.experiments')} A/B tests at Audible (Amazon)`,
  // The Retention page's finding (content/retention.tsx, the row on how the reversal rule works:
  // "returned-order value grew about <clean> ... not <raw>").
  retention: `Returned-order value grew about ${factText('retail.returns.yoy_growth_clean')}, not ${factText('retail.returns.yoy_growth_raw')}`,
  // The Pulse finding, for /work/pulse, which lands with its own page.
  pulse: `${factText('pulse.events.count')} events, each designed to answer a product question`,
} as const;

type CaseName = keyof typeof CASE_TITLES;

function caseCard(name: CaseName, sub: string, factIds: readonly FactId[]): OgCard {
  return { name, variant: 'case', title: CASE_TITLES[name], sub, footer: SITE.name, factIds };
}

export const OG_CARDS: readonly OgCard[] = [
  { name: 'site', variant: 'site', title: SITE_SHARING_HEADLINE, sub: SITE_SHARING_LINE, footer: SITE.name, factIds: [] },
  caseCard('audible', 'From the plan to the recommendation.', ['profile.audible.experiments']),
  caseCard('retention', 'Retention analysis: who orders again', [
    'retail.returns.yoy_growth_clean',
    'retail.returns.yoy_growth_raw',
  ]),
  caseCard('pulse', 'Pulse: a tracking plan for product analytics', ['pulse.events.count']),
];

export function ogCard(name: string): OgCard {
  const card = OG_CARDS.find((c) => c.name === name);
  if (!card) throw new Error(`no sharing card named ${name}`);
  return card;
}

function entry(path: string, title: string, description: string, cardName: string): SeoEntry {
  const card = ogCard(cardName);
  return { path, title, description, image: `/og/${card.name}.png`, imageAlt: ogAlt(card), factIds: card.factIds };
}

export const SEO_PAGES: readonly SeoEntry[] = [
  entry('/', SITE.name, SITE_SHARING_LINE, 'site'),
  entry(
    '/work',
    'Work: experiments, analyses and automation',
    'Seven projects with their code, sources and limits: A/B testing at Audible, a retention analysis, a tracking plan, agents, n8n workflows and a SQL pipeline.',
    'site',
  ),
  entry(
    '/work/audible',
    'A/B testing at Audible (Amazon)',
    `How I contributed to ${factText('profile.audible.experiments')} A/B tests as a working student at Audible, why ${factText('profile.audible.recommendations_adopted')} of my recommendations were adopted, and the tools I built for the team.`,
    'audible',
  ),
  entry(
    '/work/retention',
    'Retention analysis: who orders again, and how to test a win-back offer',
    'Cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size, on a public dataset rebuilt in 2026.',
    'retention',
  ),
  entry(
    '/work/pulse',
    'Pulse: a tracking plan for product analytics',
    `A tracking plan of ${factText('pulse.events.count')} events, each tied to one product question, in a demo dashboard I designed and built.`,
    'pulse',
  ),
  entry(
    '/work/weather',
    'Weather data quality',
    'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
    'site',
  ),
  entry(
    '/work/docproof',
    'Docproof: agents write, checks decide',
    'An open-source pipeline in which one agent writes, one audits every claim and one reviews cold, and automated checks decide what reaches the reader.',
    'site',
  ),
  entry(
    '/work/marketingws',
    'MarketingWS',
    "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app: how it works, how I checked it and its limits.",
    'site',
  ),
  entry(
    '/work/n8n',
    'E-invoice intake and error alerts in n8n',
    `Reads and checks XRechnung and ZUGFeRD invoices, flags duplicates and changed bank details, and alerts on failures. ${factText('profile.n8n.automated_tests')} automated tests. A personal project.`,
    'site',
  ),
  entry(
    '/lab',
    'A/B test lab: sample size, peeking and fair splits',
    'Four interactive examples: how many visitors a test needs, why checking early finds false winners, whether the split was fair, and why small tests overstate wins.',
    'site',
  ),
  entry(
    '/lab/peeking',
    'Peeking at results, in the Lab',
    'What checking a running test every day does to its false positives, on a seeded simulation.',
    'site',
  ),
  entry(
    '/experiment',
    'A real A/B test on this site',
    'A real A/B test running on this site: the question, the plan published in advance, the results so far and the data to recompute them.',
    'site',
  ),
  entry(
    '/about',
    'About',
    'Experimentation and AI automation analyst in Berlin: my story, my timeline, the tools I used and where, and my CV.',
    'site',
  ),
  entry(
    '/cv',
    'CV',
    'The CV of Mahmoud El Bergui, experimentation and AI automation analyst in Berlin, as a page you can read or print.',
    'site',
  ),
  entry('/contact', 'Contact', 'Send me a message about a role, an interview or a project.', 'site'),
  entry('/privacy', 'Privacy', 'What this site collects, why, and for how long.', 'site'),
];

/**
 * A page's title in a link preview: the Home page has its own, every other page is its title and
 * the site's name. The document <title> stays the page title.
 */
export function shareTitle(entry: SeoEntry): string {
  return entry.path === '/' ? HOME_SHARE_TITLE : `${entry.title} | ${SITE.name}`;
}

/** The entry for a path; throws for a path the manifest does not list. */
export function seoEntry(path: string): SeoEntry {
  const found = SEO_PAGES.find((e) => e.path === path);
  if (!found) throw new Error(`no SEO entry for ${path}`);
  return found;
}
