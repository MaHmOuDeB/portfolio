// Focus handoff for a Lab island's Reset button. The loader hands focus from the server preview to the
// island by element id: the sliders have ids, but the kit's Reset button has none, so a keyboard
// reader on the preview's Reset would be left on <body> when the preview goes. The island remembers
// that button as it first renders and focuses its own Reset as soon as the preview has left: in a
// microtask after the commit (the loader removes the preview in a synchronous update of the same
// commit, before the browser paints), then each frame while the preview is still there or the
// button does not exist yet. It stops if focus has gone anywhere else. The same pattern as the
// Retention islands.
import { useLayoutEffect, useState } from 'react';

/** Frames to wait for the preview to leave and the island's button to exist. */
const HANDOFF_FRAMES = 120;

type Handoff = { element: HTMLElement; selector: string };

/** The preview's Reset inside `controls` (a selector for the Figure's control group) if it has focus. */
function focusedPreviewReset(controls: string): Handoff | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLButtonElement) || active.closest(controls) === null) return null;
  return { element: active, selector: `${controls} button` };
}

export function useResetHandoff(controls: string): void {
  const [handoff] = useState(() => focusedPreviewReset(controls));
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
}
