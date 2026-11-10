'use client';

// The returns Figure's island, loaded by EagerOrIntent (ReturnsFigureClient imports it lazily). It
// reads and writes its URL state (`?returns.mode=raw`), draws the chosen mode and announces the
// result on a committed change only: a mode change or Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the mode on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a mode change.
import { useEffect, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { factText } from '@/lib/facts/text';
import {
  RETURNS_ID,
  RETURNS_PRESETS,
  RETURNS_SCHEMA,
  RULE_HOURS,
  comparisonPeriod,
  returnsTableFrom,
  type RetailMonth,
  type ReturnMode,
  type ReturnsEvidence,
} from '@/lib/retention/returns';
import { ReturnsControls } from './ReturnsFigureClient';
import { ReturnsFigureView } from './ReturnsView';

export type ReturnsInteractiveProps = {
  data: readonly RetailMonth[];
  evidence: ReturnsEvidence;
  faultAfterChange?: true;
};

/** The announcement: the result line's first sentence, as plain text. */
function resultText(mode: ReturnMode, data: readonly RetailMonth[]): string {
  const period = comparisonPeriod(data);
  return mode === 'raw'
    ? `Counting orders cancelled within ${RULE_HOURS} hours as returns, returned-order value looks like it grew ${factText('retail.returns.yoy_growth_raw')}, ${period}.`
    : `With orders cancelled within ${RULE_HOURS} hours removed, returned-order value grew about ${factText('retail.returns.yoy_growth_clean')}, ${period}.`;
}

const MODE_NAME = `${RETURNS_ID}-mode`;

/** The value of the preview's radio that holds focus as the island first renders, if any. */
function focusedPreviewRadio(): string | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLInputElement && active.name === MODE_NAME ? active.value : null;
}

export default function ReturnsInteractive({ data, evidence, faultAfterChange }: ReturnsInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(RETURNS_ID, RETURNS_SCHEMA, RETURNS_PRESETS);
  // The loader hands focus from the preview to the island by element id, and the radios have none:
  // a keyboard visitor who tabbed into the preview would be left on <body> when it is replaced. The
  // island puts focus on its own radio of the same value once the preview is gone (the frame after
  // the swap), unless focus has gone somewhere else meanwhile.
  const [handoff] = useState(focusedPreviewRadio);
  useEffect(() => {
    if (handoff === null) return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== null && active !== document.body) return;
      document.querySelector<HTMLInputElement>(`#${RETURNS_ID} input[name="${MODE_NAME}"][value="${handoff}"]`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [handoff]);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const mode = values.mode;
  return (
    <ReturnsFigureView
      mode={mode}
      data={data}
      evidence={evidence}
      table={returnsTableFrom(data, mode)}
      preview={false}
      announcement={announcement}
      chartFails={faultAfterChange === true && changed}
      controls={
        <ReturnsControls
          mode={mode}
          onMode={(next) => {
            set('mode', next);
            setChanged(true);
            setAnnouncement(resultText(next, data));
          }}
          onReset={() =>
            instantly(RETURNS_ID, () => {
              reset();
              setAnnouncement(resultText(RETURNS_PRESETS[preset]!.mode, data));
            })
          }
        />
      }
    />
  );
}
