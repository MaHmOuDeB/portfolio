'use client';

// The Lab planner's island, loaded by EagerOrIntent (FullPlannerControls imports it lazily; the
// server never imports it). It owns the three values with their URL state
// (`?planner.baseline=0.3&planner.risePoints=4&planner.traffic=500`) and announces the result line
// with both readouts on a committed change only: slider release, a key release, a typed value or
// Reset, never during a drag.
//
// - Joint URL state: a baseline change can lower the rise (the target never passes 99%), so every
//   change writes all three normalized values. The latest values are kept in a ref: a slider's release
//   handler is the one from the render where the drag began, so it cannot read the rise from its own
//   closure after a cap.
// - It passes `preview={false}` to the Figure: if its readout throws after a change, the fallback
//   shows the kit's sentence and the current table, never a preset readout beside it.
//   `faultAfterChange` (a test seam, absent in production) is forwarded unchanged to the view.
import { useEffect, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { LAB_PLAN_PRESETS, LAB_PLAN_SCHEMA, labPlanSentence, normalizeLabPlan, type LabPlanValues } from '@/lib/lab/full-planner';
import { EN_PLANNER, type PlannerText } from '@/lib/lab/text-planner';
import { LabPlannerControls } from './FullPlannerControls';
import { LabPlannerView } from './FullPlannerView';

export type LabPlannerClientProps = {
  id: string;
  faultAfterChange?: true;
  /** The Figure's words; English when absent. */
  text?: PlannerText;
};

export default function LabPlannerClient({ id, faultAfterChange, text = EN_PLANNER }: LabPlannerClientProps) {
  const { values, preset, set, reset } = useFigureParams(id, LAB_PLAN_SCHEMA, LAB_PLAN_PRESETS);
  const shown = normalizeLabPlan(values);
  const latest = useRef(shown);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = { baseline: shown.baseline, risePoints: shown.risePoints, traffic: shown.traffic };
  }, [shown.baseline, shown.risePoints, shown.traffic]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const current = () => latest.current;

  const apply = (next: LabPlanValues) => {
    latest.current = next;
    set('baseline', next.baseline);
    set('risePoints', next.risePoints);
    set('traffic', next.traffic);
  };
  const commit = (next: LabPlanValues) => {
    setChanged(true);
    setAnnouncement(labPlanSentence(next, text));
  };

  return (
    <LabPlannerView
      id={id}
      text={text}
      values={shown}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <LabPlannerControls
          id={id}
          text={text}
          values={shown}
          onBaseline={(baseline) => apply(normalizeLabPlan({ ...current(), baseline }))}
          onBaselineCommit={(baseline) => commit(normalizeLabPlan({ ...current(), baseline }))}
          onRise={(risePoints) => apply(normalizeLabPlan({ ...current(), risePoints }))}
          onRiseCommit={(risePoints) => commit(normalizeLabPlan({ ...current(), risePoints }))}
          onTraffic={(traffic) => apply(normalizeLabPlan({ ...current(), traffic }))}
          onTrafficCommit={(traffic) => commit(normalizeLabPlan({ ...current(), traffic }))}
          onReset={() =>
            instantly(id, () => {
              reset();
              const restored = normalizeLabPlan(LAB_PLAN_PRESETS[preset]!);
              latest.current = restored;
              setAnnouncement(labPlanSentence(restored, text));
            })
          }
        />
      }
    />
  );
}
