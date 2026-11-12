// The Work page's directory as data: two groups of route descriptors, in the order the page lists
// them. Each item is a site path, a title and a one-line description; a number in a description is a
// <Fact>, never typed. The page composition is not here: it reads WORK_GROUPS and decides the layout.
//
// The Audible, Pulse and Docproof descriptions are the Home page's lines; Retention uses its own
// page's intro, which also names the returns cleaning. Paths shared with the Home page come from its
// link list.
import type { ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import { HOME_LINKS } from './home-destinations.ts';

export const WORK_GROUPS: readonly {
  label: string;
  items: readonly { href: string; title: string; description: ReactNode }[];
}[] = [
  {
    label: 'Experimentation & analytics',
    items: [
      {
        href: HOME_LINKS.experiment,
        title: 'Live test',
        description:
          "The experiment on this site's own visitors: its design, its checks and the counts that are safe to publish.",
      },
      {
        // The description speaks of adoption, so it opens the section that gives the context.
        href: HOME_LINKS.whySoMany,
        title: 'Experimentation at Audible (Amazon)',
        description: 'How I plan and analyse experiments, and why so many of my recommendations were adopted.',
      },
      {
        href: HOME_LINKS.retention,
        title: 'Customer retention and reactivation analysis',
        description:
          'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size.',
      },
      {
        href: HOME_LINKS.pulse,
        title: 'Pulse: analytics instrumentation demo',
        description: 'A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.',
      },
    ],
  },
  {
    label: "Tools I've built",
    items: [
      {
        href: HOME_LINKS.marketingws,
        title: 'MarketingWS',
        description:
          "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app. The live demo depends on Groq's free tier.",
      },
      {
        href: HOME_LINKS.docproof,
        title: 'Docproof',
        description: 'Document verification with multi-agent orchestration and automated checks.',
      },
      {
        href: '/work/weather',
        title: 'Weather data quality',
        description:
          'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
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
    ],
  },
];
