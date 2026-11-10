'use client';

// The planner's island, loaded by EagerOrIntent (PlannerFigureClient imports it lazily). It reads
// and writes its URL state, redraws as the sliders move, and announces the result only on a commit:
// slider release, a key release, a typed value or Reset, never during a drag.
//
// The URL values are normalized jointly before anything is shown, and a baseline change caps the
// rise in the same step, so no invalid pair is ever drawn. The latest pair is also kept in a ref:
// a slider's release handler is the one from the render where the drag began, so it cannot read the
// rise from its own closure after the baseline has capped it.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { PLANNER_PRESETS, PLANNER_SCHEMA, normalizePlanner, resultSentence, type PlannerValues } from '@/lib/lab/planner';
import { PlannerControls } from './PlannerFigureClient';
import { PlannerFigureView } from './PlannerView';

export type PlannerInteractiveProps = {
  id: string;
  titleLevel?: 2 | 3 | 4;
  /** The server-drawn preset readout, shown by the error fallback if this island throws. */
  preview: ReactNode;
};

export default function PlannerInteractive({ id, titleLevel, preview }: PlannerInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(id, PLANNER_SCHEMA, PLANNER_PRESETS);
  const shown = normalizePlanner(values);
  const latest = useRef(shown);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = { baseline: shown.baseline, risePoints: shown.risePoints };
  }, [shown.baseline, shown.risePoints]);
  const [announcement, setAnnouncement] = useState('');
  const current = () => latest.current;

  // Both keys, every time: a stale URL pair is replaced by the pair on screen.
  const apply = (next: PlannerValues) => {
    latest.current = next;
    set('baseline', next.baseline);
    set('risePoints', next.risePoints);
  };
  const announce = (next: PlannerValues) => setAnnouncement(resultSentence(next));

  return (
    <PlannerFigureView
      id={id}
      titleLevel={titleLevel}
      values={shown}
      preview={preview}
      announcement={announcement}
      controls={
        <PlannerControls
          id={id}
          values={shown}
          onBaseline={(baseline) => apply(normalizePlanner({ baseline, risePoints: current().risePoints }))}
          onBaselineCommit={(baseline) => announce(normalizePlanner({ baseline, risePoints: current().risePoints }))}
          onRise={(risePoints) => apply(normalizePlanner({ baseline: current().baseline, risePoints }))}
          onRiseCommit={(risePoints) => announce(normalizePlanner({ baseline: current().baseline, risePoints }))}
          onReset={() =>
            instantly(id, () => {
              reset();
              const restored = normalizePlanner(PLANNER_PRESETS[preset]!);
              latest.current = restored;
              announce(restored);
            })
          }
        />
      }
    />
  );
}
