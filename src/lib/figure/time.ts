// Timestamps for visitors. ISR renders on a UTC server and visitors read in any locale, so every
// time is written in Europe/Berlin as dd.mm and 24-hour hh:mm, whatever the machine's timezone.

const berlin = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

type Parts = { year: string; month: string; day: string; hour: string; minute: string };

function parts(iso: string): Parts {
  const time = Date.parse(iso);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(iso) || Number.isNaN(time)) {
    throw new TypeError(`timestamp must be an ISO date-time string, got ${JSON.stringify(iso)}`);
  }
  const found: Partial<Parts> = {};
  for (const p of berlin.formatToParts(time)) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day' || p.type === 'hour' || p.type === 'minute') {
      found[p.type] = p.value;
    }
  }
  return found as Parts;
}

/** "25.10": the Berlin calendar day of an instant. */
export function berlinDate(iso: string): string {
  const p = parts(iso);
  return `${p.day}.${p.month}`;
}

/** "00:30": the Berlin wall-clock time of an instant, 24-hour. */
export function berlinTime(iso: string): string {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

/** "Updated 14:05", or "Updated 24.10, 23:30" when the Berlin day is not the day of rendering. */
export function updatedLabel(updatedAt: string, renderedAt: string): string {
  const u = parts(updatedAt);
  const r = parts(renderedAt);
  const sameDay = u.year === r.year && u.month === r.month && u.day === r.day;
  return sameDay ? `Updated ${u.hour}:${u.minute}` : `Updated ${u.day}.${u.month}, ${u.hour}:${u.minute}`;
}
