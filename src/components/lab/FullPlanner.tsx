// The full sample-size planner as a page places it.
//
// - On the Lab (context 'hypothetical'): one Figure (`planner`: Sign-up rate today, Smallest rise
//   worth acting on, Visitors per day, Reset) with two readouts, the visitors per group and the weeks,
//   in the Lab's reading model. There is no unit toggle; the table gives the rise in both units.
// - On the Retention page (context 'retention'): the pair, a sizing Figure (Baseline conversion, Rise
//   to detect, the unit the rise is shown in, Reset) and a duration Figure (Total customers per day,
//   Reset), loaded as one paired island.
//
// The server draws the presets (the static HTML, also what a visitor without JavaScript keeps, with
// open tables): 1,353 per group and 4 weeks. EagerOrIntent swaps in the island on intent, or at once
// for a shared URL with keys of its Figures; another Figure's keys do not load it. The islands are
// imported lazily by the client loader, never statically from here.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose Figures then throw after an input change. Only a test host sets it.
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { DURATION_ID, DURATION_PRESETS, FULL_PLANNER_ID, FULL_PLAN_PRESETS, LAB_PLAN_PRESETS, fullPlanModel, type PlannerContext } from '@/lib/lab/full-planner';
import { PLANNER_COPY } from '../../../content/lab';
import { FullPlannerIsland, InertDurationControls, InertLabPlannerControls, InertSizingControls, LabPlannerIsland } from './FullPlannerControls';
import { DurationFigureView, LabPlannerView, PAIR_CLASS, SizingFigureView } from './FullPlannerView';

export type FullPlannerProps = {
  /** The (sizing) Figure's id and URL namespace. */
  id?: string;
  /** The duration Figure's id and URL namespace (the pair only). */
  durationId?: string;
  context?: PlannerContext;
  faultAfterChange?: true;
};

export function FullPlanner({ id = FULL_PLANNER_ID, durationId = DURATION_ID, context = 'hypothetical', faultAfterChange }: FullPlannerProps) {
  if (context === 'hypothetical') {
    const values = LAB_PLAN_PRESETS.default;
    return (
      <EagerOrIntent ids={[id]} preview={<LabPlannerView id={id} values={values} controls={<InertLabPlannerControls id={id} values={values} />} />}>
        <LabPlannerIsland id={id} faultAfterChange={faultAfterChange} />
      </EagerOrIntent>
    );
  }
  if (id === durationId) throw new Error(`FullPlanner: the two Figures need different ids, got "${id}" twice`);
  const values = FULL_PLAN_PRESETS.default;
  const { traffic } = DURATION_PRESETS.default;
  const { nPerArm } = fullPlanModel(values);
  return (
    <EagerOrIntent
      ids={[id, durationId]}
      preview={
        <div data-full-planner="" className={PAIR_CLASS}>
          <SizingFigureView id={id} context={context} values={values} controls={<InertSizingControls id={id} context={context} values={values} />} />
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
