// The decorative bottom of a card: a small schematic sheet that bleeds off the card's bottom right.
// Hidden from assistive technology and unlabelled (owner decision 2026-11-15: the tag made the cards look less
// premium). A sketch never prints a digit or a real figure, so it cannot be read as data: positions live in custom properties only. Inside a card the
// sheet lifts like a lid as it enters (data-depth-hinge, styled in globals.css).
import type { ReactNode } from 'react';

export function Vignette({ children }: { children: ReactNode }) {
  return (
    <div data-vignette="" aria-hidden="true">
      <div data-vignette-sheet="" data-depth-hinge="">
        {children}
      </div>
    </div>
  );
}
