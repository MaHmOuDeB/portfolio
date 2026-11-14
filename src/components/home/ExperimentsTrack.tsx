// The first track, "Experiments and analytics" (the target of the hero's primary button): the
// heading and lede, then the three featured cards, which are the live experiment's cards region.
// Nothing here depends on the group: only the cards' visible headlines do. Server-safe.
import { HOME_TRACKS, WORK_ANCHOR } from '../../../content/home.ts';
import type { Arm } from '@/experiment.values';
import { FeaturedCases } from './FeaturedCases';

export function ExperimentsTrack({ headlineArm }: { headlineArm: Arm }) {
  return (
    <section id={WORK_ANCHOR} data-home-track="experiments" aria-labelledby="track-experiments-title" className="mt-12 md:mt-section scroll-mt-24">
      <h2 id="track-experiments-title" data-depth-rise="heading" className="max-w-text text-display-sm font-semibold md:text-display">
        {HOME_TRACKS.experiments.title}
      </h2>
      <p className="mt-4 max-w-text text-lg text-muted">{HOME_TRACKS.experiments.lede}</p>
      <FeaturedCases headlineArm={headlineArm} />
    </section>
  );
}
