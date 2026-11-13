// The Pulse case study's prose: the intro, the summary, the problem, the data, the method, the
// context of the event table, the dashboard's introduction, the findings, how I checked this, the
// limits and the links. Each export is a server section without its own heading, so the page decides
// the outline and the anchors (src/components/pulse/PulsePage.tsx).
//
// Every figure is a <Fact> from the Pulse export, or names its source; the rest is plain words. Pulse
// was designed and built with no real users, so the page reports no outcome: the questions in its
// taxonomy are what the events were designed to answer.
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
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

/** The line under the page title. */
export function PulseIntro(): ReactNode {
  return (
    <p>
      Pulse is an analytics instrumentation demo that I designed and built: a small dashboard whose real point is its event
      taxonomy. It has no real users.
    </p>
  );
}

/** The summary box: question, my role, method, result, what I would recommend, next step. */
export function PulseSummary(): ReactNode {
  const items: readonly [label: string, body: ReactNode][] = [
    ['Question', <>Which events should a product dashboard track, so that each one answers a product question?</>],
    ['My role', <>A personal project: I designed and built the dashboard, its event taxonomy and its tracking in Amplitude.</>],
    [
      'Method',
      <>
        I tied each tracked event to a product question, rather than leaving the tracking to autocapture alone, and
        identified the demo user with <Fact id="pulse.identity.user_properties" /> user properties, so events can be
        segmented by user.
      </>,
    ],
    [
      'Result',
      <>
        A working demo and a tracking plan, with no outcome to report: Pulse has no real users, so none of its questions has
        been answered.
      </>,
    ],
    [
      'What I would recommend',
      <>
        Name a short list of events, each with the question it should answer, and keep autocapture and Session Replay
        underneath it rather than in its place.
      </>,
    ],
    [
      'Next step',
      <>Below: the events and their questions, then a copy of the dashboard on this page that lists each event as you use it.</>,
    ],
  ];
  return (
    <dl>
      {items.map(([label, body]) => (
        <div key={label} className={ITEM}>
          <dt className="font-semibold">{label}</dt>
          <dd className="mt-1">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Why a deliberate taxonomy. */
export function PulseProblem(): ReactNode {
  return (
    <p>
      Autocapture records what users click, but not which product question a click should answer. Pulse puts a deliberate
      taxonomy first: <Events /> named events, each tied to a specific product question. The dashboard around them is the
      vehicle.
    </p>
  );
}

/** What Pulse runs on, and where this page's event table comes from. */
export function PulseData(): ReactNode {
  return (
    <p>
      Pulse has no backend and no real users: its dashboard numbers are generated in the browser. The events on this page,
      with their triggers, properties and questions, come from an export of its code and README, pinned by commit.
    </p>
  );
}

/** The stack, the named events and the user identity, and what runs underneath. */
export function PulseMethod(): ReactNode {
  return (
    <>
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

/** The context of the event table: its questions are design hypotheses. In the table's own section. */
export function PulseTaxonomyContext(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Each question below is a design hypothesis: what the event was meant to help answer once real users arrived. Pulse
        never had real users, so none of these questions has been answered.
      </p>
      <p className={ITEM}>
        Some questions read like findings, such as saving a view predicting a return. They are hypotheses to test, not
        results.
      </p>
    </>
  );
}

/** The event table's caption. */
export const TAXONOMY_CAPTION = "The tracked events, as the project's code and README state them";

/** The dashboard copy's introduction, before its Figure. */
export function PulseDashboardIntro(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        This is a small copy of the dashboard, rebuilt for this page with its own charts, channels and made-up numbers. It
        does not load Amplitude. Each action with an event in the table above sends that event, with the same name and
        properties as in the table, to a list below the charts.
      </p>
      <p className={ITEM}>
        The list is kept in this page&apos;s memory only: nothing is sent anywhere, and it is gone when you leave the page or
        press Reset. It is a simulation, not part of this site&apos;s own experiment.
      </p>
    </>
  );
}

export function PulseFindings(): ReactNode {
  return (
    <p>
      There are no outcome findings, because Pulse has no real users. What it shows is the plan: each of the <Events />{' '}
      events is tied to the product question it was designed to answer.
    </p>
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

/** The repository at its pinned commit, the export this page reads, another case study and LinkedIn. */
export function PulseSources(): ReactNode {
  const links: readonly [href: string, body: ReactNode, external: boolean][] = [
    [
      `${REPO}/tree/${PULSE.commit}`,
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
