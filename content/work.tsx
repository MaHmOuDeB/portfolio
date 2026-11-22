// The Work page's directory as data: two groups of four route descriptors, in the order the page
// lists them. Each item is a site path, a provenance chip, a title, one "Shows:" sentence and one
// plain line; a number in a line is a <Fact>, never typed. The page composition is not here: it
// reads WORK_GROUPS and decides the layout.
//
// The chip says where the work comes from and carries its limit (a demo, a personal project, a
// rebuild on public data), so the line under it does not say the limit again. A limit the chip does
// not carry stays in the line: Docproof has no users yet, the MarketingWS demo depends on Groq's free
// tier, and the Audible results are confidential. Paths shared with the Home page come from its link
// list; the Audible card opens the top of its page, where the adoption figure has its context link.
import type { ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import { HOME_SITE, type PageCtaCopy } from './home.ts';
import { HOME_LINKS } from './home-destinations.ts';

/** Where a project comes from, as the card's chip. */
export type WorkChip =
  | 'Work experience'
  | 'Public data, rebuilt 2026'
  | 'Demo, no real users'
  | 'Open source'
  | 'Personal project'
  | "Master's thesis, rebuilt 2026";

export type WorkItem = {
  href: string;
  /** English values are `WorkChip`s; another language writes its own words. */
  chip: WorkChip | string;
  title: string;
  /** What the project shows about how I work: one sentence, printed after "Shows:". */
  shows: string;
  /** One plain line on what the project is. */
  description: ReactNode;
};
/** `kind` names what the group holds, for its chip: the heading already names the subject. */
export type WorkGroup = { id: string; label: string; kind: string; items: readonly WorkItem[] };

export const WORK_GROUPS: readonly WorkGroup[] = [
  {
    id: 'experimentation',
    label: 'Experiments and analytics',
    kind: 'Case studies',
    items: [
      {
        href: '/work/audible',
        chip: 'Work experience',
        title: 'Experimentation at Audible (Amazon)',
        shows: 'I plan a test, say plainly what it shows and write a recommendation teams act on.',
        description:
          'Nearly two years of A/B tests on the Audible website and app. The results are confidential, so the page shows the method.',
      },
      {
        href: HOME_LINKS.retention,
        chip: 'Public data, rebuilt 2026',
        title: 'Customer retention and reactivation analysis',
        shows: 'I clean the data before I trust a number, and I do not mistake a prediction for proof.',
        description:
          'Two years of orders from a UK online gift retailer: a cleaning error, who orders again, and the test I would run next.',
      },
      {
        href: HOME_LINKS.pulse,
        chip: 'Demo, no real users',
        title: 'Pulse: a tracking plan for product analytics',
        shows: 'I decide what to track from the product question, not from what is easy to capture.',
        description: (
          <>
            A demo dashboard I designed and built, with <Fact id="pulse.events.count" /> named events.
          </>
        ),
      },
      {
        // A tested SQL pipeline on a public dataset: it gets data into a state an analyst can trust.
        href: '/work/weather',
        chip: 'Public data, rebuilt 2026',
        title: 'Weather: a SQL pipeline that stops on bad data',
        shows: 'My pipelines refuse to load bad data quietly.',
        description:
          'A tested SQL pipeline on weather observations: a star schema, data-quality checks and a quarantine for sensor errors.',
      },
    ],
  },
  {
    id: 'automation',
    label: 'Automation and agents',
    kind: 'Build notes',
    items: [
      {
        // The tool I built at Audible has no page of its own: the card opens its section there.
        href: HOME_LINKS.automation,
        chip: 'Work experience',
        title: 'Test-account automation',
        shows: 'I turn repeated manual steps into tools a whole team can use.',
        description: (
          <>
            Tampermonkey with a step recorder. It cut test-account setup at Audible from about{' '}
            <Fact id="profile.audible.setup_minutes_before" /> to about <Fact id="profile.audible.setup_minutes_after" />{' '}
            minutes and was adopted team-wide.
          </>
        ),
      },
      {
        href: HOME_LINKS.docproof,
        chip: 'Open source',
        title: "Docproof: agents that check each other's work",
        shows: 'I build AI tools in which code, not the model, has the last word on facts.',
        description:
          'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Tested in CI, no users yet.',
      },
      {
        href: HOME_LINKS.n8n,
        chip: 'Personal project',
        title: 'E-invoice intake and error alerts in n8n',
        shows: 'I can automate a back-office process and prove it works with tests.',
        description: (
          <>
            Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with{' '}
            <Fact id="profile.n8n.automated_tests" /> automated tests.
          </>
        ),
      },
      {
        href: HOME_LINKS.marketingws,
        chip: "Master's thesis, rebuilt 2026",
        title: 'MarketingWS: marketing copy from one brief, with a fact check',
        shows: 'I took a generative AI idea from thesis to a live web app with checks.',
        description: "A generative AI web service for content marketing. The live demo depends on Groq's free tier.",
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

/** The site band's headline in two tones: the lead, then the quiet clause. Together they are WORK_SITE.title. */
export const WORK_SITE_HEAD = { lead: 'This site is', quiet: 'part of the evidence.' } as const;

/**
 * The Work page's words as one typed value per language: English is WORK_EN, assembled from the exports
 * above; German is WORK_DE in content/de/work.tsx, typed by the same WorkCopy. The page's own sentences
 * are here too, so the page prints no English of its own.
 */
export type WorkCopy = {
  /** The chip above the page's h1. */
  title: string;
  head: { title: string; quiet: string; intro: string; kinds: string };
  groups: readonly WorkGroup[];
  /** Printed before each card's "shows" sentence, with its space. */
  shows: string;
  site: { title: string; text: string; chip: string; live: string; lead: string; quiet: string };
  /** The closing call to action's words where they differ from the shared English ones. */
  cta: PageCtaCopy | null;
};

export const WORK_EN: WorkCopy = {
  title: 'Work',
  head: {
    title: 'Open the work',
    quiet: 'and see how it was done.',
    intro: 'Seven projects and one tool, with their sources and their limits. Start with Audible.',
    kinds: 'Case studies are analyses with a question and a finding. Build notes are things I built, and how I tested them.',
  },
  groups: WORK_GROUPS,
  shows: 'Shows: ',
  site: { ...WORK_SITE, chip: 'Live test', live: HOME_SITE.live, lead: WORK_SITE_HEAD.lead, quiet: WORK_SITE_HEAD.quiet },
  cta: null,
};
