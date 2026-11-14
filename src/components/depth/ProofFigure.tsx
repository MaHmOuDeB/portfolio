// One proof figure: the side it belongs to, the number (passed in as a Fact or a Derived, never
// printed here), a decorative interval mark that closes once, and the caption.
import type { ReactNode } from 'react';

export function ProofFigure({ side, figure, children }: { side: string; figure: ReactNode; children: ReactNode }) {
  return (
    <div data-proof="">
      <span data-proof-side="">{side}</span>
      <div data-proof-figure="">{figure}</div>
      <div data-proof-mark="" aria-hidden="true">
        <s />
        <i />
        <b />
      </div>
      <p data-proof-caption="">{children}</p>
    </div>
  );
}
