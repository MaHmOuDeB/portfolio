// The Pulse case study. It copies the golden page's composition (src/components/retention/
// RetentionPage.tsx): the title and its intro, a summary box, the section links, then one <section>
// per part with its own h2: problem, data, method, the events and their questions, the dashboard with
// its Figure, findings, how I checked this, limits, and sources and links. The prose comes from
// content/pulse.tsx.
//
// Layout: prose sits in the readable column (max-w-text); the event table and the Figure run to the
// figure width. Sections are spaced, not boxed: no card grid and no motion. The event table sits in
// the same section as the sentences that call its questions design hypotheses; it is page-owned
// (TextTable), because its cells are sentences that wrap. It has no provenance
// badge: the export is the project's own source code, not public data, and the badge is for charts.
import type { ReactNode } from 'react';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { TextLink } from '@/components/kit/TextLink';
import { taxonomyTable } from '@/lib/pulse/tables';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import {
  PulseChecks,
  PulseDashboardIntro,
  PulseData,
  PulseFindings,
  PULSE_GLANCE,
  PulseIntro,
  PulseLimits,
  PulseMethod,
  PulseProblem,
  PulseSources,
  PulseSummary,
  PulseTaxonomyContext,
  PulseTitle,
  TAXONOMY_CAPTION,
} from '../../../content/pulse';
import { PulseFigure } from './PulseFigure';
import { TextTable } from '../tables/TextTable';

/** The page title: the event count as a Fact, then the claim it heads. */
export const PULSE_TITLE: ReactNode = <PulseTitle />;
/** The metadata title (no figure in it): the project's name and what it is. */
export const PULSE_METADATA_TITLE = 'Pulse: analytics instrumentation demo';

/** The sections in page order: anchor id, heading and the short label of its section link. */
export const PULSE_SECTIONS = [
  { id: 'summary', title: 'Summary', link: null },
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'data', title: 'The data', link: 'Data' },
  { id: 'method', title: 'Method', link: 'Method' },
  { id: 'taxonomy', title: 'The events and the questions behind them', link: 'Events' },
  { id: 'dashboard', title: 'The dashboard, on this page', link: 'Dashboard' },
  { id: 'findings', title: 'Findings', link: 'Findings' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof PULSE_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const EVIDENCE = 'mt-8';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = PULSE_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`pulse: no section ${id}`);
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
        {PULSE_SECTIONS.flatMap((s) =>
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

export function PulsePage(): ReactNode {
  return (
    <article aria-labelledby="pulse-page-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="pulse-page-title" className="text-2xl font-semibold md:text-3xl">
          {PULSE_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <PulseIntro />
        </div>
      </div>

      <GlanceBlock {...PULSE_GLANCE} data-depth-rise="" />

      <section id="summary" aria-labelledby="summary-title" className={`${TEXT} mt-8 border-y border-line py-6`}>
        <h2 id="summary-title" className="text-xl font-semibold" data-depth-rise="heading">
          Summary
        </h2>
        <div className="mt-4">
          <PulseSummary />
        </div>
      </section>

      <SectionLinks />

      <Section id="problem">
        <Prose>
          <PulseProblem />
        </Prose>
      </Section>

      <Section id="data">
        <Prose>
          <PulseData />
        </Prose>
      </Section>

      <Section id="method">
        <Prose>
          <PulseMethod />
        </Prose>
      </Section>

      <Section id="taxonomy">
        <Prose>
          <PulseTaxonomyContext />
        </Prose>
        <div className={`${EVIDENCE} max-w-figure`}>
          <TextTable id="pulse-events" caption={TAXONOMY_CAPTION} table={taxonomyTable(pulseTaxonomy())} />
        </div>
      </Section>

      <Section id="dashboard">
        <Prose>
          <PulseDashboardIntro />
        </Prose>
        <div className={EVIDENCE}>
          <PulseFigure />
        </div>
      </Section>

      <Section id="findings">
        <Prose>
          <PulseFindings />
        </Prose>
      </Section>

      <Section id="how-i-checked-this">
        <Prose>
          <PulseChecks />
        </Prose>
      </Section>

      <Section id="limits">
        <Prose>
          <PulseLimits />
        </Prose>
      </Section>

      <Section id="sources">
        <Prose>
          <PulseSources />
        </Prose>
      </Section>
    </article>
  );
}
