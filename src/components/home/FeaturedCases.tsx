// The three featured case studies: the cards region the live experiment watches. Its DOM contract
// with the experiment beacon is `[data-experiment="cards"]` for the region (exposure is half of it in
// view) and `data-experiment-click="card"` on each card link. Both groups get the same region; only
// the visible headline string differs, and each card ends in the same vignette in both groups. Stacked
// below lg; from lg three columns, as a bento with narrow gaps. Server-safe.
import { HOME_CASES } from '../../../content/home.ts';
import type { Arm } from '@/experiment.values';
import { CaseCard } from './CaseCard';

export function FeaturedCases({ headlineArm }: { headlineArm: Arm }) {
  return (
    <section data-experiment="cards" aria-label="Featured case studies" className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      {HOME_CASES.map((c) => (
        <CaseCard key={c.study} study={c.study} headlineArm={headlineArm} />
      ))}
    </section>
  );
}
