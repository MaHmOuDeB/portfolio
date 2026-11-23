// A row on the About timeline: the months, the role and where. Server-safe, no hooks.
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locale';
import { Months, type MonthRange, type RangeWords } from './Months';

export function TimelineRow({
  range,
  role,
  where,
  locale = 'en',
  words,
}: {
  range: MonthRange;
  role: string;
  where: string;
  locale?: Locale;
  words?: RangeWords;
}): ReactNode {
  return (
    <li className="grid grid-cols-1 gap-x-8 gap-y-1 border-t border-hairline py-4 md:grid-cols-[12rem_1fr]">
      <p data-timeline-dates="" className="text-sm text-muted">
        <Months range={range} locale={locale} words={words} />
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
