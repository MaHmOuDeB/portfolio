// The Work page's directory as data: three groups of route descriptors, in the order the page lists
// them. Each item is a site path, a title and a short description; a number in a description is a
// <Fact>, never typed. The page composition is not here: it reads WORK_GROUPS and decides the layout.
//
// Each description says what I did first and the limit once, in words the item's own page already
// states. The MarketingWS, n8n and Weather lines are their pages' intros word for word. Paths shared
// with the Home page come from its link list.
import type { ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import { HOME_SITE, HOME_TRACKS } from './home.ts';
import { HOME_LINKS } from './home-destinations.ts';

export type WorkItem = { href: string; title: string; description: ReactNode };
/** A group's lede is the Home track's sentence for the same group; the data-pipelines group has none. */
export type WorkGroup = { id: string; label: string; lede?: string; items: readonly WorkItem[] };

export const WORK_GROUPS: readonly WorkGroup[] = [
  {
    id: 'experimentation',
    label: 'Experiments and analytics',
    lede: HOME_TRACKS.experiments.lede,
    items: [
      {
        // The description speaks of adoption, so it opens the section that gives the context.
        href: HOME_LINKS.whySoMany,
        title: 'Experimentation at Audible (Amazon)',
        description:
          'How I plan and analyse experiments, and why so many of my recommendations were adopted. The tests are confidential, so the page shows none of their results.',
      },
      {
        href: HOME_LINKS.retention,
        title: 'Customer retention and reactivation analysis',
        description:
          'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size. Nobody was contacted and no test was run.',
      },
      {
        href: HOME_LINKS.pulse,
        title: 'Pulse: analytics instrumentation demo',
        description: 'A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.',
      },
    ],
  },
  {
    id: 'automation',
    label: 'Automation and agents',
    lede: HOME_TRACKS.automation.lede,
    items: [
      {
        href: HOME_LINKS.docproof,
        title: 'Docproof',
        description:
          'Three agents propose changes to a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
      },
      {
        href: '/work/n8n',
        title: 'n8n Workflow Library',
        description: (
          <>
            Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with{' '}
            <Fact id="profile.n8n.automated_tests" /> automated tests. A portfolio project with no production use.
          </>
        ),
      },
      {
        href: HOME_LINKS.marketingws,
        title: 'MarketingWS',
        description:
          "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app. The live demo depends on Groq's free tier.",
      },
    ],
  },
  {
    // A tested SQL pipeline on a public dataset: a data pipeline, not an automation or an agent.
    id: 'pipelines',
    label: 'Data pipelines',
    items: [
      {
        href: '/work/weather',
        title: 'Weather data quality',
        description:
          'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
      },
    ],
  },
];

/**
 * The tile at the end of the directory that leads to the live test. It is the Home site tile's
 * sentence with one place word changed: the experiment cards are on the Home page, not above this one.
 */
export const WORK_SITE = {
  title: HOME_SITE.title,
  text: HOME_SITE.text.replace('the three experiment cards above', 'the three experiment cards on the Home page'),
} as const;
