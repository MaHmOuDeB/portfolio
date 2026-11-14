// The decorative bottom of a card: a small schematic sheet that bleeds off the card's bottom right.
// Hidden from assistive technology; the small visible word "Illustration" says what it is. A sketch
// never prints a digit or a real figure: positions live in custom properties only. Inside a card the
// sheet lifts like a lid as it enters (data-depth-hinge, styled in globals.css).
import type { ReactNode } from 'react';

export function Vignette({ children }: { children: ReactNode }) {
  return (
    <div data-vignette="" aria-hidden="true">
      <span data-vignette-label="">Illustration</span>
      <div data-vignette-sheet="" data-depth-hinge="">
        {children}
      </div>
    </div>
  );
}
