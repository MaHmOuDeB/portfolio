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
import { CohortFigureClient, InertCohortControls } from './CohortFigureClient';
import { CohortFigureView } from './CohortView';

export function CohortFigure({ rows, faultAfterChange }: { rows: readonly Cohort[]; faultAfterChange?: true }) {
  // The table is the export's, so the rows drawn must be the export's too.
  if (JSON.stringify(rows) !== JSON.stringify(COHORTS)) throw new Error('cohorts: the rows drawn must be the export’s cohort rows');
  const provenance = figureProvenance('retention');
  const cohort = cohortPresets(rows).default.cohort;
  return (
    <CohortFigureClient
      rows={rows}
      provenance={provenance}
      preview={
        <CohortFigureView
          rows={rows}
          cohort={cohort}
          provenance={provenance}
          table={cohortTable()}
          controls={<InertCohortControls rows={rows} cohort={cohort} />}
        />
      }
      faultAfterChange={faultAfterChange}
    />
  );
}
