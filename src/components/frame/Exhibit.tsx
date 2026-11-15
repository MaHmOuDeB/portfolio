// The two sentences around an exhibit, each a small label and one paragraph in the readable column.
// LeadIn sits above the Figure and says what to look at. Takeaway sits below and says what it means:
// it is the point of the exhibit, so its sentence is larger and heavier and its label carries a mark.
// Neither is a heading and neither moves. The kit's Callout (a rule at the left) is for limits.
import type { ReactNode } from 'react';

type Props = {
  label?: ReactNode;
  /** One sentence. Inline content. */
  children: ReactNode;
};

export function LeadIn({ label = 'What to look at', children }: Props) {
  return (
    <div data-lead-in="">
      <p data-exhibit-label="">{label}</p>
      <p data-exhibit-text="">{children}</p>
    </div>
  );
}

export function Takeaway({ label = 'What it means', children }: Props) {
  return (
    <div data-takeaway="">
      <p data-exhibit-label="">{label}</p>
      <p data-exhibit-text="">{children}</p>
    </div>
  );
}
