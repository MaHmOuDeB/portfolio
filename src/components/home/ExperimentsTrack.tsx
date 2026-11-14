// The first track, "Experiments and analytics" (the anchor #work): the section head, a muted line on
// what the cards are in the test, then the three featured cards as a bento, which are the live
// experiment's cards region. Nothing here depends on the group: only the cards' visible headlines do.
// The live test's note is in the live bar at the top of the page, not here. Server-safe.
import { HOME_CARD_LINE, HOME_EXPERIMENTS_HEAD, WORK_ANCHOR } from '../../../content/home.ts';
import { SectionHead } from '@/components/frame';
import type { Arm } from '@/experiment.values';
import type { HomeModel } from '@/lib/home/model';
import { FeaturedCases } from './FeaturedCases';

export type CardLinePhase = keyof typeof HOME_CARD_LINE;

/**
 * Which line goes under the lede, from the same state the note reads (the model's test note): the
 * calibration or the A/B while counting goes on, nothing when the test is paused, stopped, decided,
 * closed or not configured. The note's group never reaches the line.
 */
export function cardLinePhase(model: HomeModel): CardLinePhase | null {
  if (model.countingClosed || model.testNote === null) return null;
  switch (model.testNote.mode) {
    case 'calibration':
      return 'calibration';
    case 'ab':
      return 'ab';
    case 'paused':
      return null;
  }
}

export function ExperimentsTrack({ headlineArm, phase = null }: { headlineArm: Arm; phase?: CardLinePhase | null }) {
  const head = HOME_EXPERIMENTS_HEAD;
  return (
    <section id={WORK_ANCHOR} data-home-track="experiments" data-rule="" aria-labelledby="track-experiments-title" className="scroll-mt-24 pb-2.5">
      <SectionHead id="track-experiments-title" chip={head.chip} title={head.title} quiet={head.quiet} sub={head.sub} />
      {phase !== null ? (
        <p data-home-card-line="" className="-mt-3 mb-7 text-center text-sm text-muted">
          {HOME_CARD_LINE[phase]}
        </p>
      ) : null}
      <FeaturedCases headlineArm={headlineArm} />
    </section>
  );
}
