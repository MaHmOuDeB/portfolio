// Sharing metadata as data: the title, description and sharing image of every public page, and the
// cards the sharing images are drawn from (scripts/og-render.ts, `npm run og:render`). Numbers come
// from the facts data through factText, never typed.
//
// SEO_PAGES lists every shipped page except SEO_EXCLUDED_ROUTES, and tests/unit/seo/metadata.test.ts
// keeps it equal to the page files under src/app: a new page fails that test until it has an entry
// here (or is excluded). A page's title is the one its page prints, so the two cannot drift.
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module.
import type { FactId } from '../src/lib/facts/index.ts';
import { ogAlt, type OgCard } from '../src/lib/seo/og-template.ts';
import { SITE } from '../src/lib/site.ts';
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

/** The site's sharing line: the Home description and the site card's line. */
export const SITE_SHARING_LINE =
  'Experimentation and growth analyst in Berlin. A/B testing, clear statistics and automation that removes manual work.';

/** The site card's headline. */
export const SITE_SHARING_HEADLINE = 'Data, experimentation, AI and automation';

/** The Home page's title in a link preview (og:title, twitter:title). */
export const HOME_SHARE_TITLE = 'Mahmoud El Bergui: data, experimentation, AI and automation';

/**
 * A case card's headline states its landing page's finding in the page's own words. The cards have their
 * own text here, so a change to the experiment's copy never changes a sharing image.
 */
const CASE_TITLES = {
  // The Audible page's h1 (src/components/audible/AudiblePage.tsx AUDIBLE_TITLE).
  audible: 'Most tests pitted personalisation against plain baselines',
  // The Retention page's finding (content/retention.tsx: "returned-order value grew about <clean> in
  // January to November 2011, not <raw>").
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
  caseCard('audible', 'Experimentation at Audible (Amazon)', []),
  caseCard('retention', 'Customer retention and reactivation analysis', [
    'retail.returns.yoy_growth_clean',
    'retail.returns.yoy_growth_raw',
  ]),
  caseCard('pulse', 'Pulse: analytics instrumentation demo', ['pulse.events.count']),
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
    '/work/audible',
    'Experimentation at Audible (Amazon)',
    'How I plan and analyse experiments, why so many of my recommendations were adopted, a ship rule on a made-up product and the tool I built for test-account setup.',
    'audible',
  ),
  entry(
    '/work/retention',
    'Customer retention and reactivation analysis',
    'Cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size, on a public dataset rebuilt in 2026.',
    'retention',
  ),
  entry(
    '/work/weather',
    'Weather data quality',
    'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
    'site',
  ),
  entry(
    '/work/docproof',
    'Docproof: a multi-agent document pipeline',
    'Document verification with multi-agent orchestration and automated checks: the architecture, how it is verified and its limits.',
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
    'n8n Workflow Library',
    'Document and process automation in n8n: an e-invoice intake for XRechnung and ZUGFeRD, error alerts, and how it is tested. A portfolio project with no production use.',
    'site',
  ),
  entry(
    '/lab',
    'Lab',
    'What a test can and cannot tell: sample size and duration, peeking at results, a split check and exaggeration, on simulated and hypothetical numbers.',
    'site',
  ),
  entry(
    '/lab/peeking',
    'Peeking at results, in the Lab',
    'What checking a running test every day does to its false positives, on a seeded simulation.',
    'site',
  ),
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
