'use client';

// The full planner's paired island, loaded by EagerOrIntent (FullPlannerControls imports it
// lazily; the server never imports it). It owns the sizing values once, with their URL state
// (`?planner.baseline=0.3&planner.risePoints=4&planner.mode=relative`), and hands the visitors per
// group to the duration Figure, which owns only its traffic. It announces the sizing result, with
// the weeks it leads to at the traffic on screen, on a committed change only: slider release, a key
// release, a typed value, a unit change or Reset.
//
// - Joint URL state: a baseline change can lower the rise (the target never passes 99%), so every
//   change writes the whole normalized triple, and neither state nor URL ever holds an unnormalized
//   pair. The latest triple is kept in a ref: a slider's release handler is the one from the render
//   where the drag began, so it cannot read the rise from its own closure after a cap.
// - Switching the unit changes only how the rise is shown: the baseline, the rise in points, the
//   target and the sample stay exactly as they were.
// - It passes `preview={false}` to the sizing Figure: if its readout throws after a change, the
//   fallback shows the kit's sentence and the current table, never a preset readout beside it.
//   `faultAfterChange` (a test seam, absent in production) is forwarded unchanged to both Figures.
import { useEffect, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import {
  DURATION_PRESETS,
  FULL_PLAN_PRESETS,
  FULL_PLAN_SCHEMA,
  PLANNER_NOUN,
  fullPlanModel,
  normalizeFullPlan,
  pairedSentence,
  type FullPlanValues,
  type PlannerContext,
} from '@/lib/lab/full-planner';
import { DurationFigure } from './DurationFigure';
import { SizingControls } from './FullPlannerControls';
import { PAIR_CLASS, SizingFigureView } from './FullPlannerView';

export type FullPlannerClientProps = {
  /** The sizing Figure's id. */
  id: string;
  /** The duration Figure's id. */
  durationId: string;
  context: PlannerContext;
  faultAfterChange?: true;
};

export default function FullPlannerClient({ id, durationId, context, faultAfterChange }: FullPlannerClientProps) {
  const { values, preset, set, reset } = useFigureParams(id, FULL_PLAN_SCHEMA, FULL_PLAN_PRESETS);
  const shown = normalizeFullPlan(values);
  const latest = useRef(shown);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = { baseline: shown.baseline, risePoints: shown.risePoints, mode: shown.mode };
  }, [shown.baseline, shown.risePoints, shown.mode]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const noun = PLANNER_NOUN[context];
  const current = () => latest.current;
  // The duration Figure's traffic on screen: a sizing change moves its weeks, so the sizing
  // announcement says them too (the duration Figure announces only its own changes).
  const trafficShownRef = useRef(DURATION_PRESETS.default.traffic);
  const announce = (next: FullPlanValues) => setAnnouncement(pairedSentence(next, trafficShownRef.current, noun));

  // The whole normalized triple, every time: a stale or capped URL pair is replaced by the one on screen.
  const apply = (next: FullPlanValues) => {
    latest.current = next;
    set('baseline', next.baseline);
    set('risePoints', next.risePoints);
    set('mode', next.mode);
  };
  const commit = (next: FullPlanValues) => {
    setChanged(true);
    announce(next);
  };

  return (
    <div data-full-planner="" className={PAIR_CLASS}>
      <SizingFigureView
        id={id}
        context={context}
        values={shown}
        preview={false}
        announcement={announcement}
        faultAfterChange={faultAfterChange}
        changed={changed}
        controls={
          <SizingControls
            id={id}
            values={shown}
            onBaseline={(baseline) => apply(normalizeFullPlan({ ...current(), baseline }))}
            onBaselineCommit={(baseline) => commit(normalizeFullPlan({ ...current(), baseline }))}
            onRise={(risePoints) => apply(normalizeFullPlan({ ...current(), risePoints }))}
            onRiseCommit={(risePoints) => commit(normalizeFullPlan({ ...current(), risePoints }))}
            onMode={(mode) => {
              const next = normalizeFullPlan({ ...current(), mode });
              apply(next);
              commit(next);
            }}
            onReset={() =>
              instantly(id, () => {
                reset();
                const restored = normalizeFullPlan(FULL_PLAN_PRESETS[preset]!);
                latest.current = restored;
                announce(restored);
              })
            }
          />
        }
      />
      <DurationFigure
        id={durationId}
        context={context}
        nPerArm={fullPlanModel(shown).nPerArm}
        trafficShownRef={trafficShownRef}
        faultAfterChange={faultAfterChange}
      />
    </div>
  );
}
