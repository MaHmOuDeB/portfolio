// The Home page below the site header, in page order at every width: the live bar (only once the live
// test has a note), the hero with the stack band, the experience band, the proof row, "How I test",
// the experiments track (the live experiment's cards), the automation track, the questions rows, the
// tools band, the site band, the FAQ and the dark call to action. One server composition for the
// per-group home page and the test build's host; the page adds the beacon, the host does not. Server
// only: it takes the Home model, which keeps exact counts, and hands each part only what it needs. No
// client component receives the model: the note's island gets its timing, the cards the headline
// group, the line at the cards only the phase.
//
// The headline group is `model.headlineArm`: group A's headlines in the calibration in both groups,
// the assigned group's in the A/B. Each card holds both strings for sizing; only the selected one is
// visible and announced (CaseCard). Everything else on the page is the same in both groups, except
// the note in the live bar, which can name the reader's group.
import type { HomeModel } from '@/lib/home/model';
import { AutomationTrack } from './AutomationTrack';
import { ExperienceBand } from './ExperienceBand';
import { ExperimentsTrack, cardLinePhase } from './ExperimentsTrack';
import { Hero } from './Hero';
import { HomeCallToAction } from './HomeCallToAction';
import { HomeFaq } from './HomeFaq';
import { HowITest } from './HowITest';
import { LiveBar } from './LiveBar';
import { LiveNote } from './LiveNote';
import { ProofRow } from './ProofRow';
import { QuestionsRows } from './QuestionsRows';
import { SiteTile } from './SiteTile';
import { ToolsBand } from './ToolsBand';

/** The note, in the box the page's tests and the browser tests find it by; nothing before the start. */
function noteFor(model: HomeModel) {
  const note = LiveNote({ model });
  return note === null || note === undefined ? null : <div data-home-note="">{note}</div>;
}

/**
 * The Home composition, in order: live bar, hero (with the stack band), experience band, proof row,
 * "How I test", the experiments and automation tracks, the questions rows, the tools band, the site
 * band, the FAQ and the dark call to action.
 */
export function HomeBody({ model }: { model: HomeModel }) {
  return (
    <>
      <LiveBar note={noteFor(model)} />
      <Hero />
      <ExperienceBand />
      <ProofRow />
      <HowITest />
      <ExperimentsTrack headlineArm={model.headlineArm} phase={cardLinePhase(model)} />
      <AutomationTrack />
      <QuestionsRows />
      <ToolsBand />
      <SiteTile />
      <HomeFaq />
      <HomeCallToAction />
    </>
  );
}

export function HomeSections({ model }: { model: HomeModel }) {
  return <HomeBody model={model} />;
}
