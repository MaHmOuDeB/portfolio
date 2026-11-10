// The full sample-size planner as a page places it: a sizing Figure (Baseline conversion, Rise to
// detect, MDE unit, Reset) and a duration Figure (Total visitors per day, Reset), loaded as one
// paired island. The server draws the preset pair (the static HTML, also what a visitor without
// JavaScript keeps, with both open tables): 1,353 per group and 4 weeks. EagerOrIntent swaps in the
// island on intent, or at once for a shared URL with keys of either Figure; another Figure's keys
// do not load it. The island is imported lazily by the client loader, never statically from here.
//
// `context` sets the copy: a hypothetical test (the Lab), or a hypothetical uplift on the Retention
// win-back's observed baseline. `faultAfterChange` is a test seam, absent in production: it is
// forwarded unchanged to the island, whose Figures then throw after an input change. Only a test
// host sets it.
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { DURATION_ID, DURATION_PRESETS, FULL_PLANNER_ID, FULL_PLAN_PRESETS, fullPlanModel, type PlannerContext } from '@/lib/lab/full-planner';
import { PLANNER_COPY } from '../../../content/lab';
import { FullPlannerIsland, InertDurationControls, InertSizingControls } from './FullPlannerControls';
import { DurationFigureView, PAIR_CLASS, SizingFigureView } from './FullPlannerView';

export type FullPlannerProps = {
  /** The sizing Figure's id and URL namespace. */
  id?: string;
  /** The duration Figure's id and URL namespace. */
  durationId?: string;
  context?: PlannerContext;
  faultAfterChange?: true;
};

export function FullPlanner({ id = FULL_PLANNER_ID, durationId = DURATION_ID, context = 'hypothetical', faultAfterChange }: FullPlannerProps) {
  if (id === durationId) throw new Error(`FullPlanner: the two Figures need different ids, got "${id}" twice`);
  const values = FULL_PLAN_PRESETS.default;
  const { traffic } = DURATION_PRESETS.default;
  const { nPerArm } = fullPlanModel(values);
  return (
    <EagerOrIntent
      ids={[id, durationId]}
      preview={
        <div data-full-planner="" className={PAIR_CLASS}>
          <SizingFigureView id={id} context={context} values={values} controls={<InertSizingControls id={id} values={values} />} />
          <DurationFigureView
            id={durationId}
            context={context}
            nPerArm={nPerArm}
            traffic={traffic}
            controls={<InertDurationControls id={durationId} context={context} label={PLANNER_COPY[context].trafficLabel} traffic={traffic} />}
          />
        </div>
      }
    >
      <FullPlannerIsland id={id} durationId={durationId} context={context} faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
