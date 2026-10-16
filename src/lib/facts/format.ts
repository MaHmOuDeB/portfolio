// Formats a fact value for display. Only this module decides how a number is written,
// so every page shows a figure the same way. Locale en-GB; negatives use U+2212.
import type { FactDef, Unit } from './types.ts';

type Options = { decimals?: number; suffix?: '+'; scale?: 'k' | 'M' };

const MINUS = '−';
const SCALES = { k: 1e3, M: 1e6 } as const;

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatNumber(n: number, decimals: number): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function formatDate(value: string): string {
  const time = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(time)) {
    throw new TypeError(`date value must be an ISO date string, got ${JSON.stringify(value)}`);
  }
  return dateFormat.format(time);
}

export function formatValue(value: number | string, unit: Unit, o: Options = {}): string {
  if (unit === 'date') {
    if (typeof value !== 'string') throw new TypeError(`unit 'date' needs a string value, got ${typeof value}`);
    return formatDate(value);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`unit '${unit}' needs a finite number, got ${JSON.stringify(value)}`);
  }
  const decimals = o.decimals ?? 0;
  const scaled = unit === 'share' ? value * 100 : o.scale ? value / SCALES[o.scale] : value;
  let digits = formatNumber(Math.abs(scaled), decimals);
  // A value that rounds to zero is shown without a sign.
  const negative = scaled < 0 && /[1-9]/.test(digits);
  if (unit !== 'share' && o.scale) digits += o.scale;
  if (o.suffix) digits += o.suffix;
  const body =
    unit === 'share' ? `${digits}%` : unit === 'gbp' ? `£${digits}` : unit === 'kmh' ? `${digits} km/h` : digits;
  return negative ? `${MINUS}${body}` : body;
}

export function formatFact(f: FactDef, o: { decimals?: number } = {}): string {
  return formatValue(f.value, f.unit, { decimals: o.decimals ?? f.decimals, suffix: f.suffix, scale: f.scale });
}
