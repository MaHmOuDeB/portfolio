// The Retention case study, the reference page every later page copies, in the reading model of the work
// pages: the head with its plain opening and the repository button, the glance card (three pull figures,
// one sentence, the facts and the scope), the in-page links, four findings (each a lead-in, its Figure in
// a sheet, a takeaway and the method one click deeper), how I did it and checked it as rows under one
// heading (the data, the method, the customer segments with their Figure, the reversal rule in SQL and
// the checks), the limits and the sources (visible), the close, and the previous and next case studies.
// The prose comes from content/retention.tsx, the Figures from this folder.
//
// The win-back finding is a sizing only: the sourced sizing table, then the planner placed through
// `planner` (a hypothetical uplift on the observed baseline, with its own Simulated badge), a link to
// the Lab and the targeting table. RetentionCaseStudy is the page as it ships, with the win-back
// planner; the route and its dev host both mount it.
import type { ReactNode } from 'react';
import { DataTable } from '@/components/kit/DataTable';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import type { KitText } from '@/components/kit/text';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { FullPlanner } from '@/components/lab/FullPlanner';
import type { Locale } from '@/lib/i18n/locale';
import { COHORTS, RETENTION, figureProvenance, sourceRepo } from '@/lib/retention/data';
import { holdoutTable, targetingTable } from '@/lib/retention/tables';
import {
  RETENTION_EN,
  RETENTION_SECTION_IDS,
  blocks,
  slotsFor,
  type RetentionSectionId,
} from '../../../content/retention';
import { CohortFigure } from './CohortFigure';
import { ModelFigure } from './ModelFigure';
import { ReturnsFigure } from './ReturnsFigure';
import { RfmFigure } from './RfmFigure';
import { retentionCopy } from './copy';

/** The h1, in two tones: what the page is for, then the quiet clause. */
export const RETENTION_TITLE = RETENTION_EN.title;
export const RETENTION_QUIET = RETENTION_EN.quiet;

/** The visible sections in page order: anchor id, heading and the short label of its in-page link (in English). */
export const RETENTION_SECTIONS = RETENTION_SECTION_IDS.map((id) => ({ id, ...RETENTION_EN.sections[id] }));

const TEXT = 'max-w-text';

