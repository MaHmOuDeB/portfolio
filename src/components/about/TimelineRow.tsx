// A row on the About timeline: the months, the role and where. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { Months, type MonthRange } from './Months';

export function TimelineRow({ range, role, where }: { range: MonthRange; role: string; where: string }): ReactNode {
  return (
    <li className="grid gap-x-8 gap-y-1 border-t border-line py-4 md:grid-cols-[12rem_1fr]">
      <p data-timeline-dates="" className="text-sm text-muted">
        <Months range={range} />
      </p>
      <div>
        <h3 className="text-base font-semibold">{role}</h3>
        <p data-timeline-where="" className="text-base text-muted">
          {where}
        </p>
      </div>
    </li>
  );
}
