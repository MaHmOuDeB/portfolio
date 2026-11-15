// The Pulse case study's prose: the intro with its plain opening, the glance card, the dashboard's
// lead-in, introduction and takeaway, the event table's lead-in, the data, the method, how I checked
// this, the limits, the links and the close. Each export is a server part without its own heading, so
// the page decides the outline and the anchors (src/components/pulse/PulsePage.tsx).
//
// Every figure is a <Fact> from the Pulse export, or names its source; the rest is plain words. Pulse
// was designed and built with no real users, so the page reports no outcome: the questions in its
// taxonomy are what the events were designed to answer. The page says so once in the glance card's
// scope and once under Limits.
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { DEMO_PROMPT_VERSION } from '@/lib/pulse/bus';
import { CONTACT } from '@/lib/site';
import lock from '../sources.lock.json';
import { HOME_LINKS } from './home-destinations.ts';

const ITEM = 'mt-4 first:mt-0';

const Events = () => <Fact id="pulse.events.count" />;

/** The page title: the event count as a Fact. */
export function PulseTitle(): ReactNode {
  return (
    <>
      <Events /> events, each designed to answer a product question
    </>
  );
}

/** The line under the page title, then the plain-words opening with the one term it needs. */
export function PulseIntro(): ReactNode {
  return (
    <>
      <p>A small dashboard I designed and built to show one thing: a tracking plan in which every event answers a product question.</p>
      <p data-plain-opening="" className="mt-4 text-base text-ink">
        Most products record every click first and ask what the clicks mean later. Pulse works the other way round:{' '}
        <Events /> tracked actions, each chosen because it answers a question a product team would ask. It shows a tracking
        plan, not results. An event is one recorded user action, with a name.
      </p>
    </>
  );
}

/** The twenty-second card: two pull figures, one sentence, then the facts and the scope. */
export const PULSE_GLANCE: GlanceParts = {
  points: [
    { id: 'events', figure: <Events />, label: 'events, each tied to one product question' },
    {
      id: 'user-properties',
      figure: <Fact id="pulse.identity.user_properties" />,
      label: 'user properties, so events can be split by user',
    },
  ],
  outcome: (
    <>
      Each event exists to answer one product question: the original sends them to Amplitude, and the copy on this page
      sends them to a list in your browser.
    </>
  ),
  role: 'Personal project, designed and built.',
  methods: 'A named list of events, user identification, properties for segments.',
  tools: 'React, TypeScript, Vite, Tailwind, Recharts, Amplitude, Vercel.',
  when: 'Sep 2026.',
  scope: 'A demo. No real users, so the questions are still open.',
};

/** The dashboard's lead-in, above its Figure. */
export function PulseDashboardLeadIn(): ReactNode {
  return <>Use the dashboard. Each action you take appears in the list below it as the event a product team would receive.</>;
}

/** The dashboard's takeaway, below its Figure. */
export function PulseDashboardTakeaway(): ReactNode {
  return <>A short list of named events is meant to answer the product questions; automatic capture stays underneath as a safety net.</>;
}

/** How the dashboard copy works, in the row under its takeaway. */
export function PulseDashboardIntro(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        This is a small copy of the dashboard, rebuilt for this page with its own charts, channels and made-up numbers. It
        does not load Amplitude. Each action with an event in the table below sends that event, with the same name and
        properties as in the table, to a list below the charts.
      </p>
      <p className={ITEM}>
        The list is kept in this page&apos;s memory only: nothing is sent anywhere, and it is gone when you leave the page or
        press Reset. It is a simulation, not part of this site&apos;s own experiment.
      </p>
    </>
  );
}

/** The lead-in of the event table: its questions are design hypotheses, not results. */
export function PulseTaxonomyLeadIn(): ReactNode {
  return <>Read each question as a design hypothesis: what the event was meant to help answer, not a finding.</>;
}

/** The event table's caption. */
export const TAXONOMY_CAPTION = "The tracked events, as the project's code and README state them";

/** What Pulse runs on, and where this page's event table comes from. */
export function PulseData(): ReactNode {
  return (
    <p>
      Pulse has no backend: its dashboard numbers are generated in the browser. The events on this page, with their
      triggers, properties and questions, come from an export of its code and README, pinned by commit.
    </p>
  );
}

