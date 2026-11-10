// The three featured case studies: the cards region the live experiment watches. Its DOM contract
// with the experiment beacon is `[data-experiment="cards"]` for the region (exposure is half of it in
// view) and `data-experiment-click="card"` on each card link. Both groups get the same region; only
// the visible headline string differs. Stacked below lg; from lg three columns that share their rows
// (glyph, headline, description, link), so the headlines and the links line up. Server-safe.
import { HOME_CASES } from '../../../content/home.ts';
import type { Arm } from '@/experiment.values';
import { CaseCard } from './CaseCard';

export function FeaturedCases({ headlineArm }: { headlineArm: Arm }) {
  return (
    <section
      data-experiment="cards"
      aria-label="Featured case studies"
      className="grid gap-y-10 lg:grid-cols-3 lg:grid-rows-[repeat(4,auto)] lg:gap-x-8 lg:gap-y-3"
    >
      {HOME_CASES.map((c) => (
        <CaseCard key={c.study} study={c.study} headlineArm={headlineArm} />
      ))}
    </section>
  );
}
