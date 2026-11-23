// The Pulse case study's prose: the intro with its plain opening, the glance card, the dashboard's
// lead-in, introduction and takeaway, the event table's lead-in, the data, the method, how I checked
// this, the limits, the links and the close. Each part is a server part without its own heading, so
// the page decides the outline and the anchors (src/components/pulse/PulsePage.tsx).
//
// Every figure is a <Fact> from the Pulse export, or names its source; the rest is plain words. Pulse
// was designed and built with no real users, so the page reports no outcome: the questions in its
// taxonomy are what the events were designed to answer. The page says so once in the glance card's
// scope and once under Limits.
//
// The words are a `PulseCopy`: PULSE_EN here, the German twin in content/de/pulse.tsx typed by the same
// type, so a missing key fails the typecheck. A sentence with numbers is a `Sentence` whose slots hold
// the numbers as elements (a <Fact> in the page's language). `blocks` turns a copy into the page's
// parts: the structure is drawn once, from the copy's words. The event names, the property keys and
// the table's rows are the export's own and stay English in every language. Server only: the
// dashboard island gets its own words as props (src/lib/pulse/text.ts).
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import type { GlanceLabels, GlanceParts } from '@/components/depth/GlanceBlock';
import { GLANCE_LABELS_EN } from '@/components/depth/GlanceBlock';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { DEMO_PROMPT_VERSION } from '@/lib/pulse/bus';
import { EN_TAXONOMY, type TaxonomyText } from '@/lib/pulse/tables';
import { EN_PULSE, type PulseText } from '@/lib/pulse/text';
import { sentenceNodes, slot, type Sentence } from '@/lib/retention/sentence';
import { CONTACT } from '@/lib/site';
import lock from '../sources.lock.json';
import { HOME_LINKS } from './home-destinations.ts';
import type { FRAME_DE } from './de/frame';

const ITEM = 'mt-4 first:mt-0';
const LIMIT = 'mt-2 first:mt-0';

/** The anchor ids of the page's visible sections, in page order. */
export const PULSE_SECTION_IDS = ['dashboard', 'taxonomy', 'how-i-checked-this', 'limits', 'sources'] as const;
export type PulseSectionId = (typeof PULSE_SECTION_IDS)[number];

/** The numbers the sentences print, as elements in the page's language, and the page's link mapper. */
export type Slots = {
  events: ReactNode;
  userProperties: ReactNode;
  href: (path: string) => string;
};

export function slotsFor(locale: Locale): Slots {
  return {
    events: <Fact id="pulse.events.count" locale={locale} />,
    userProperties: <Fact id="pulse.identity.user_properties" locale={locale} />,
    href: (path) => localHref(locale, path),
  };
}

export type PulseCopy = {
  chip: string;
  /** The h1: slot events, then the claim it heads. */
  title: Sentence;
  github: string;
  /** The line under the title. */
  intro: string;
  /** The plain-words opening. Slot: events. */
  plainOpening: Sentence;
  glanceLabels: GlanceLabels;
  glance: {
    events: string;
    userProperties: string;
    outcome: string;
    role: string;
    methods: string;
    tools: string;
    when: string;
    scope: string;
  };
  sections: Record<PulseSectionId, { title: string; link: string }>;
  dashboard: { leadIn: string; takeaway: string; summary: string; intro: readonly [string, string] };
  taxonomy: { leadIn: string; caption: string; table: TaxonomyText; plainNote: string };
  summaries: { data: string; method: string; checked: string };
  data: string;
  /** The four method paragraphs: the first needs the slot events, the third events and props, the others are plain. */
  method: { why: Sentence; stack: string; named: Sentence; underneath: string };
  checks: readonly [string, string];
  /** Limits: three plain ones, then one around two code values. Slots: filter, version. */
  limits: { plain: readonly [string, string, string]; keys: Sentence };
  sources: {
    /** Slot: commit. */
    repo: Sentence;
    export: string;
    retention: string;
    linkedin: string;
  };
  close: Sentence;
  closeLink: string;
  neighbours: { prev: { label: string; kicker?: string }; next: { label: string; kicker?: string } };
  /** The frame parts' labels; empty in English, where each part's own default applies. */
  frame: Partial<typeof FRAME_DE>;
  figure: PulseText;
};

