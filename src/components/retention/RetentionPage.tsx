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
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { FullPlanner } from '@/components/lab/FullPlanner';
import { COHORTS, RETENTION, figureProvenance, sourceRepo } from '@/lib/retention/data';
import { holdoutTable, targetingTable } from '@/lib/retention/tables';
import {
  CohortLeadIn,
  CohortTakeaway,
  HOLDOUT_TITLE,
  ModelLeadIn,
  ModelTakeaway,
  RETENTION_GLANCE,
  RetentionChecks,
  RetentionCleaning,
  RetentionClose,
  RetentionCohorts,
  RetentionData,
  RetentionIntro,
  RetentionLabLink,
  RetentionLimits,
  RetentionMethodSteps,
  RetentionModel,
  RetentionSegments,
  RetentionSources,
  RetentionSqlExcerpt,
  RetentionTargeting,
  RetentionWinBack,
  RetentionWinBackReach,
  ReturnsLeadIn,
  ReturnsTakeaway,
  TARGETING_TITLE,
  WinBackLeadIn,
  WinBackTakeaway,
} from '../../../content/retention';
import { CohortFigure } from './CohortFigure';
import { ModelFigure } from './ModelFigure';
import { ReturnsFigure } from './ReturnsFigure';
import { RfmFigure } from './RfmFigure';

/** The h1, in two tones: what the page is for, then the quiet clause. */
export const RETENTION_TITLE = 'Who orders again,';
export const RETENTION_QUIET = 'and how to test a win-back offer.';

/** The visible sections in page order: anchor id, heading and the short label of its in-page link. */
export const RETENTION_SECTIONS = [
  { id: 'returns-cleaning', title: 'A double count made returns look like they grew', link: 'Returns' },
  { id: 'cohort-retention', title: 'Who orders again, month by month', link: 'Cohorts' },
  { id: 'repeat-order-model', title: 'A model of who orders again', link: 'Model' },
  { id: 'win-back-sizing', title: 'Sizing a win-back test', link: 'Win-back sizing' },
  { id: 'how-i-checked-this', title: 'How I did it and checked it', link: 'How I checked this' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof RETENTION_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = RETENTION_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`retention: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`} data-depth-rise="heading">
        {entry.title}
      </h2>
      {children}
    </section>
  );
}

/** A sourced table with its own heading and badge, at the sheet's full width. */
function SourcedTable({ id, title, table }: { id: string; title: string; table: ReturnType<typeof targetingTable> }) {
  return (
    <div data-sourced-table="">
      <h3 id={`${id}-heading`} className={`${TEXT} text-xl font-semibold`}>
        {title}
      </h3>
      <div className="mt-3 w-full [&_table]:w-full">
        <DataTable id={id} caption={title} table={table} mode="open" />
      </div>
      <div className="mt-2">
        <ProvenanceBadge kind={figureProvenance('retention')} />
      </div>
    </div>
  );
}

export function RetentionPage({ planner }: { planner?: ReactNode } = {}): ReactNode {
  return (
    <article aria-labelledby="retention-title">
      <CaseHead
        id="retention-title"
        chip="Case study"
        title={RETENTION_TITLE}
        quiet={RETENTION_QUIET}
        intro={<RetentionIntro />}
        actions={[{ href: sourceRepo('retention').tree, label: 'See the code on GitHub', icon: 'github', external: true }]}
      />

      <GlanceBlock {...RETENTION_GLANCE} />

      <SectionNav items={RETENTION_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.link }))} />

      <Section id="returns-cleaning">
        <LeadIn>
          <ReturnsLeadIn />
        </LeadIn>
        <FigureSheet>
          <ReturnsFigure />
        </FigureSheet>
        <Takeaway>
          <ReturnsTakeaway />
        </Takeaway>
        <MethodDetails summary="How the reversal rule works">
          <RetentionCleaning />
        </MethodDetails>
      </Section>

      <Section id="cohort-retention">
        <LeadIn>
          <CohortLeadIn />
        </LeadIn>
        <FigureSheet>
          <CohortFigure rows={COHORTS} />
        </FigureSheet>
        <Takeaway>
          <CohortTakeaway />
        </Takeaway>
        <MethodDetails summary="How the cohorts are built">
          <RetentionCohorts />
        </MethodDetails>
      </Section>

      <Section id="repeat-order-model">
        <LeadIn>
          <ModelLeadIn />
        </LeadIn>
        <FigureSheet>
          <ModelFigure />
        </FigureSheet>
        <Takeaway>
          <ModelTakeaway />
        </Takeaway>
        <MethodDetails summary="How the model is trained and scored">
          <RetentionModel />
        </MethodDetails>
      </Section>

      <Section id="win-back-sizing">
        <LeadIn>
          <WinBackLeadIn />
        </LeadIn>
        <FigureSheet>
          <SourcedTable id="holdout-sizes" title={HOLDOUT_TITLE} table={holdoutTable()} />
        </FigureSheet>
        <Takeaway>
          <WinBackTakeaway />
        </Takeaway>
        <MethodDetails summary="How the test is sized">
          <RetentionWinBack />
          <RetentionWinBackReach />
        </MethodDetails>
        {planner ? <FigureSheet>{planner}</FigureSheet> : null}
        <ul className={`${TEXT} mt-4`}>
          <li>
            <RetentionLabLink />
          </li>
        </ul>
        <div className={`${TEXT} mt-8`}>
          <RetentionTargeting />
        </div>
        <FigureSheet>
          <SourcedTable id="lapsed-targeting" title={TARGETING_TITLE} table={targetingTable()} />
        </FigureSheet>
      </Section>

      <Section id="how-i-checked-this">
        <div className="mt-6">
          <MethodDetails summary="The data">
            <RetentionData />
          </MethodDetails>
          <MethodDetails summary="Method">
            <RetentionMethodSteps />
          </MethodDetails>
          <MethodDetails summary="Customer segments">
            <RetentionSegments />
            <div className="mt-6">
              <RfmFigure rows={RETENTION.tables.rfm_segments} />
            </div>
          </MethodDetails>
          <MethodDetails summary="The reversal rule in SQL">
            <RetentionSqlExcerpt />
          </MethodDetails>
          <MethodDetails summary="How I checked this">
            <RetentionChecks />
          </MethodDetails>
        </div>
      </Section>

      <Section id="limits">
        <div className={`${TEXT} mt-4`}>
          <RetentionLimits />
        </div>
      </Section>

      <Section id="sources">
        <div className={`${TEXT} mt-4`}>
          <RetentionSources />
        </div>
      </Section>

      <PageClose links={[{ href: '/lab#sample-size', label: 'Try other baselines in the Lab' }]}>
        <RetentionClose />
      </PageClose>
      <NextRow prev={{ href: '/work/audible', label: 'Audible' }} next={{ href: '/work/pulse', label: 'Pulse' }} />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction />
    </article>
  );
}

/** The page as it ships: the composition with the win-back planner in its sizing section. */
export function RetentionCaseStudy(): ReactNode {
  return <RetentionPage planner={<FullPlanner id="winback" durationId="winback-duration" context="retention" />} />;
}
