// The Audible method page. It copies the golden page's composition (src/components/retention/
// RetentionPage.tsx): the title and its intro, a summary box, the section links, then one <section>
// per part with its own h2: problem, data, method, the ship rule with its Figure, why so many
// recommendations were adopted, the automation tool with its Figure, findings, how I checked this,
// limits, and sources and links. The prose comes from content/audible.tsx.
//
// Layout: prose sits in the readable column (max-w-text); Figures run to the figure width. Sections
// are spaced, not boxed: no card grid and no motion. No result of any real test is on this page: the
// ship-rule Figure is a made-up product with typed-in bounds, and the automation Figure is a
// reconstruction from reported timings; both carry the "Simulated" badge.
import type { ReactNode } from 'react';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { TextLink } from '@/components/kit/TextLink';
import {
  AudibleAutomation,
  AudibleChecks,
  AudibleData,
  AudibleFindings,
  AUDIBLE_GLANCE,
  AudibleIntro,
  AudibleLimits,
  AudibleLinks,
  AudibleMethod,
  AudibleProblem,
  AudibleShipRule,
  AudibleSummary,
  AudibleWhySoMany,
} from '../../../content/audible';
import { AutomationFigure } from './AutomationFigure';
import { FrameworkFigure } from './FrameworkFigure';

export const AUDIBLE_TITLE = 'Most tests pitted personalisation against plain baselines';

/** The sections in page order: anchor id, heading and the short label of its section link. */
export const AUDIBLE_SECTIONS = [
  { id: 'summary', title: 'Summary', link: null },
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'data', title: 'The data', link: 'Data' },
  { id: 'method', title: 'Method', link: 'Method' },
  { id: 'ship-rule', title: 'The ship rule, on a made-up product', link: 'Ship rule' },
  { id: 'why-so-many', title: 'Why so many were adopted', link: 'Why so many?' },
  { id: 'automation', title: 'Test-account automation', link: 'Automation' },
  { id: 'findings', title: 'Findings', link: 'Findings' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof AUDIBLE_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const EVIDENCE = 'mt-8';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = AUDIBLE_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`audible: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className={`${TEXT} text-xl font-semibold`} data-depth-rise="heading">
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Prose in the readable column. */
function Prose({ children }: { children: ReactNode }) {
  return <div className={TEXT}>{children}</div>;
}

/** The links to each section after the summary, as one wrapping row of 44 px targets. */
function SectionLinks() {
  return (
    <nav aria-label="On this page" className={`${TEXT} mt-8`}>
      <ul className="flex flex-wrap gap-x-4">
        {AUDIBLE_SECTIONS.flatMap((s) =>
          s.link === null ? [] : [
            <li key={s.id}>
              <TextLink href={`#${s.id}`} standalone>
                {s.link}
              </TextLink>
            </li>,
          ],
        )}
      </ul>
    </nav>
  );
}

export function AudiblePage(): ReactNode {
  return (
    <article aria-labelledby="audible-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="audible-title" className="text-2xl font-semibold md:text-3xl">
          {AUDIBLE_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <AudibleIntro />
        </div>
      </div>

      <GlanceBlock {...AUDIBLE_GLANCE} data-depth-rise="" />

      <section id="summary" aria-labelledby="summary-title" className={`${TEXT} mt-8 border-y border-line py-6`}>
        <h2 id="summary-title" className="text-xl font-semibold" data-depth-rise="heading">
          Summary
        </h2>
        <div className="mt-4">
          <AudibleSummary />
        </div>
      </section>

      <SectionLinks />

      <Section id="problem">
        <Prose>
          <AudibleProblem />
        </Prose>
      </Section>

      <Section id="data">
        <Prose>
          <AudibleData />
        </Prose>
      </Section>

      <Section id="method">
        <Prose>
          <AudibleMethod />
        </Prose>
      </Section>

      <Section id="ship-rule">
        <Prose>
          <AudibleShipRule />
        </Prose>
        <div className={EVIDENCE}>
          <FrameworkFigure />
        </div>
      </Section>

      <Section id="why-so-many">
        <Prose>
          <AudibleWhySoMany />
        </Prose>
      </Section>

      <Section id="automation">
        <Prose>
          <AudibleAutomation />
        </Prose>
        <div className={EVIDENCE}>
          <AutomationFigure />
        </div>
      </Section>

      <Section id="findings">
        <Prose>
          <AudibleFindings />
        </Prose>
      </Section>

      <Section id="how-i-checked-this">
        <Prose>
          <AudibleChecks />
        </Prose>
      </Section>

      <Section id="limits">
        <Prose>
          <AudibleLimits />
        </Prose>
      </Section>

      <Section id="sources">
        <Prose>
          <AudibleLinks />
        </Prose>
      </Section>
    </article>
  );
}
