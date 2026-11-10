'use client';

// The client side of the planner that the page loads at once, kept small:
// - PlannerIsland is the lazy island. Its code (the URL hook, the statistics) is fetched only when
//   the loader renders it: on intent, or right after hydration for a shared URL with planner keys.
// - PlannerControls is the control row, shared by the island and the preview. InertPlannerControls
//   is the preview's copy, with handlers that do nothing, so nothing moves when the island replaces
//   the preview.
import { lazy } from 'react';
import { ResetButton } from '@/components/kit/ResetButton';
import { Slider } from '@/components/kit/Slider';
import { PLANNER_REFS, PLANNER_SCHEMA, percentText, pointsText, riseMax, targetRate, type PlannerValues } from '@/lib/lab/planner-values';
import type { PlannerInteractiveProps } from './PlannerInteractive';

const LazyPlanner = lazy(() => import('./PlannerInteractive'));

export function PlannerIsland(props: PlannerInteractiveProps) {
  return <LazyPlanner {...props} />;
}

export type PlannerControlsProps = {
  id: string;
  /** Normalized values. */
  values: PlannerValues;
  onBaseline: (v: number) => void;
  onBaselineCommit: (v: number) => void;
  onRise: (v: number) => void;
  onRiseCommit: (v: number) => void;
  onReset: () => void;
};

export function PlannerControls({ id, values, onBaseline, onBaselineCommit, onRise, onRiseCommit, onReset }: PlannerControlsProps) {
  return (
    <>
      <div className="w-full xs:w-72">
        <Slider
          id={`${id}-baseline`}
          label="Baseline conversion"
          {...PLANNER_SCHEMA.baseline}
          value={values.baseline}
          onChange={onBaseline}
          onCommit={onBaselineCommit}
          valueText={(v) => `${percentText(v)} of visitors sign up`}
          readout={percentText}
          refs={PLANNER_REFS}
        />
      </div>
      <div className="w-full xs:w-72">
        <Slider
          id={`${id}-rise`}
          label="Rise in points"
          min={PLANNER_SCHEMA.risePoints.min}
          // The schema allows up to 30 points; the slider stops where the target would pass 99%.
          max={riseMax(values.baseline)}
          step={PLANNER_SCHEMA.risePoints.step}
          value={values.risePoints}
          onChange={onRise}
          onCommit={onRiseCommit}
          valueText={(v) => `${pointsText(v)}, to ${percentText(targetRate(values.baseline, v))}`}
          readout={pointsText}
          refs={PLANNER_REFS}
        />
      </div>
      <ResetButton onReset={onReset} />
    </>
  );
}

const noop = () => {};

export function InertPlannerControls({ id, values }: { id: string; values: PlannerValues }) {
  return (
    <PlannerControls
      id={id}
      values={values}
      onBaseline={noop}
      onBaselineCommit={noop}
      onRise={noop}
      onRiseCommit={noop}
      onReset={noop}
    />
  );
}
