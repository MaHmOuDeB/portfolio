'use client';

// The returns Figure's island, loaded by EagerOrIntent (ReturnsFigureClient imports it lazily). It
// reads and writes its URL state (`?returns.mode=raw`), draws the chosen mode and announces the
// result on a committed change only: a mode change or Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the mode on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a mode change.
import { useLayoutEffect, useState } from 'react';
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
const CONTROLS = `#${RETURNS_ID} [data-returns-controls]`;
/** Frames to wait for the preview to leave and the island's control to exist. */
const HANDOFF_FRAMES = 120;

type Handoff = { element: HTMLElement; selector: string };

/** The preview's control that holds focus as the island first renders (a radio or Reset), if any. */
function focusedPreviewControl(): Handoff | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.closest(CONTROLS) === null) return null;
  if (active instanceof HTMLInputElement && active.name === MODE_NAME) {
    return { element: active, selector: `${CONTROLS} input[name="${MODE_NAME}"][value="${active.value}"]` };
  }
  if (active instanceof HTMLButtonElement) return { element: active, selector: `${CONTROLS} button` };
  return null;
}

export default function ReturnsInteractive({ data, evidence, faultAfterChange }: ReturnsInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(RETURNS_ID, RETURNS_SCHEMA, RETURNS_PRESETS);
  // The loader hands focus from the preview to the island by element id, and these controls have
  // none: a keyboard visitor on a preview control would be left on <body> when the preview goes.
  // The island remembers that control and puts focus on its own one as soon as the preview has
  // left: in a microtask after this commit (the loader removes the preview in a synchronous update
  // of the same commit, so before the browser paints), then each frame while the preview is still
  // there or the control does not exist yet. It stops if focus has gone anywhere else.
  const [handoff] = useState(focusedPreviewControl);
  useLayoutEffect(() => {
    if (handoff === null) return;
    let live = true;
    let frame = 0;
    let tries = 0;
    const place = () => {
      if (!live) return;
      const active = document.activeElement;
      const previewStays = active === handoff.element && handoff.element.isConnected;
      const lost = active === null || active === document.body || (active === handoff.element && !handoff.element.isConnected);
      const target = document.querySelector<HTMLElement>(handoff.selector);
      if (lost && target !== null && target !== handoff.element) {
        target.focus();
        return;
      }
      if ((previewStays || lost) && tries++ < HANDOFF_FRAMES) frame = requestAnimationFrame(place);
    };
    queueMicrotask(place);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
    };
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
      faultAfterChange={faultAfterChange}
      changed={changed}
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
