// The Retention case study, the reference page every later page copies. It follows the analysis
// template: a summary, then problem, data, method, one section per analysis step with its Figure,
// findings, how I checked this, limits and links. The prose comes from content/retention.tsx, the
// Figures from this folder, and each section is a <section> with its own h2, so the outline and the
// anchors are the same everywhere the page is mounted (the route and its dev host).
//
// Layout: prose sits in the readable column (max-w-text); Figures and tables run to the figure
// width (max-w-figure), so evidence is wider than text. Sections are spaced, not boxed: no card
// grid and no motion. The win-back section is a sizing only: the sourced sizing and its table, then
// the planner placed through `planner` (a hypothetical uplift on the observed baseline, with its own
// Simulated badge), a link to the Lab and a link to the Home planner. RetentionCaseStudy is the page
// as it ships, with the win-back planner; the route and its dev host both mount it.
import type { ReactNode } from 'react';
import { DataTable } from '@/components/kit/DataTable';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { TextLink } from '@/components/kit/TextLink';
import { FullPlanner } from '@/components/lab/FullPlanner';
import { COHORTS, RETENTION, figureProvenance } from '@/lib/retention/data';
import { holdoutTable, targetingTable } from '@/lib/retention/tables';
import {
  HOLDOUT_TITLE,
  RetentionChecks,
  RetentionCleaning,
  RetentionCleaningStats,
  RetentionCohorts,
  RetentionData,
  RetentionFindings,
  RetentionHomePlannerLink,
  RETENTION_GLANCE,
  RetentionIntro,
  RetentionLabLink,
  RetentionLimits,
  RetentionMethodSteps,
  RetentionModel,
  RetentionProblem,
  RetentionSegments,
  RetentionSources,
  RetentionSqlExcerpt,
  RetentionSummary,
  RetentionTargeting,
  RetentionWinBack,
  RetentionWinBackReach,
  TARGETING_TITLE,
} from '../../../content/retention';
import { CohortFigure } from './CohortFigure';
import { ModelFigure } from './ModelFigure';
import { ReturnsFigure } from './ReturnsFigure';
import { RfmFigure } from './RfmFigure';

export const RETENTION_TITLE = 'Customer retention and reactivation analysis';

/** The sections in page order: anchor id, heading and the short label of its section link. */
export const RETENTION_SECTIONS = [
  { id: 'summary', title: 'Summary', link: null },
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'data', title: 'The data', link: 'Data' },
  { id: 'method', title: 'Method', link: 'Method' },
  { id: 'returns-cleaning', title: 'Cleaning: reversed orders and returns', link: 'Cleaning' },
  { id: 'cohort-retention', title: 'Cohorts: who orders again, month by month', link: 'Cohorts' },
  { id: 'customer-segments', title: 'Customer segments', link: 'Segments' },
  { id: 'repeat-order-model', title: 'A model of who orders again', link: 'Model' },
  { id: 'win-back-sizing', title: 'Sizing a win-back test', link: 'Win-back sizing' },
  { id: 'findings', title: 'Findings', link: 'Findings' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof RETENTION_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const EVIDENCE = 'mt-8';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = RETENTION_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`retention: no section ${id}`);
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

/** A sourced table with its own heading and badge: evidence without a chart. */
function SourcedTable({ id, title, table }: { id: string; title: string; table: ReturnType<typeof targetingTable> }) {
  return (
    <div className={`${EVIDENCE} max-w-figure`}>
      <h3 id={`${id}-heading`} className={`${TEXT} text-xl font-semibold`}>
        {title}
      </h3>
      <div className="mt-3">
        <DataTable id={id} caption={title} table={table} mode="open" />
      </div>
      <div className="mt-2">
        <ProvenanceBadge kind={figureProvenance('retention')} />
      </div>
    </div>
  );
}

/** The links to each section after the summary, as one wrapping row of 44 px targets. */
function SectionLinks() {
  return (
    <nav aria-label="On this page" className={`${TEXT} mt-8`}>
      <ul className="flex flex-wrap gap-x-4">
        {RETENTION_SECTIONS.flatMap((s) =>
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

export function RetentionPage({ planner }: { planner?: ReactNode } = {}): ReactNode {
  return (
    <article aria-labelledby="retention-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="retention-title" className="text-2xl font-semibold md:text-3xl">
          {RETENTION_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <RetentionIntro />
        </div>
      </div>

      <GlanceBlock {...RETENTION_GLANCE} data-depth-rise="" />

      <section id="summary" aria-labelledby="summary-title" className={`${TEXT} mt-8 border-y border-line py-6`}>
        <h2 id="summary-title" className="text-xl font-semibold" data-depth-rise="heading">
          Summary
        </h2>
        <div className="mt-4">
          <RetentionSummary />
        </div>
      </section>

      <SectionLinks />

      <Section id="problem">
        <Prose>
          <RetentionProblem />
        </Prose>
      </Section>

      <Section id="data">
        <Prose>
          <RetentionData />
        </Prose>
      </Section>

      <Section id="method">
        <Prose>
          <RetentionMethodSteps />
        </Prose>
      </Section>

      <Section id="returns-cleaning">
        <div className={TEXT}>
          <RetentionCleaningStats />
        </div>
        <div className={`${TEXT} mt-8`}>
          <RetentionCleaning />
        </div>
        <div className={EVIDENCE}>
          <ReturnsFigure />
        </div>
      </Section>

      <Section id="cohort-retention">
        <Prose>
          <RetentionCohorts />
        </Prose>
        <div className={EVIDENCE}>
          <CohortFigure rows={COHORTS} />
        </div>
      </Section>

      <Section id="customer-segments">
        <Prose>
          <RetentionSegments />
        </Prose>
        <div className={EVIDENCE}>
          <RfmFigure rows={RETENTION.tables.rfm_segments} />
        </div>
      </Section>

      <Section id="repeat-order-model">
        <Prose>
          <RetentionModel />
        </Prose>
        <div className={EVIDENCE}>
          <ModelFigure />
        </div>
      </Section>

      <Section id="win-back-sizing">
        <Prose>
          <RetentionWinBack />
          <RetentionWinBackReach />
        </Prose>
        <SourcedTable id="holdout-sizes" title={HOLDOUT_TITLE} table={holdoutTable()} />
        {planner ? <div className={EVIDENCE}>{planner}</div> : null}
        <ul className={`${TEXT} mt-4`}>
          <li>
            <RetentionLabLink />
          </li>
          <li>
            <RetentionHomePlannerLink />
          </li>
        </ul>
        <div className={`${TEXT} mt-8`}>
          <RetentionTargeting />
        </div>
        <SourcedTable id="lapsed-targeting" title={TARGETING_TITLE} table={targetingTable()} />
      </Section>

      <Section id="findings">
        <Prose>
          <RetentionFindings />
        </Prose>
      </Section>

      <Section id="how-i-checked-this">
        <RetentionSqlExcerpt />
        <div className={`${TEXT} mt-8`}>
          <RetentionChecks />
        </div>
      </Section>

      <Section id="limits">
        <Prose>
          <RetentionLimits />
        </Prose>
      </Section>

      <Section id="sources">
        <Prose>
          <RetentionSources />
        </Prose>
      </Section>
    </article>
  );
}

/** The page as it ships: the composition with the win-back planner in its sizing section. */
export function RetentionCaseStudy(): ReactNode {
  return <RetentionPage planner={<FullPlanner id="winback" durationId="winback-duration" context="retention" />} />;
}
