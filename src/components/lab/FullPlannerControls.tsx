'use client';

// The client side of the full planner that the page loads at once, kept small (no statistics):
// - FullPlannerIsland is the lazy paired island. Its code (the URL hooks, the statistics, both
//   Figures) is fetched only when the loader renders it: on intent, or right after hydration for a
//   shared URL with keys of either Figure.
// - SizingControls and DurationControls are the two control rows, each in a group named by its
//   Figure's title, shared by the island and the preview. The Inert copies are the preview's, with
//   handlers that do nothing, so nothing moves when the island replaces the preview. Every control
//   has the same id in both (`<figure id>-baseline`, `-rise`, `-mode-<unit>`, `-traffic`, `-reset`),
//   so the loader hands a keyboard visitor's focus from the preview's control to the island's.
//
// The rise is shown in points or as a percent of the baseline. In percent the slider and its number
// input step on the integer-point grid: one step is one whole point, shown as its percent of the
// baseline, so the slider's own snapping can never show an effect between two points. Both rows
// report the rise in whole points.
//
// `faultAfterChange` is a test seam, only ever forwarded here, never set; only a test host sets it.
import { lazy } from 'react';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import { formatNumber } from '@/lib/figure/format';
import {
  DURATION_SCHEMA,
  FULL_PLAN_SCHEMA,
  FULL_PLANNER_REFS,
  PLANNER_NOUN,
  percentText,
  pointsText,
  relativePercent,
  relativeSliderBounds,
  relativeText,
  riseText,
  risePointsFromRelative,
  type FullPlanValues,
  type MdeMode,
  type PlannerContext,
} from '@/lib/lab/full-planner-values';
import { riseMax, targetRate } from '@/lib/lab/planner-values';
import { CONTROL_ROW, CONTROL_ROW_RESET } from './control-row';
import type { FullPlannerClientProps } from './FullPlannerClient';

const LazyFullPlanner = lazy(() => import('./FullPlannerClient'));

export function FullPlannerIsland(props: FullPlannerClientProps) {
  return <LazyFullPlanner {...props} />;
}

const SLIDER = 'w-full xs:w-72';

const MODE_OPTIONS: readonly { value: MdeMode; label: string }[] = [
  { value: 'absolute', label: 'Points' },
  { value: 'relative', label: 'Percent of baseline' },
];

export type SizingControlsProps = {
  id: string;
  /** Normalized values. */
  values: FullPlanValues;
  onBaseline: (baseline: number) => void;
  onBaselineCommit: (baseline: number) => void;
  /** The rise in whole points, whatever unit it is shown in. */
  onRise: (risePoints: number) => void;
  onRiseCommit: (risePoints: number) => void;
  onMode: (mode: MdeMode) => void;
  onReset: () => void;
};

export function SizingControls({ id, values, onBaseline, onBaselineCommit, onRise, onRiseCommit, onMode, onReset }: SizingControlsProps) {
  const { baseline } = values;
  const relative = values.mode === 'relative';
  // The slider's value and range in the shown unit; the rise is reported back in whole points.
  const bounds = relative ? relativeSliderBounds(baseline) : { min: FULL_PLAN_SCHEMA.risePoints.min, max: riseMax(baseline), step: FULL_PLAN_SCHEMA.risePoints.step };
  const shown = relative ? relativePercent(baseline, values.risePoints) : values.risePoints;
  const toPoints = (v: number) => (relative ? risePointsFromRelative(baseline, v) : v);
  return (
    <div role="group" aria-labelledby={`${id}-title`} data-planner-controls="" className={CONTROL_ROW}>
      <div className={SLIDER}>
        <Slider
          id={`${id}-baseline`}
          label="Baseline conversion"
          {...FULL_PLAN_SCHEMA.baseline}
          value={baseline}
          onChange={onBaseline}
          onCommit={onBaselineCommit}
          valueText={(v) => `${percentText(v)} baseline conversion`}
          readout={percentText}
          refs={FULL_PLANNER_REFS}
        />
      </div>
      <div className={SLIDER}>
        <Slider
          id={`${id}-rise`}
          label="Rise to detect"
          // The schema allows up to 30 points; the slider stops where the target would pass 99%.
          {...bounds}
          value={shown}
          onChange={(v) => onRise(toPoints(v))}
          onCommit={(v) => onRiseCommit(toPoints(v))}
          valueText={(v) => {
            const points = toPoints(v);
            return `${riseText({ baseline, risePoints: points, mode: values.mode })}, to ${percentText(targetRate(baseline, points))}`;
          }}
          readout={(v) => (relative ? `${relativeText(v)} of baseline` : pointsText(v))}
          // In percent the value is a whole point's share of the baseline (17.2413...): the number
          // input shows it to one decimal, as the readout does. Points are whole numbers already.
          numberText={relative ? (v) => formatNumber(v, 1) : undefined}
          numberLabel={relative ? 'Rise to detect, percent of the baseline' : 'Rise to detect, points'}
          refs={FULL_PLANNER_REFS}
        />
      </div>
      <Segmented name={`${id}-mode`} legend="Rise to detect, in" options={MODE_OPTIONS} value={values.mode} onChange={onMode} />
      <div className={CONTROL_ROW_RESET}>
        <ResetButton id={`${id}-reset`} onReset={onReset} />
      </div>
    </div>
  );
}

export type DurationControlsProps = {
  id: string;
  context: PlannerContext;
  /** The control's label, from the copy (passed in, so this file loads no copy or facts). */
  label: string;
  /** Normalized traffic. */
  traffic: number;
  onTraffic: (traffic: number) => void;
  onTrafficCommit: (traffic: number) => void;
  onReset: () => void;
};

export function DurationControls({ id, context, label, traffic, onTraffic, onTrafficCommit, onReset }: DurationControlsProps) {
  const noun = PLANNER_NOUN[context];
  return (
    <div role="group" aria-labelledby={`${id}-title`} data-planner-controls="" className={CONTROL_ROW}>
      <div className={SLIDER}>
        <Slider
          id={`${id}-traffic`}
          label={label}
          {...DURATION_SCHEMA.traffic}
          value={traffic}
          onChange={onTraffic}
          onCommit={onTrafficCommit}
          valueText={(v) => `${formatNumber(v, 0)} ${noun} a day, both groups together`}
          readout={(v) => `${formatNumber(v, 0)} a day`}
          refs={FULL_PLANNER_REFS}
        />
      </div>
      <div className={CONTROL_ROW_RESET}>
        <ResetButton id={`${id}-reset`} onReset={onReset} />
      </div>
    </div>
  );
}

const noop = () => {};

export function InertSizingControls({ id, values }: { id: string; values: FullPlanValues }) {
  return (
    <SizingControls
      id={id}
      values={values}
      onBaseline={noop}
      onBaselineCommit={noop}
      onRise={noop}
      onRiseCommit={noop}
      onMode={noop}
      onReset={noop}
    />
  );
}

export function InertDurationControls({ id, context, label, traffic }: { id: string; context: PlannerContext; label: string; traffic: number }) {
  return <DurationControls id={id} context={context} label={label} traffic={traffic} onTraffic={noop} onTrafficCommit={noop} onReset={noop} />;
}
