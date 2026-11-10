// The hero's evidence slot: the sample-size planner, the same for every visitor. Server-rendered
// with its preset; its code loads on intent, or at once for a shared link with planner keys.
import { PlannerFigure } from '@/components/figures/PlannerFigure';

export const HERO_PLANNER_ID = 'hero-planner';

export function HeroSimulator() {
  return (
    <div data-hero-simulator="">
      <PlannerFigure id={HERO_PLANNER_ID} />
    </div>
  );
}