/** Why a deliberate list of events, the stack, the named events and the user identity, and what runs underneath. */
export function PulseMethod(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Autocapture records what users click, but not which product question a click should answer. Pulse puts a deliberate
        taxonomy first: <Events /> named events, each tied to a specific product question. The dashboard around them is the
        vehicle.
      </p>
      <p className={ITEM}>
        I built Pulse with React, TypeScript, Vite, Tailwind CSS and Recharts, and tracked it with Amplitude&apos;s unified
        SDK.
      </p>
      <p className={ITEM}>
        Each of the <Events /> events is tracked by name, with its own properties. The demo user is identified with a user
        ID and <Fact id="pulse.identity.user_properties" /> user properties: role, plan, company size and signup date.
        Without this identification every event would be anonymous and could not be segmented by user.
      </p>
      <p className={ITEM}>Autocapture and Session Replay run underneath the named events.</p>
    </>
  );
}

export function PulseChecks(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        I tested every tracked interaction by hand. TypeScript runs in strict mode with no type errors, secrets stay out of
        git, and every push to GitHub deploys to Vercel.
      </p>
      <p className={ITEM}>
        On this page, the events come from an export of the project&apos;s code and README, pinned by commit and by a hash of
        its content. Tests check that the dashboard copy sends only those events, each with exactly its properties, and that Reset leaves
        one new Viewed Dashboard.
      </p>
    </>
  );
}

const LIMIT = 'mt-2 first:mt-0';

export function PulseLimits(): ReactNode {
  return (
    <ul className="list-disc pl-6">
      <li className={LIMIT}>
        Pulse has no real users and no production traffic, so its events show what the tracking was designed to capture, not
        how anyone behaved.
      </li>
      <li className={LIMIT}>
        The questions are design hypotheses. Nothing here tests whether an event predicts an outcome, such as a saved view
        predicting a return.
      </li>
      <li className={LIMIT}>
        The copy on this page reuses the event names and properties, but not the original&apos;s Amplitude tracking, user
        identification or Session Replay, and its numbers are made up.
      </li>
      <li className={LIMIT}>
        Its property keys match the original&apos;s. Apart from the date ranges and the CSV format, its values are its own,
        such as <code>filter_type</code> and its prompt version,{' '}
        <code {...derivedAttr(DEMO_PROMPT_VERSION.refs)}>{DEMO_PROMPT_VERSION.value}</code>, and so are its charts and
        channels.
      </li>
    </ul>
  );
}

const PULSE = lock.sources.pulse;
const REPO = `https://github.com/${PULSE.repo}`;
/** The repository at its pinned commit: the first Sources link and the button under the head. */
export const PULSE_REPO_URL = `${REPO}/tree/${PULSE.commit}`;

/** The repository at its pinned commit, the export this page reads, another case study and LinkedIn. */
export function PulseSources(): ReactNode {
  const links: readonly [href: string, body: ReactNode, external: boolean][] = [
    [
      PULSE_REPO_URL,
      <>
        Pulse, at commit <code {...derivedAttr(['source:pulse'])}>{PULSE.commit.slice(0, 7)}</code>
      </>,
      true,
    ],
    [`${REPO}/blob/${PULSE.commit}/${PULSE.path}`, <>Export of the event taxonomy that this page reads</>, true],
    [HOME_LINKS.retention, <>Customer retention and reactivation analysis, another case study</>, false],
    [CONTACT.linkedin, <>My LinkedIn profile</>, true],
  ];
  return (
    <ul>
      {links.map(([href, body, external]) => (
        <li key={href}>
          <TextLink href={href} standalone external={external}>
            <span>{body}</span>
          </TextLink>
        </li>
      ))}
    </ul>
  );
}

/** The close: what the page showed about how I work. */
export function PulseClose(): ReactNode {
  return (
    <p className="max-w-text">
      I plan tracking from the questions backwards: each of the <Events /> events was named for a question a product team
      would ask, and the dashboard is only there to carry them.
    </p>
  );
}
