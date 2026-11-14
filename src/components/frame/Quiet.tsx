// The quiet second clause of a large headline (ink at 50%, large text only). globals.css colours it
// only inside an h1 or h2; anywhere else it is plain text. SectionHead and PageHead render it from
// their `quiet` prop.
import type { ReactNode } from 'react';

export function Quiet({ children }: { children: ReactNode }) {
  return <span data-quiet="">{children}</span>;
}
