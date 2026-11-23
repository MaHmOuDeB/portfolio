// The Pulse case study, in the reading model of the work pages: the head with its plain opening and the
// repository button, the glance card (two pull figures, one sentence, the facts and the scope), the
// in-page links, the on-page dashboard first (lead-in, its Figure in a sheet, takeaway, and how the copy
// works one click deeper), the event table, how I built and checked it as rows under one heading, the
// limits and the sources (visible), the close, and the previous and next case studies. The prose comes
// from content/pulse.tsx (English) and content/de/pulse.tsx (German), picked by `locale`.
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
import type { Locale } from '@/lib/i18n/locale';
import { taxonomyTable } from '@/lib/pulse/tables';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import { PULSE_EN, PULSE_REPO_URL, PULSE_SECTION_IDS, blocks, slotsFor, type PulseSectionId } from '../../../content/pulse';
import { PulseFigure } from './PulseFigure';
import { PLAIN_QUESTIONS } from './plain-questions';
import { pulseCopy } from './copy';
import { TextTable } from '../tables/TextTable';

/** The page title: the event count as a Fact, then the claim it heads. */
export const PULSE_TITLE: ReactNode = blocks(PULSE_EN, slotsFor('en')).title();
/** The metadata title (no figure in it): the project's name and what it is. */
export const PULSE_METADATA_TITLE = 'Pulse: a tracking plan for product analytics';

/** The visible sections in page order: anchor id, heading and the short label of its in-page link (in English). */
export const PULSE_SECTIONS = PULSE_SECTION_IDS.map((id) => ({ id, ...PULSE_EN.sections[id] }));

/** The taxonomy table with the dashed question cells in plain punctuation. Throws if a cell it expects is gone. */
export function plainTaxonomyTable(table: TableData, note: string = PULSE_EN.taxonomy.plainNote): TableData {
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
  return { ...table, rows, note };
}

const TEXT = 'max-w-text';
/** The event table's four columns hold the export's own words, which stay English on a German page. */
const EXPORT_WORDS_LANG = ['en', 'en', 'en', 'en'] as const;

export function PulsePage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const c = pulseCopy(locale);
  const s = slotsFor(locale);
  const b = blocks(c, s);
  const frame = c.frame;
  const section = (id: PulseSectionId, children: ReactNode) => (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`} data-depth-rise="heading">
        {c.sections[id].title}
      </h2>
      {children}
    </section>
  );
  return (
    <article aria-labelledby="pulse-page-title">
      <CaseHead
        id="pulse-page-title"
        chip={c.chip}
        title={b.title()}
        intro={b.intro()}
        actions={[{ href: PULSE_REPO_URL, label: c.github, icon: 'github', external: true }]}
      />

      <GlanceBlock {...b.glance()} labels={c.glanceLabels} />

      <SectionNav label={frame.sectionNav} items={PULSE_SECTION_IDS.map((id) => ({ href: `#${id}`, label: c.sections[id].link }))} />

      {section(
        'dashboard',
        <>
          <LeadIn label={frame.leadIn}>{b.dashboardLeadIn()}</LeadIn>
          <FigureSheet>
            <PulseFigure locale={locale} />
          </FigureSheet>
          <Takeaway label={frame.takeaway}>{b.dashboardTakeaway()}</Takeaway>
          <MethodDetails summary={c.dashboard.summary}>{b.dashboardIntro()}</MethodDetails>
        </>,
      )}

      {section(
        'taxonomy',
        <>
          <LeadIn label={frame.leadIn}>{b.taxonomyLeadIn()}</LeadIn>
          <FigureSheet>
            <TextTable
              id="pulse-events"
              caption={c.taxonomy.caption}
              table={plainTaxonomyTable(taxonomyTable(pulseTaxonomy(), c.taxonomy.table), c.taxonomy.plainNote)}
              {...(locale === 'en' ? {} : { locale, lang: EXPORT_WORDS_LANG })}
            />
          </FigureSheet>
        </>,
      )}

      {section(
        'how-i-checked-this',
        <div className="mt-6">
          <MethodDetails summary={c.summaries.data}>{b.data()}</MethodDetails>
          <MethodDetails summary={c.summaries.method}>{b.method()}</MethodDetails>
          <MethodDetails summary={c.summaries.checked}>{b.checks()}</MethodDetails>
        </div>,
      )}

      {section('limits', <div className={`${TEXT} mt-4`}>{b.limits()}</div>)}

      {section('sources', <div className={`${TEXT} mt-4`}>{b.sources()}</div>)}

      <PageClose title={frame.pageClose} links={[{ href: s.href('/lab'), label: c.closeLink }]}>
        {b.close()}
      </PageClose>
      <NextRow
        label={frame.nextRow}
        prev={{ href: s.href('/work/retention'), label: c.neighbours.prev.label, kicker: c.neighbours.prev.kicker }}
        next={{ href: s.href('/work/weather'), label: c.neighbours.next.label, kicker: c.neighbours.next.kicker }}
      />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction locale={locale} />
    </article>
  );
}
