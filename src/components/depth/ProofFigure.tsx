// One proof cell: the side it belongs to, the number (passed in as a Fact or a Derived, never
// printed here) and the caption.
import type { ReactNode } from 'react';

export function ProofFigure({ side, figure, children }: { side: string; figure: ReactNode; children: ReactNode }) {
  return (
    <div data-proof="">
      <span data-proof-side="">{side}</span>
      <div data-proof-figure="">{figure}</div>
      <p data-proof-caption="">{children}</p>
    </div>
  );
}
