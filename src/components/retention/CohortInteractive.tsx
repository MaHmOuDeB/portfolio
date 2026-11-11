'use client';

// The cohort Figure's island, loaded by EagerOrIntent (CohortFigureClient imports it lazily). It
// reads and writes its URL state (`?cohorts.cohort=2010-03`), draws the chosen cohort and announces
// the result on a committed change only: Previous, Next or Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the current table, never a preset chart beside it. `faultAfterChange` (a
// test seam, absent in production) is forwarded unchanged to the view, whose chart then throws on
// the first render after a cohort change.
import { useLayoutEffect, useState } from 'react';
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

const CONTROLS = `#${COHORTS_ID} [data-cohort-controls] button`;
/** Frames to wait for the preview to leave and the island's control to exist. */
const HANDOFF_FRAMES = 120;

type Handoff = { element: HTMLElement; index: number };

/** The preview's control button (Previous, Next or Reset) that holds focus as the island first renders, if any. */
function focusedPreviewButton(): Handoff | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement)) return null;
  const index = [...document.querySelectorAll(CONTROLS)].indexOf(active);
  return index < 0 ? null : { element: active, index };
}

export default function CohortInteractive({ rows, provenance, faultAfterChange }: CohortInteractiveProps) {
  // The schema and the preset come from the rows, once: useFigureParams needs them stable.
  const [schema] = useState(() => cohortSchema(rows));
  const [presets] = useState(() => cohortPresets(rows));
  const { values, preset, set, reset } = useFigureParams(COHORTS_ID, schema, presets);
  // The loader hands focus from the preview to the island by element id, and the kit's StepNav and
  // Reset buttons have none: a keyboard visitor on a preview control would be left on <body> when
  // the preview goes. The island remembers that button's place and focuses its own button there as
  // soon as the preview has left: in a microtask after this commit (the loader removes the preview
  // in a synchronous update of the same commit, so before the browser paints), then each frame
  // while the preview is still there or the button does not exist yet. It stops if focus has gone
  // anywhere else. The same handoff as the returns Figure's island.
  const [handoff] = useState(focusedPreviewButton);
  useLayoutEffect(() => {
    if (handoff === null) return;
    let live = true;
    let frame = 0;
    let tries = 0;
    const place = () => {
      if (!live) return;
      const active = document.activeElement;
      const previewStays = active === handoff.element && handoff.element.isConnected;
      const lost = active === null || active === document.body || (active === handoff.element && !handoff.element.isConnected);
      const target = document.querySelectorAll<HTMLButtonElement>(CONTROLS)[handoff.index];
      if (lost && target !== undefined && target !== handoff.element) {
        target.focus();
        return;
      }
      if ((previewStays || lost) && tries++ < HANDOFF_FRAMES) frame = requestAnimationFrame(place);
    };
    queueMicrotask(place);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
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