export const PULSE_EN: PulseCopy = {
  chip: 'Case study',
  title: [slot('events'), ' events, each designed to answer a product question'],
  github: 'See the code on GitHub',
  intro: 'A small dashboard I designed and built to show one thing: a tracking plan in which every event answers a product question.',
  plainOpening: [
    'Most products record every click first and ask what the clicks mean later. Pulse works the other way round:',
    ' ',
    slot('events'),
    ' tracked actions, each chosen because it answers a question a product team would ask. It shows a tracking plan, not results. An event is one recorded user action, with a name.',
  ],
  glanceLabels: GLANCE_LABELS_EN,
  glance: {
    events: 'events, each tied to one product question',
    userProperties: 'user properties, so events can be split by user',
    outcome:
      'Each event exists to answer one product question: the original sends them to Amplitude, and the copy on this page sends them to a list in your browser.',
    role: 'Personal project, designed and built.',
    methods: 'A named list of events, user identification, properties for segments.',
    tools: 'React, TypeScript, Vite, Tailwind, Recharts, Amplitude, Vercel.',
    when: 'Sep 2026.',
    scope: 'A demo. No real users, so the questions are still open.',
  },
  sections: {
    dashboard: { title: 'The dashboard, on this page', link: 'Dashboard' },
    taxonomy: { title: 'The events and the questions behind them', link: 'Events' },
    'how-i-checked-this': { title: 'How I built and checked it', link: 'How I checked this' },
    limits: { title: 'Limits', link: 'Limits' },
    sources: { title: 'Sources and links', link: 'Sources' },
  },
  dashboard: {
    leadIn: 'Use the dashboard. Each action you take appears in the list below it as the event a product team would receive.',
    takeaway: 'A short list of named events is meant to answer the product questions; automatic capture stays underneath as a safety net.',
    summary: 'How this copy of the dashboard works',
    intro: [
      "This is a small copy of the dashboard, rebuilt for this page with its own charts, channels and made-up numbers. It does not load Amplitude. Each action with an event in the table below sends that event, with the same name and properties as in the table, to a list below the charts.",
      "The list is kept in this page's memory only: nothing is sent anywhere, and it is gone when you leave the page or press Reset. It is a simulation, not part of this site's own experiment.",
    ],
  },
  taxonomy: {
    leadIn: 'Read each question as a design hypothesis: what the event was meant to help answer, not a finding.',
    caption: "The tracked events, as the project's code and README state them",
    table: EN_TAXONOMY,
    plainNote:
      "Names and properties as the source code states them; triggers and questions as the project's README states them, in plain punctuation.",
  },
  summaries: { data: 'The data', method: 'Method', checked: 'How I checked this' },
  data: "Pulse has no backend: its dashboard numbers are generated in the browser. The events on this page, with their triggers, properties and questions, come from an export of its code and README, pinned by commit.",
  method: {
    why: [
      'Autocapture records what users click, but not which product question a click should answer. Pulse puts a deliberate taxonomy first: ',
      slot('events'),
      ' named events, each tied to a specific product question. The dashboard around them is the vehicle.',
    ],
    stack: "I built Pulse with React, TypeScript, Vite, Tailwind CSS and Recharts, and tracked it with Amplitude's unified SDK.",
    named: [
      'Each of the ',
      slot('events'),
      ' events is tracked by name, with its own properties. The demo user is identified with a user ID and ',
      slot('userProperties'),
      ' user properties: role, plan, company size and signup date. Without this identification every event would be anonymous and could not be segmented by user.',
    ],
    underneath: 'Autocapture and Session Replay run underneath the named events.',
  },
  checks: [
    'I tested every tracked interaction by hand. TypeScript runs in strict mode with no type errors, secrets stay out of git, and every push to GitHub deploys to Vercel.',
    "On this page, the events come from an export of the project's code and README, pinned by commit and by a hash of its content. Tests check that the dashboard copy sends only those events, each with exactly its properties, and that Reset leaves one new Viewed Dashboard.",
  ],
  limits: {
    plain: [
      'Pulse has no real users and no production traffic, so its events show what the tracking was designed to capture, not how anyone behaved.',
      'The questions are design hypotheses. Nothing here tests whether an event predicts an outcome, such as a saved view predicting a return.',
      "The copy on this page reuses the event names and properties, but not the original's Amplitude tracking, user identification or Session Replay, and its numbers are made up.",
    ],
    keys: [
      "Its property keys match the original's. Apart from the date ranges and the CSV format, its values are its own, such as ",
      slot('filter'),
      ' and its prompt version,',
      ' ',
      slot('version'),
      ', and so are its charts and channels.',
    ],
  },
  sources: {
    repo: ['Pulse, at commit ', slot('commit')],
    export: 'Export of the event taxonomy that this page reads',
    retention: 'Customer retention and reactivation analysis, another case study',
    linkedin: 'My LinkedIn profile',
  },
  close: [
    'I plan tracking from the questions backwards: each of the ',
    slot('events'),
    ' events was named for a question a product team would ask, and the dashboard is only there to carry them.',
  ],
  closeLink: 'See the Lab',
  neighbours: { prev: { label: 'Retention' }, next: { label: 'Weather pipeline' } },
  frame: {},
  figure: EN_PULSE,
};

