'use client';

// The client side of the cohort Figure that the page loads at once, kept small:
// - CohortFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - CohortIsland is the lazy island; its code (the URL hook and the charts) is fetched only when the
//   loader renders it.
// - CohortControls is the control row, in a group named by the Figure's title, shared by the island
//   and the preview: the cohort picker (the kit's StepNav, Previous and Next through the cohorts in
//   order, with the chosen cohort named above it) and Reset. Eleven cohorts do not fit a segmented
//   row at phone or tablet widths; Previous and Next do, at 320 px. InertCohortControls is the
//   preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the chart throws on the first render after a cohort change, so
// the error fallback can be tested in the browser. It is only ever forwarded here under its own
// name, never set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { derivedAttr } from '@/components/kit/Derived';
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import { ResetButton } from '@/components/kit/ResetButton';
import { StepNav } from '@/components/kit/StepNav';
import { COHORTS_ID, COHORTS_REFS, cohortAt, monthLabel, type Cohort } from '@/lib/retention/cohorts';
import type { CohortInteractiveProps } from './CohortInteractive';

const LazyCohorts = lazy(() => import('./CohortInteractive'));

export function CohortIsland(props: CohortInteractiveProps) {
  return <LazyCohorts {...props} />;
}

export function CohortControls({
  rows,
  cohort,
  onCohort,
  onReset,
}: {
  rows: readonly Cohort[];
  cohort: string;
  onCohort: (cohort: string) => void;
  onReset: () => void;
}) {
  const { index } = cohortAt(rows, cohort);
  return (
    <div
      role="group"
      aria-labelledby={`${COHORTS_ID}-title`}
      data-cohort-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      <div className="min-w-0">
        <p className="text-sm text-muted">
          Cohort: <span className="text-ink" {...derivedAttr(COHORTS_REFS)}>{monthLabel(cohort)}</span>
        </p>
        <div className="mt-1">
          <StepNav
            label="Cohort"
            current={index + 1}
            total={rows.length}
            refs={COHORTS_REFS}
            onChange={(next) => {
              const row = rows[next - 1];
              if (row) onCohort(row.cohort_month);
            }}
          />
        </div>
      </div>
      <ResetButton onReset={onReset} />
    </div>
  );
}

const noop = () => {};

export function InertCohortControls({ rows, cohort }: { rows: readonly Cohort[]; cohort: string }) {
  return <CohortControls rows={rows} cohort={cohort} onCohort={noop} onReset={noop} />;
}

export function CohortFigureClient({
  rows,
  provenance,
  preview,
  faultAfterChange,
}: {
  /** The cohort rows the charts plot, the only data the island receives. */
  rows: readonly Cohort[];
  /** The badge, read on the server from the export's metadata. */
  provenance: Provenance;
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[COHORTS_ID]} preview={preview}>
      <CohortIsland rows={rows} provenance={provenance} faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
