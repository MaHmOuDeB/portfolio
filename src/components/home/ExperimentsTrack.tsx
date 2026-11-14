// The first track, "Experiments and analytics" (the target of the hero's primary button): the tag on
// the live test, the heading and lede, a muted line on what the cards are in the test, then the three
// featured cards, which are the live experiment's cards region. Nothing here depends on the group:
// only the cards' visible headlines do (the note in the tag is the existing LiveNote, which the
// group comparison of the page leaves out). Server-safe.
import type { ReactNode } from 'react';
import { HOME_CARD_LINE, HOME_TRACKS, WORK_ANCHOR } from '../../../content/home.ts';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
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

/** The live test, once, above the work: the glyph and the note, which carries its own link to the live page. Rises with the cards. */
function ExperimentTag({ note }: { note: ReactNode }) {
  return (
    <div data-home-tag="" data-depth-rise="" className="mb-8 flex max-w-text items-start gap-3">
      <span className="mt-1.5 shrink-0">
        <IntervalGlyph />
      </span>
      <div data-home-note="" className="min-w-0">
        {note}
      </div>
    </div>
  );
}

export function ExperimentsTrack({
  headlineArm,
  note = null,
  phase = null,
}: {
  headlineArm: Arm;
  /** The live test's note (LiveNote); no tag when there is none (before the start). */
  note?: ReactNode;
  phase?: CardLinePhase | null;
}) {
  return (
    <section id={WORK_ANCHOR} data-home-track="experiments" aria-labelledby="track-experiments-title" className="mt-12 md:mt-section scroll-mt-24">
      {note !== null ? <ExperimentTag note={note} /> : null}
      <h2 id="track-experiments-title" data-depth-rise="heading" className="max-w-text text-display-sm font-semibold md:text-display">
        {HOME_TRACKS.experiments.title}
      </h2>
      <p className="mt-4 max-w-text text-lg text-muted">{HOME_TRACKS.experiments.lede}</p>
      {phase !== null ? (
        <p data-home-card-line="" className="mt-2 max-w-text text-sm text-muted">
          {HOME_CARD_LINE[phase]}
        </p>
      ) : null}
      <FeaturedCases headlineArm={headlineArm} />
    </section>
  );
}
