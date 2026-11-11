'use client';

// The peeking Figure's island, loaded by EagerOrIntent (PeekingFigureClient imports it lazily). It
// reads and writes its URL state (`?peeking.looks=30&peeking.mode=once&peeking.fix=obf`), looks the
// result up in the precomputed table synchronously in render (no simulation, no worker, no pending
// state), and draws chart, result line, caption and table from that one view. It announces the
// result on a committed change only: a slider release or key release, a typed value, a choice, Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the view on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a committed change.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { computePeek, type PeekView } from '@/lib/lab/peeking';
import { PEEK_PRESETS, PEEK_SCHEMA, type PeekParams } from '@/lib/lab/peeking-values';
import { PeekingControls } from './PeekingFigureClient';
import { PeekingFigureView, peekAnnouncement } from './PeekingView';

export type PeekingInteractiveProps = {
  id: string;
  /** The server's preset view. */
  initial: PeekView;
  faultAfterChange?: true;
};

/** Frames to wait for the preview to leave and the island's control to exist. */
const HANDOFF_FRAMES = 120;

type Handoff = { element: HTMLElement; selector: string };

/**
 * The preview's control without an id that holds focus as the island first renders (a radio or
 * Reset), if any. The sliders have ids, which the loader hands over itself.
 */
function focusedPreviewControl(id: string): Handoff | null {
  if (typeof document === 'undefined') return null;
  const controls = `#${id} [data-peek-controls]`;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.closest(controls) === null) return null;
  if (active instanceof HTMLInputElement && active.type === 'radio') {
    return { element: active, selector: `${controls} input[name="${active.name}"][value="${active.value}"]` };
  }
  if (active instanceof HTMLButtonElement) return { element: active, selector: `${controls} button` };
  return null;
}

const same = (a: PeekParams, b: PeekParams) => a.looks === b.looks && a.mode === b.mode && a.fix === b.fix;

export default function PeekingInteractive({ id, initial, faultAfterChange }: PeekingInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(id, PEEK_SCHEMA, PEEK_PRESETS);
  const view = useMemo(() => (same(values, initial.values) ? initial : computePeek(values)), [values, initial]);
  // The latest values, for handlers made in an earlier render: a slider's release handler is the
  // one from the render where the drag began.
  const latest = useRef<PeekParams>(view.values);
  // Back or Forward can bring new values without a handler here; follow them after the render.
  useEffect(() => {
    latest.current = view.values;
  }, [view.values]);

  // The loader hands focus from the preview to the island by element id, and the radios and Reset
  // have none: a keyboard visitor on one of them would be left on <body> when the preview goes. The
  // island remembers that control and focuses its own one as soon as the preview has left: in a
  // microtask after this commit, then each frame while the preview is still there or the control
  // does not exist yet. It stops if focus has gone anywhere else.
  const [handoff] = useState(() => focusedPreviewControl(id));
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
  const commit = (next: PeekParams) => {
    setChanged(true);
    setAnnouncement(peekAnnouncement(computePeek(next)));
  };

  return (
    <PeekingFigureView
      id={id}
      view={view}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <PeekingControls
          id={id}
          values={view.values}
          onLooks={(looks) => {
            latest.current = { ...latest.current, looks };
            set('looks', looks);
          }}
          onLooksCommit={(looks) => commit({ ...latest.current, looks })}
          onMode={(mode) => {
            latest.current = { ...latest.current, mode };
            set('mode', mode);
            commit(latest.current);
          }}
          onFix={(fix) => {
            latest.current = { ...latest.current, fix };
            set('fix', fix);
            commit(latest.current);
          }}
          onReset={() =>
            instantly(id, () => {
              reset();
              const restored = PEEK_PRESETS[preset]!;
              latest.current = restored;
              setAnnouncement(peekAnnouncement(computePeek(restored)));
            })
          }
        />
      }
    />
  );
}
