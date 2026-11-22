// The "Depth components" section of the kitchen sink: the Home band, a proof cell, the cards that
// rise and lean, tiles and the glance block. Every number is a fictional Derived marked 'simulated'.
// Lean is mounted here once so the cards and the band's stack answer a fine pointer.
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { Lean } from '@/components/depth/Lean';
import { LeanCard } from '@/components/depth/LeanCard';
import { Ribbon } from '@/components/depth/Ribbon';
import { StackBand } from '@/components/depth/StackBand';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { Tile } from '@/components/depth/Tile';
import { Derived } from '@/components/kit/Derived';
import { Specimen } from './Specimen';

const REFS = ['simulated'] as const;

export function DepthSection() {
  return (
    <>
      <Lean />
      <Specimen
        id="depth--band"
        title="Band"
        note="Three sheets that rest as an isometric stack and, on a wide screen with scroll timelines, pin and unfold into a row. A static column below lg, the flat row under reduced motion. Decorative, so hidden from assistive technology; the caption under it is visible."
      >
        <StackBand />
      </Specimen>
      <Specimen id="depth--proof" title="Proof cell" note="One of the four ruled cells. The figure is a Derived value.">
        <ProofFigure side="Fictional side" figure={<Derived value={1353} unit="count" refs={REFS} />}>
          Visitors per group in a made-up run.
        </ProofFigure>
      </Specimen>
      <Specimen
        id="depth--card-lg"
        title="Lean card, large"
        note="Rises on entry and leans toward a fine pointer. The headline area is three lines tall."
      >
        <LeanCard href="/kitchen-sink" title="A short headline" titleMinLines={3} meta="Fictional meta line" prefetch={false}>
          A fictional description of a piece of work, long enough to wrap onto a second line.
        </LeanCard>
      </Specimen>
      <Specimen id="depth--card-md" title="Lean card, medium" note="The smaller size used in rows of four.">
        <LeanCard href="/kitchen-sink" size="md" title="A long headline that needs to wrap onto two lines" titleMinLines={2} meta="Fictional meta line" prefetch={false}>
          A fictional description.
        </LeanCard>
      </Specimen>
      <Specimen id="depth--tile" title="Tile" note="The quiet surface tone.">
        <Tile>
          <p>A fictional tile on the surface.</p>
        </Tile>
      </Specimen>
      <Specimen id="depth--tile-ink" title="Tile, ink" note="The ink tone for the second tile of a pair.">
        <Tile tone="ink">
          <p>A fictional tile in ink.</p>
        </Tile>
      </Specimen>
      <Specimen id="depth--ribbon" title="Ribbon" note="A row of words that slides sideways with the scroll. Each word appears once.">
        <Ribbon label="Fictional tools" items={['First tool', 'Second tool', 'Third tool', 'Fourth tool', 'Fifth tool', 'Sixth tool']} />
      </Specimen>
      <Specimen id="depth--magnet" title="Magnet" note="A fine pointer within 24 px of the button pulls it up to 6 px.">
        <span data-depth-magnet="" className="inline-block">
          <a href="/kitchen-sink" className="inline-block min-h-(--size-target) rounded-md bg-ink px-6 py-3 text-surface">
            Fictional primary button
          </a>
        </span>
      </Specimen>
      <Specimen id="depth--glance" title="Glance block" note="The top of a case study: the outcome, then four facts.">
        <GlanceBlock
          outcome="A fictional outcome, in one large sentence."
          role="Fictional role"
          methods="Fictional methods"
          tools="Fictional tools"
          when="Fictional period"
        />
      </Specimen>
    </>
  );
}
