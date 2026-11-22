// The cohort Figure as a page places it. The server draws the preset cohort with the sourced table
// (the static HTML, also what a visitor without JavaScript keeps, with the open table) and hands the
// island only the cohort rows it plots and the badge. The island loads on intent, or at once for a
// URL with `cohorts.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a cohort change. Only a test host sets it.
import { COHORTS, figureProvenance, type Cohort } from '@/lib/retention/data';
import { cohortPresets } from '@/lib/retention/cohorts';
import { cohortTable } from '@/lib/retention/tables';
import { EN_COHORTS, type CohortText } from '@/lib/retention/text';
import { CohortFigureClient, InertCohortControls } from './CohortFigureClient';
import { CohortFigureView } from './CohortView';

/** `text` is the Figure's words in a language other than English; English (the default) hands the island nothing. */
export function CohortFigure({ rows, faultAfterChange, text }: { rows: readonly Cohort[]; faultAfterChange?: true; text?: CohortText }) {
  // The table is the export's, so the rows drawn must be the export's too.
  if (JSON.stringify(rows) !== JSON.stringify(COHORTS)) throw new Error('cohorts: the rows drawn must be the export’s cohort rows');
  const provenance = figureProvenance('retention');
  const cohort = cohortPresets(rows).default.cohort;
  const view = (
    <CohortFigureView
      rows={rows}
      cohort={cohort}
      provenance={provenance}
      table={cohortTable(text ?? EN_COHORTS)}
      controls={text ? <InertCohortControls rows={rows} cohort={cohort} text={text} /> : <InertCohortControls rows={rows} cohort={cohort} />}
      text={text}
    />
  );
  // A client component gets `text` only in a language other than English, so the English payload is unchanged.
  return text ? (
    <CohortFigureClient rows={rows} provenance={provenance} preview={view} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <CohortFigureClient rows={rows} provenance={provenance} preview={view} faultAfterChange={faultAfterChange} />
  );
}
