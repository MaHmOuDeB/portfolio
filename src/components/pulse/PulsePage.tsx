// The Pulse case study, in the reading model of the work pages: the head with its plain opening and the
// repository button, the glance card (two pull figures, one sentence, the facts and the scope), the
// in-page links, the on-page dashboard first (lead-in, its Figure in a sheet, takeaway, and how the copy
// works one click deeper), the event table, how I built and checked it as rows under one heading, the
// limits and the sources (visible), the close, and the previous and next case studies. The prose comes
// from content/pulse.tsx.
//
// The event table is page-owned (TextTable), because its cells are sentences that wrap. It has no
// provenance badge: the export is the project's own source code, not public data, and the badge is for
// charts. Four of its question cells carry a dash in the README; the page says the same in plain
// punctuation, and names that in the table's note.
import type { ReactNode } from 'react';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import type { TableData } from '@/components/kit/DataTable';
import { taxonomyTable } from '@/lib/pulse/tables';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import {
  PULSE_GLANCE,
  PULSE_REPO_URL,
  PulseChecks,
  PulseClose,
  PulseDashboardIntro,
  PulseDashboardLeadIn,
  PulseDashboardTakeaway,
  PulseData,
  PulseIntro,
  PulseLimits,
  PulseMethod,
  PulseSources,
  PulseTaxonomyLeadIn,
  PulseTitle,
  TAXONOMY_CAPTION,
} from '../../../content/pulse';
import { PulseFigure } from './PulseFigure';
import { PLAIN_QUESTIONS } from './plain-questions';
import { TextTable } from '../tables/TextTable';

/** The page title: the event count as a Fact, then the claim it heads. */
export const PULSE_TITLE: ReactNode = <PulseTitle />;
/** The metadata title (no figure in it): the project's name and what it is. */
export const PULSE_METADATA_TITLE = 'Pulse: a tracking plan for product analytics';

/** The visible sections in page order: anchor id, heading and the short label of its in-page link. */
export const PULSE_SECTIONS = [
  { id: 'dashboard', title: 'The dashboard, on this page', link: 'Dashboard' },
  { id: 'taxonomy', title: 'The events and the questions behind them', link: 'Events' },
  { id: 'how-i-checked-this', title: 'How I built and checked it', link: 'How I checked this' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof PULSE_SECTIONS)[number]['id'];

/** The taxonomy table with the dashed question cells in plain punctuation. Throws if a cell it expects is gone. */
export function plainTaxonomyTable(table: TableData): TableData {
  const seen = new Set<string>();
  const rows = table.rows.map((row) =>
    row.map((cell) => {
      if (typeof cell === 'string' && cell in PLAIN_QUESTIONS) {
        seen.add(cell);
        return PLAIN_QUESTIONS[cell]!;
      }
      return cell;
    }),
  );
  for (const cell of Object.keys(PLAIN_QUESTIONS)) {
    if (!seen.has(cell)) throw new Error(`pulse: the export no longer has the cell "${cell}"`);
  }
  return {
    ...table,
    rows,
    note: "Names and properties as the source code states them; triggers and questions as the project's README states them, in plain punctuation.",
  };
}

const TEXT = 'max-w-text';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = PULSE_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`pulse: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`} data-depth-rise="heading">
        {entry.title}
      </h2>
      {children}
    </section>
  );
}

export function PulsePage(): ReactNode {
  return (
    <article aria-labelledby="pulse-page-title">
      <CaseHead
        id="pulse-page-title"
        chip="Case study"
        title={PULSE_TITLE}
        intro={<PulseIntro />}
        actions={[{ href: PULSE_REPO_URL, label: 'See the code on GitHub', icon: 'github', external: true }]}
      />

      <GlanceBlock {...PULSE_GLANCE} />

      <SectionNav items={PULSE_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.link }))} />

      <Section id="dashboard">
        <LeadIn>
          <PulseDashboardLeadIn />
        </LeadIn>
        <FigureSheet>
          <PulseFigure />
        </FigureSheet>
        <Takeaway>
          <PulseDashboardTakeaway />
        </Takeaway>
        <MethodDetails summary="How this copy of the dashboard works">
          <PulseDashboardIntro />
        </MethodDetails>
      </Section>

      <Section id="taxonomy">
        <LeadIn>
          <PulseTaxonomyLeadIn />
        </LeadIn>
        <FigureSheet>
          <TextTable id="pulse-events" caption={TAXONOMY_CAPTION} table={plainTaxonomyTable(taxonomyTable(pulseTaxonomy()))} />
        </FigureSheet>
      </Section>

      <Section id="how-i-checked-this">
        <div className="mt-6">
          <MethodDetails summary="The data">
            <PulseData />
          </MethodDetails>
          <MethodDetails summary="Method">
            <PulseMethod />
          </MethodDetails>
          <MethodDetails summary="How I checked this">
            <PulseChecks />
          </MethodDetails>
        </div>
      </Section>

      <Section id="limits">
        <div className={`${TEXT} mt-4`}>
          <PulseLimits />
        </div>
      </Section>

      <Section id="sources">
        <div className={`${TEXT} mt-4`}>
          <PulseSources />
        </div>
      </Section>

      <PageClose links={[{ href: '/lab', label: 'See the Lab' }]}>
        <PulseClose />
      </PageClose>
      <NextRow prev={{ href: '/work/retention', label: 'Retention' }} next={{ href: '/work/docproof', label: 'Docproof' }} />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction />
    </article>
  );
}
