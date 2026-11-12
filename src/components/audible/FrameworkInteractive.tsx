'use client';

// The ship-rule Figure's island, loaded by EagerOrIntent (FrameworkFigureClient imports it lazily).
// It reads and writes its URL state (`?framework.lower=-1&framework.upper=3&framework.guardrail=1`),
// puts the bounds in order with the model, and draws the decision. It announces the result on a
// committed change only: a slider release or key release, a typed value, Reset.
//
// Moving one end of the main metric's interval past the other carries the other end with it (the
// model keeps lower <= upper), and the URL gets all three keys, so a shared link is the view on
// screen.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the bounds on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a committed change.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { normalizeFramework, type FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID, FRAMEWORK_PRESETS, FRAMEWORK_SCHEMA, paramsToValues } from '@/lib/audible/framework-url';
import { FrameworkControls } from './FrameworkFigureClient';
import { FrameworkFigureView, frameworkAnnouncement } from './FrameworkView';

export type FrameworkInteractiveProps = {
  /** The server's preset values. */
  initial: FrameworkValues;
  faultAfterChange?: true;
};

/** Frames to wait for the preview to leave and the island's control to exist. */
const HANDOFF_FRAMES = 120;

type Handoff = { element: HTMLElement; selector: string };

/**
 * The preview's Reset, when it holds focus as the island first renders. The sliders have ids, which
 * the loader hands over itself; Reset has none.
 */
function focusedPreviewReset(): Handoff | null {
  if (typeof document === 'undefined') return null;
  const controls = `#${FRAMEWORK_ID} [data-framework-controls]`;
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement) || active.closest(controls) === null) return null;
  return { element: active, selector: `${controls} button` };
}

const same = (a: FrameworkValues, b: FrameworkValues) =>
  a.primaryLower === b.primaryLower && a.primaryUpper === b.primaryUpper && a.guardrailUpper === b.guardrailUpper;

export default function FrameworkInteractive({ initial, faultAfterChange }: FrameworkInteractiveProps) {
  const { values: params, preset, set, reset } = useFigureParams(FRAMEWORK_ID, FRAMEWORK_SCHEMA, FRAMEWORK_PRESETS);
  const values = useMemo(() => {
    const read = paramsToValues(params);
    return same(read, initial) ? initial : read;
  }, [params, initial]);
  // The latest values, for handlers made in an earlier render: a slider's release handler is the
  // one from the render where the drag began.
  const latest = useRef<FrameworkValues>(values);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = values;
  }, [values]);

  const [handoff] = useState(focusedPreviewReset);
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

  /** One bound moved: the model puts the ends in order, and the URL gets all three keys. */
  const move = (bound: keyof FrameworkValues, value: number): FrameworkValues => {
    const next = normalizeFramework({ ...latest.current, [bound]: value });
    latest.current = next;
    set('lower', next.primaryLower);
    set('upper', next.primaryUpper);
    set('guardrail', next.guardrailUpper);
    return next;
  };

  return (
    <FrameworkFigureView
      values={values}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <FrameworkControls
          values={values}
          onBound={(bound, value) => move(bound, value)}
          onCommit={(bound, value) => {
            const next = move(bound, value);
            setChanged(true);
            setAnnouncement(frameworkAnnouncement(next));
          }}
          onReset={() =>
            instantly(FRAMEWORK_ID, () => {
              reset();
              const restored = paramsToValues(FRAMEWORK_PRESETS[preset]!);
              latest.current = restored;
              setAnnouncement(frameworkAnnouncement(restored));
            })
          }
        />
      }
    />
  );
}
