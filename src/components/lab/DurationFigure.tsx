'use client';

// The duration Figure's live side, rendered by the paired island (FullPlannerClient). It owns only
// its traffic and that traffic's URL state (`?duration.traffic=500`); the visitors per group come
// from the sizing Figure as `nPerArm`. It announces on a committed traffic change only (slider
// release, a key release, a typed value or Reset), never during a drag. Its Reset restores the
// traffic only; the sizing Figure's own Reset leaves the traffic alone.
//
// It passes `preview={false}` to the Figure: if its readout throws after a change, the fallback
// shows the kit's sentence and the current table, never a preset readout beside it.
// `faultAfterChange` (a test seam, absent in production) is forwarded unchanged to the view.
import { useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { DURATION_PRESETS, DURATION_SCHEMA, PLANNER_NOUN, durationSentence, normalizeTraffic, type PlannerContext } from '@/lib/lab/full-planner';
import { PLANNER_COPY } from '../../../content/lab';
import { DurationControls } from './FullPlannerControls';
import { DurationFigureView } from './FullPlannerView';

export type DurationFigureProps = {
  id: string;
  context: PlannerContext;
  /** The sizing Figure's current result. */
  nPerArm: number;
  faultAfterChange?: true;
};

export function DurationFigure({ id, context, nPerArm, faultAfterChange }: DurationFigureProps) {
  const { values, preset, set, reset } = useFigureParams(id, DURATION_SCHEMA, DURATION_PRESETS);
  const traffic = normalizeTraffic(values.traffic);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const noun = PLANNER_NOUN[context];
  return (
    <DurationFigureView
      id={id}
      context={context}
      nPerArm={nPerArm}
      traffic={traffic}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <DurationControls
          id={id}
          context={context}
          label={PLANNER_COPY[context].trafficLabel}
          traffic={traffic}
          onTraffic={(next) => set('traffic', normalizeTraffic(next))}
          onTrafficCommit={(next) => {
            setChanged(true);
            setAnnouncement(durationSentence(nPerArm, next, noun));
          }}
          onReset={() =>
            instantly(id, () => {
              reset();
              setAnnouncement(durationSentence(nPerArm, DURATION_PRESETS[preset]!.traffic, noun));
            })
          }
        />
      }
    />
  );
}