const PULSE = lock.sources.pulse;
const REPO = `https://github.com/${PULSE.repo}`;
/** The repository at its pinned commit: the first Sources link and the button under the head. */
export const PULSE_REPO_URL = `${REPO}/tree/${PULSE.commit}`;
/** The event table's caption in English. */
export const TAXONOMY_CAPTION = PULSE_EN.taxonomy.caption;

/** The page's parts, drawn once from a copy. Each is a server part without its own heading. */
export function blocks(c: PulseCopy, s: Slots) {
  const { href, ...numbers } = s;
  const nodes = (sentence: Sentence, extra: Record<string, ReactNode> = {}): ReactNode =>
    sentenceNodes(sentence, { ...numbers, ...extra });
  return {
    /** The page title: the event count as a Fact, then the claim it heads. */
    title: (): ReactNode => nodes(c.title),

    /** The line under the page title, then the plain-words opening with the one term it needs. */
    intro: (): ReactNode => (
      <>
        <p>{c.intro}</p>
        <p data-plain-opening="" className="mt-4 text-base text-ink">
          {nodes(c.plainOpening)}
        </p>
      </>
    ),

    /** The twenty-second card: two pull figures, one sentence, then the facts and the scope. */
    glance: (): GlanceParts => ({
      points: [
        { id: 'events', figure: s.events, label: c.glance.events },
        { id: 'user-properties', figure: s.userProperties, label: c.glance.userProperties },
      ],
      outcome: <>{c.glance.outcome}</>,
      role: c.glance.role,
      methods: c.glance.methods,
      tools: c.glance.tools,
      when: c.glance.when,
      scope: c.glance.scope,
    }),

    /** The dashboard's lead-in, above its Figure. */
    dashboardLeadIn: (): ReactNode => <>{c.dashboard.leadIn}</>,

    /** The dashboard's takeaway, below its Figure. */
    dashboardTakeaway: (): ReactNode => <>{c.dashboard.takeaway}</>,

    /** How the dashboard copy works, in the row under its takeaway. */
    dashboardIntro: (): ReactNode => (
      <>
        <p className={ITEM}>{c.dashboard.intro[0]}</p>
        <p className={ITEM}>{c.dashboard.intro[1]}</p>
      </>
    ),

    /** The lead-in of the event table: its questions are design hypotheses, not results. */
    taxonomyLeadIn: (): ReactNode => <>{c.taxonomy.leadIn}</>,

    /** What Pulse runs on, and where this page's event table comes from. */
    data: (): ReactNode => <p>{c.data}</p>,

    /** Why a deliberate list of events, the stack, the named events and the user identity, and what runs underneath. */
    method: (): ReactNode => (
      <>
        <p className={ITEM}>{nodes(c.method.why)}</p>
        <p className={ITEM}>{c.method.stack}</p>
        <p className={ITEM}>{nodes(c.method.named)}</p>
        <p className={ITEM}>{c.method.underneath}</p>
      </>
    ),

    checks: (): ReactNode => (
      <>
        <p className={ITEM}>{c.checks[0]}</p>
        <p className={ITEM}>{c.checks[1]}</p>
      </>
    ),

    limits: (): ReactNode => (
      <ul className="list-disc pl-6">
        {c.limits.plain.map((body) => (
          <li key={body} className={LIMIT}>
            {body}
          </li>
        ))}
        <li className={LIMIT}>
          {nodes(c.limits.keys, {
            filter: <code>filter_type</code>,
            version: <code {...derivedAttr(DEMO_PROMPT_VERSION.refs)}>{DEMO_PROMPT_VERSION.value}</code>,
          })}
        </li>
      </ul>
    ),

    /** The repository at its pinned commit, the export this page reads, another case study and LinkedIn. */
    sources: (): ReactNode => {
      const links: readonly [href: string, body: ReactNode, external: boolean][] = [
        [PULSE_REPO_URL, nodes(c.sources.repo, { commit: <code {...derivedAttr(['source:pulse'])}>{PULSE.commit.slice(0, 7)}</code> }), true],
        [`${REPO}/blob/${PULSE.commit}/${PULSE.path}`, <>{c.sources.export}</>, true],
        [href(HOME_LINKS.retention), <>{c.sources.retention}</>, false],
        [CONTACT.linkedin, <>{c.sources.linkedin}</>, true],
      ];
      return (
        <ul>
          {links.map(([to, body, external]) => (
            <li key={to}>
              <TextLink href={to} standalone external={external}>
                <span>{body}</span>
              </TextLink>
            </li>
          ))}
        </ul>
      );
    },

    /** The close: what the page showed about how I work. */
    close: (): ReactNode => <p className="max-w-text">{nodes(c.close)}</p>,
  };
}
