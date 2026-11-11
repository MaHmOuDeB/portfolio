'use client';

// The exaggeration Figure's island, loaded by EagerOrIntent (CurseFigureClient imports it lazily). It
// reads and writes its URL state (`?curse.trueEffect=0.5&curse.se=2`), redraws as a slider moves and
// announces the result only on a commit: slider release, a key release, a typed value or Reset, never
// during a drag.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the values on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a change. The latest values are kept in a ref: a slider's release handler is the one from
// the render where the drag began, so it cannot read the other value from its own closure.
import { useEffect, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { CURSE_ID, CURSE_PRESETS, CURSE_SCHEMA, curseResultText, normalizeCurse, type CurseValues } from '@/lib/lab/diagnostics';
import { CurseControls } from './CurseFigureClient';
import { CurseFigureView } from './CurseView';
import { useResetHandoff } from './resetHandoff';

export type CurseInteractiveProps = {
  faultAfterChange?: true;
};

export default function CurseInteractive({ faultAfterChange }: CurseInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(CURSE_ID, CURSE_SCHEMA, CURSE_PRESETS);
  useResetHandoff(`#${CURSE_ID} [data-curse-controls]`);
  const shown = normalizeCurse(values);
  const latest = useRef(shown);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = { trueEffect: shown.trueEffect, se: shown.se };
  }, [shown.trueEffect, shown.se]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);

  const next = (key: keyof CurseValues, value: number) => normalizeCurse({ ...latest.current, [key]: value });
  return (
    <CurseFigureView
      values={shown}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <CurseControls
          values={shown}
          onChange={(key, value) => {
            const v = next(key, value);
            latest.current = v;
            set(key, v[key]);
            setChanged(true);
          }}
          onCommit={(key, value) => setAnnouncement(curseResultText(next(key, value)))}
          onReset={() =>
            instantly(CURSE_ID, () => {
              reset();
              const restored = normalizeCurse(CURSE_PRESETS[preset]!);
              latest.current = restored;
              setAnnouncement(curseResultText(restored));
            })
          }
        />
      }
    />
  );
}
