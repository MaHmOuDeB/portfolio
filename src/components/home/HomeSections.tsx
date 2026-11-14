// The Home page below the site header, in page order at every width: the hero scene, the proof row,
// the track "Experiments and analytics" (the tag with the note on the live test, then the live
// experiment's cards), the track "Automation and agents", the two tiles, the ribbon of tools, the
// site tile and the decision band. One server composition for the per-group home page and the test build's host; the
// page adds the beacon, the host does not. Server only: it takes the Home model, which keeps exact
// counts, and hands each part only what it needs. No client component receives the model: the note's
// island gets its timing, the cards the headline group, the line at the cards only the phase.
//
// The headline group is `model.headlineArm`: group A's headlines in the calibration in both groups,
// the assigned group's in the A/B. Each card holds both strings for sizing; only the selected one is
// visible and announced (CaseCard). Everything else on the page is the same in both groups.
import type { ReactNode } from 'react';
import type { HomeModel } from '@/lib/home/model';
import { AutomationTrack } from './AutomationTrack';
import { DecisionBand } from './DecisionBand';
import { ExperimentsTrack, cardLinePhase } from './ExperimentsTrack';
import { Hero } from './Hero';
import { LiveNote } from './LiveNote';
import { ProofRow } from './ProofRow';
import { SiteTile } from './SiteTile';
import { ToolsRibbon } from './ToolsRibbon';
import { WorkTiles } from './WorkTiles';

/**
 * The composition, with an optional `extra` node placed after the tiles. The page passes none; the
 * test build's scroll-moment host passes the scroll moment.
 */
export function HomeBody({ model, extra }: { model: HomeModel; extra?: ReactNode }) {
  return (
    <>
      <Hero />
      <ProofRow />
      <ExperimentsTrack headlineArm={model.headlineArm} note={LiveNote({ model })} phase={cardLinePhase(model)} />
      <AutomationTrack />
      <WorkTiles />
      {extra}
      <ToolsRibbon />
      <div data-home-site-wrap="" className="mt-12 md:mt-section">
        <SiteTile />
      </div>
      <DecisionBand />
    </>
  );
}

export function HomeSections({ model }: { model: HomeModel }) {
  return <HomeBody model={model} />;
}
