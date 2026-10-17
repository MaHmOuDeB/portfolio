'use client';

// The demo Figure's island, loaded on intent by LoadOnIntent (islands.tsx imports it lazily). It
// reads and writes its URL state, redraws as the controls move and sets the announcement only on a
// commit: slider release, a power change or Reset, never during a drag.
import { useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { DemoControls, PRESETS, SCHEMA, type DemoValues } from './DemoControls';
import { DemoFigureView, demoModel, resultSentence } from './demo-view';

export default function DemoInteractive({ id, titleLevel }: { id: string; titleLevel?: 2 | 3 | 4 }) {
  const { values, preset, set, reset } = useFigureParams(id, SCHEMA, PRESETS);
  const [announcement, setAnnouncement] = useState('');
  const announce = (v: DemoValues) => setAnnouncement(resultSentence(demoModel(v)));
  return (
    <DemoFigureView
      id={id}
      titleLevel={titleLevel}
      values={values}
      announcement={announcement}
      controls={
        <DemoControls
          id={id}
          values={values}
          onBaseline={(baseline) => set('baseline', baseline)}
          onBaselineCommit={(baseline) => announce({ ...values, baseline })}
          onPower={(power) => {
            set('power', power);
            announce({ ...values, power });
          }}
          onReset={() =>
            instantly(id, () => {
              reset();
              announce(PRESETS[preset]!);
            })
          }
        />
      }
    />
  );
}
