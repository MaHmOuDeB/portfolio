// The Home sample-size planner as a page places it: the server draws the preset (the static HTML,
// also what a visitor without JavaScript keeps, with the open table), and EagerOrIntent swaps in the
// island on intent, or at once for a shared URL with planner keys. If the island throws in the
// browser, LoadOnIntent's guard brings back this server preview in its no-JS form (the readout and
// the open table); the island's `preview` serves only a forced `error` runtime.
import { EagerOrIntent } from './EagerOrIntent';
import { InertPlannerControls, PlannerIsland } from './PlannerFigureClient';
import { PlannerFigureView, PlannerReadout } from './PlannerView';
import { PLANNER_PRESETS } from '@/lib/lab/planner';

export function PlannerFigure({ id = 'hero-planner' }: { id?: string }) {
  const values = PLANNER_PRESETS.default;
  return (
    <EagerOrIntent
      ids={[id]}
      preview={<PlannerFigureView id={id} values={values} controls={<InertPlannerControls id={id} values={values} />} />}
    >
      <PlannerIsland id={id} preview={<PlannerReadout values={values} presetNote />} />
    </EagerOrIntent>
  );
}
