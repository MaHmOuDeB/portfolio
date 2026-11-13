// A month range as it prints on the About timeline and the CV: "Aug 2023 – Apr 2025" or
// "Oct 2026 – present", each month in its own <time> (yyyy-mm). Server-safe, no hooks.
import type { ReactNode } from 'react';

/** A month as yyyy-mm. */
export type Month = `${number}-${number}`;
export type MonthRange = { from: Month; to: Month | null };

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function monthText(m: Month): string {
  const [year, month] = m.split('-');
  const name = NAMES[Number(month) - 1];
  if (!year || !name || !/^\d{4}$/.test(year)) throw new Error(`months: "${m}" is not a yyyy-mm month`);
  return `${name} ${year}`;
}

function MonthTime({ m }: { m: Month }) {
  return <time dateTime={m}>{monthText(m)}</time>;
}

export function Months({ range }: { range: MonthRange }): ReactNode {
  return (
    <>
      <MonthTime m={range.from} /> – {range.to ? <MonthTime m={range.to} /> : 'present'}
    </>
  );
}
