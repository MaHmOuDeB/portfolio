// The live bar: an ink strip at the top of Home's content that carries the live test's note (the
// existing LiveNote, its sentence and its own link), centred and small. Nothing at all when there is
// no note (before the test starts). The bar's own markup is the same in both groups; only the note's
// words can name the reader's group. Server-safe: it takes the rendered note, never the model.
import type { ReactNode } from 'react';

export function LiveBar({ note }: { note: ReactNode }) {
  if (note === null || note === undefined || note === false) return null;
  return (
    <div data-live-bar="" role="region" aria-label="Live test">
      <div data-live-bar-in="">{note}</div>
    </div>
  );
}