function Section({ id, title, children }: { id: RetentionSectionId; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`} data-depth-rise="heading">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A sourced table with its own heading and badge, at the sheet's full width. */
function SourcedTable({
  id,
  title,
  table,
  text,
}: {
  id: string;
  title: string;
  table: ReturnType<typeof targetingTable>;
  text: KitText;
}) {
  return (
    <div data-sourced-table="">
      <h3 id={`${id}-heading`} className={`${TEXT} text-xl font-semibold`}>
        {title}
      </h3>
      <div className="mt-3 w-full [&_table]:w-full">
        <DataTable id={id} caption={title} table={table} mode="open" text={text} />
      </div>
      <div className="mt-2">
        <ProvenanceBadge kind={figureProvenance('retention')} text={text.badge} />
      </div>
    </div>
  );
}

export function RetentionPage({ planner, locale = 'en' }: { planner?: ReactNode; locale?: Locale } = {}): ReactNode {
  const c = retentionCopy(locale);
  const p = slotsFor(locale);
  const b = blocks(c, p);
  const frame = c.frame;
  const section = (id: RetentionSectionId, children: ReactNode) => (
    <Section id={id} title={c.sections[id].title}>
      {children}
    </Section>
  );
  const exhibit = (key: keyof typeof c.exhibits, figure: ReactNode, summary: string, method: ReactNode, tail?: ReactNode) => (
    <>
      <LeadIn label={frame.leadIn}>{c.exhibits[key].leadIn(p)}</LeadIn>
      <FigureSheet>{figure}</FigureSheet>
      <Takeaway label={frame.takeaway}>{c.exhibits[key].takeaway(p)}</Takeaway>
      <MethodDetails summary={summary}>{method}</MethodDetails>
      {tail}
    </>
  );
  return (
    <article aria-labelledby="retention-title">
      <CaseHead
        id="retention-title"
        chip={c.chip}
        title={c.title}
        quiet={c.quiet}
        intro={b.intro()}
        actions={[{ href: sourceRepo('retention').tree, label: c.github, icon: 'github', external: true }]}
      />

      <GlanceBlock {...c.glance(p)} labels={c.glanceLabels} />

      <SectionNav
        label={frame.sectionNav}
        items={RETENTION_SECTION_IDS.map((id) => ({ href: `#${id}`, label: c.sections[id].link }))}
      />

      {section(
        'returns-cleaning',
        exhibit(
          'returns',
          <ReturnsFigure text={locale === 'en' ? undefined : c.returns} />,
          c.summaries.reversal,
          b.cleaning(),
        ),
      )}

      {section(
        'cohort-retention',
        exhibit(
          'cohorts',
          <CohortFigure rows={COHORTS} text={locale === 'en' ? undefined : c.cohortsFigure} />,
          c.summaries.cohorts,
          b.cohorts(),
        ),
      )}

      {section(
        'repeat-order-model',
        exhibit('model', <ModelFigure locale={locale} />, c.summaries.model, b.model()),
      )}

      {section(
        'win-back-sizing',
        <>
          {exhibit(
            'winBack',
            <SourcedTable
              id="holdout-sizes"
              title={c.titles.holdout}
              table={holdoutTable(c.tables)}
              text={c.kit}
            />,
            c.summaries.sizing,
            <>
              {b.winBack()}
              {b.winBackReach()}
            </>,
          )}
          {planner ? (
            <FigureSheet>
              {/* The planner's kind-of-case label follows the result sentence; it stands on its own line, not glued to it. */}
              <div data-planner-wrap="" className="[&_[data-planner-result]+span]:mt-1 [&_[data-planner-result]+span]:block">
                {planner}
              </div>
            </FigureSheet>
          ) : null}
          <ul className={`${TEXT} mt-4`}>
            <li>{b.labLink()}</li>
          </ul>
          <div className={`${TEXT} mt-8`}>{b.targeting()}</div>
          <FigureSheet>
            <SourcedTable id="lapsed-targeting" title={c.titles.targeting} table={targetingTable(c.tables)} text={c.kit} />
          </FigureSheet>
        </>,
      )}

      {section(
        'how-i-checked-this',
        <div className="mt-6">
          <MethodDetails summary={c.summaries.data}>{b.data()}</MethodDetails>
          <MethodDetails summary={c.summaries.method}>{b.methodSteps()}</MethodDetails>
          <MethodDetails summary={c.summaries.segments}>
            {b.segments()}
            <div className="mt-6">
              <RfmFigure rows={RETENTION.tables.rfm_segments} locale={locale} />
            </div>
          </MethodDetails>
          <MethodDetails summary={c.summaries.sql}>{b.sqlExcerpt()}</MethodDetails>
          <MethodDetails summary={c.summaries.checked}>{b.checks()}</MethodDetails>
        </div>,
      )}

      {section(
        'limits',
        <div className={`${TEXT} mt-4`}>{b.limits()}</div>,
      )}

      {section(
        'sources',
        <div className={`${TEXT} mt-4`}>{b.sources()}</div>,
      )}

      <PageClose title={frame.pageClose} links={[{ href: p.href('/lab#sample-size'), label: c.closeLink }]}>
        {b.close()}
      </PageClose>
      <NextRow
        label={frame.nextRow}
        prev={{ href: p.href('/work/audible'), label: c.neighbours.prev.label, kicker: c.neighbours.prev.kicker }}
        next={{ href: p.href('/work/pulse'), label: c.neighbours.next.label, kicker: c.neighbours.next.kicker }}
      />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction locale={locale} />
    </article>
  );
}

/** The page as it ships: the composition with the win-back planner in its sizing section. */
export function RetentionCaseStudy({ locale = 'en', planner }: { locale?: Locale; planner?: ReactNode } = {}): ReactNode {
  return (
    <RetentionPage
      locale={locale}
      planner={planner ?? (locale === 'en' ? <FullPlanner id="winback" durationId="winback-duration" context="retention" /> : undefined)}
    />
  );
}
