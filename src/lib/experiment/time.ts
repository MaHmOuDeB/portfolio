// Berlin calendar days on a UTC server. Day buckets, completed-day looks, "2 weeks" and the 6-month
// cap are all counted in Europe/Berlin, so they hold across the clocks-back and clocks-forward
// nights and at month ends. Instants are ISO strings with an explicit offset.
import type { ExperimentConfig } from '../../experiment.values.ts';

const ZONE = 'Europe/Berlin';
const DAY_MS = 86_400_000;

// Without an offset, ECMAScript reads a date-time string in the machine's timezone.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const offsetFormat = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, timeZoneName: 'longOffset' });

type CalendarDay = { y: number; m: number; d: number };

function instant(iso: string): number {
  const t = Date.parse(iso);
  if (!ISO_WITH_OFFSET.test(iso) || Number.isNaN(t)) {
    throw new TypeError(`timestamp must be an ISO date-time string with an offset, got ${JSON.stringify(iso)}`);
  }
  return t;
}

function format(c: CalendarDay): string {
  return `${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
}

function parseDay(day: string): CalendarDay {
  const m = DAY.exec(day);
  const c = m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
  if (c === null || c.m < 1 || c.m > 12 || c.d < 1 || c.d > daysInMonth(c.y, c.m)) {
    throw new TypeError(`day must be a calendar date YYYY-MM-DD, got ${JSON.stringify(day)}`);
  }
  return c;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The Berlin calendar day of an instant (milliseconds). */
function berlinCalendarDay(t: number): CalendarDay {
  const found: Partial<Record<'year' | 'month' | 'day', number>> = {};
  for (const p of dayFormat.formatToParts(t)) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') found[p.type] = Number(p.value);
  }
  return { y: found.year!, m: found.month!, d: found.day! };
}

/** Berlin's UTC offset at an instant, in minutes, from the 'longOffset' name ("GMT+02:00"). */
function berlinOffsetMinutes(t: number): number {
  const name = offsetFormat.formatToParts(t).find((p) => p.type === 'timeZoneName')?.value ?? '';
  if (name === 'GMT') return 0;
  const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (m === null) throw new Error(`unexpected offset name ${JSON.stringify(name)}`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

function offsetString(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Adds whole days to a calendar date (proleptic Gregorian, no timezone involved). */
function addDays(c: CalendarDay, days: number): CalendarDay {
  const t = new Date(Date.UTC(c.y, c.m - 1, c.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 'YYYY-MM-DD': the Berlin calendar day of an instant. */
export function berlinDay(iso: string): string {
  return format(berlinCalendarDay(instant(iso)));
}

/**
 * Berlin midnight of a calendar day, written with that midnight's offset:
 * '2026-10-25T00:00:00+02:00', '2026-10-26T00:00:00+01:00'. Berlin's clocks change at 02:00 and
 * 03:00, never at midnight, so midnight always exists and is unique.
 */
export function berlinStartOfDay(day: string): string {
  const c = parseDay(day);
  const utcMidnight = Date.UTC(c.y, c.m - 1, c.d);
  // The offset at UTC midnight is a first guess; the offset at the corrected instant is the answer.
  let offset = berlinOffsetMinutes(utcMidnight);
  offset = berlinOffsetMinutes(utcMidnight - offset * 60_000);
  const result = `${format(c)}T00:00:00${offsetString(offset)}`;
  if (berlinDay(result) !== format(c)) throw new Error(`no Berlin midnight found for ${day}`);
  return result;
}

/**
 * The start of the Berlin day `months` calendar months after the Berlin day of `iso`, clamped to
 * the end of a shorter month (31 August + 6 months is 28 February).
 */
export function addMonthsBerlin(iso: string, months: number): string {
  if (!Number.isInteger(months)) throw new RangeError(`months must be an integer, got ${months}`);
  const c = berlinCalendarDay(instant(iso));
  const index = c.y * 12 + (c.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return berlinStartOfDay(format({ y, m, d: Math.min(c.d, daysInMonth(y, m)) }));
}

/** Whole Berlin calendar days from the day of `fromIso` to the day of `toIso` (negative backwards). */
export function berlinDaysBetween(fromIso: string, toIso: string): number {
  const a = berlinCalendarDay(instant(fromIso));
  const b = berlinCalendarDay(instant(toIso));
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/**
 * Decision 13. Once the A/B has started, its start plus the cap in calendar months ('fixed').
 * Before that, the earliest possible end: the calibration start plus its minimum days plus the cap
 * ('earliest'), each at the start of the Berlin day.
 */
export function plannedEnd(config: ExperimentConfig, calibrationStartedOn: string): { at: string; kind: 'fixed' | 'earliest' } {
  const { startedOn, capMonths } = config.ab;
  if (startedOn !== null) return { at: addMonthsBerlin(startedOn, capMonths), kind: 'fixed' };
  const switchDay = addDays(berlinCalendarDay(instant(calibrationStartedOn)), config.calibration.minDays);
  return { at: addMonthsBerlin(berlinStartOfDay(format(switchDay)), capMonths), kind: 'earliest' };
}
