'use client';

// The cohort Figure's island, loaded by EagerOrIntent (CohortFigureClient imports it lazily). It
// reads and writes its URL state (`?cohorts.cohort=2010-03`), draws the chosen cohort and announces
// the result on a committed change only: Previous, Next or Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the current table, never a preset chart beside it. `faultAfterChange` (a
// test seam, absent in production) is forwarded unchanged to the view, whose chart then throws on
// the first render after a cohort change.
import { useEffect, useState } from 'react';
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { COHORTS_ID, cohortAt, cohortPresets, cohortSchema, cohortTableFrom, type Cohort } from '@/lib/retention/cohorts';
import { CohortControls } from './CohortFigureClient';
import { CohortFigureView, cohortResultText } from './CohortView';

export type CohortInteractiveProps = {
  rows: readonly Cohort[];
  provenance: Provenance;
  faultAfterChange?: true;
};

const CONTROLS = `#${COHORTS_ID} [data-figure-controls] button`;

/** The position of the preview's control button that holds focus as the island first renders, if any. */
function focusedPreviewButton(): number | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement)) return null;
  const index = [...document.querySelectorAll(CONTROLS)].indexOf(active);
  return index < 0 ? null : index;
}

export default function CohortInteractive({ rows, provenance, faultAfterChange }: CohortInteractiveProps) {
  // The schema and the preset come from the rows, once: useFigureParams needs them stable.
  const [schema] = useState(() => cohortSchema(rows));
  const [presets] = useState(() => cohortPresets(rows));
  const { values, preset, set, reset } = useFigureParams(COHORTS_ID, schema, presets);
  // The loader hands focus from the preview to the island by element id, and the kit's StepNav and
  // Reset buttons have none: a keyboard visitor who tabbed into the preview would be left on <body>
  // when it is replaced. The island focuses its own button at the same place once the preview is
  // gone (the frame after the swap), unless focus has gone somewhere else meanwhile.
  const [handoff] = useState(focusedPreviewButton);
  useEffect(() => {
    if (handoff === null) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      document.querySelectorAll<HTMLButtonElement>(CONTROLS)[handoff]?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [handoff]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const cohort = values.cohort;
  return (
    <CohortFigureView
      rows={rows}
      cohort={cohort}
      provenance={provenance}
      table={cohortTableFrom(rows)}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <CohortControls
          rows={rows}
          cohort={cohort}
          onCohort={(next) => {
            set('cohort', next);
            setChanged(true);
            setAnnouncement(cohortResultText(cohortAt(rows, next).row));
          }}
          onReset={() =>
            instantly(COHORTS_ID, () => {
              reset();
              setAnnouncement(cohortResultText(cohortAt(rows, presets[preset]!.cohort).row));
            })
          }
        />
      }
    />
  );
}
