'use client';

// The split-check Figure's island, loaded by EagerOrIntent (SrmFigureClient imports it lazily). It
// reads and writes its URL state (`?srm.nA=120&srm.nB=60`), redraws as a slider moves and announces
// the result only on a commit: slider release, a key release, a typed value or Reset, never during a
// drag.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the values on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a change. The latest values are kept in a ref: a slider's release handler is the one from
// the render where the drag began, so it cannot read the other values from its own closure.
import { useEffect, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { SRM_ID, SRM_PRESETS, SRM_SCHEMA, normalizeSrm, srmResultText, type SrmValues } from '@/lib/lab/diagnostics';
import { useResetHandoff } from './resetHandoff';
import { SrmControls } from './SrmFigureClient';
import { SrmFigureView } from './SrmView';

export type SrmInteractiveProps = {
  faultAfterChange?: true;
};

export default function SrmInteractive({ faultAfterChange }: SrmInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(SRM_ID, SRM_SCHEMA, SRM_PRESETS);
  useResetHandoff(`#${SRM_ID} [data-srm-controls]`);
  const shown = normalizeSrm(values);
  const latest = useRef(shown);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = { nA: shown.nA, nB: shown.nB, shareA: shown.shareA };
  }, [shown.nA, shown.nB, shown.shareA]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);

  const next = (key: keyof SrmValues, value: number) => normalizeSrm({ ...latest.current, [key]: value });
  return (
    <SrmFigureView
      values={shown}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <SrmControls
          values={shown}
          onChange={(key, value) => {
            const v = next(key, value);
            latest.current = v;
            set(key, v[key]);
            setChanged(true);
          }}
          onCommit={(key, value) => setAnnouncement(srmResultText(next(key, value)))}
          onReset={() =>
            instantly(SRM_ID, () => {
              reset();
              const restored = normalizeSrm(SRM_PRESETS[preset]!);
              latest.current = restored;
              setAnnouncement(srmResultText(restored));
            })
          }
        />
      }
    />
  );
}
