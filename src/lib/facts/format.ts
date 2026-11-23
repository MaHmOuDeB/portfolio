// Formats a fact value for display. Only this module decides how a number is written,
// so every page shows a figure the same way. English is en-GB; German is de-DE (decimal comma,
// dots for thousands, a no-break space before the percent sign and the pound sign). Negatives use U+2212.
import { INTL, type Locale } from '../i18n/locale.ts';
import type { FactDef, Unit } from './types.ts';

type Options = { decimals?: number; suffix?: '+'; scale?: 'k' | 'M'; locale?: Locale };

const MINUS = '−';
const NB = ' ';
const SCALES = { k: 1e3, M: 1e6 } as const;
const GERMAN_SCALE = { k: 'Tsd.', M: 'Mio.' } as const;

const dateFormats: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(INTL.en, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  de: new Intl.DateTimeFormat(INTL.de, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
};

function formatNumber(n: number, decimals: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL[locale], { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

function formatDate(value: string, locale: Locale): string {
  const time = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || Number.isNaN(time)) {
    throw new TypeError(`date value must be an ISO date string, got ${JSON.stringify(value)}`);
  }
  const text = dateFormats[locale].format(time);
  return locale === 'en' ? text.replace(/\bSept\b/, 'Sep') : text;
}

export function formatValue(value: number | string, unit: Unit, o: Options = {}): string {
  const locale = o.locale ?? 'en';
  if (unit === 'date') {
    if (typeof value !== 'string') throw new TypeError(`unit 'date' needs a string value, got ${typeof value}`);
    return formatDate(value, locale);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`unit '${unit}' needs a finite number, got ${JSON.stringify(value)}`);
  }
  const decimals = o.decimals ?? 0;
  const scaled = unit === 'share' ? value * 100 : o.scale ? value / SCALES[o.scale] : value;
  let digits = formatNumber(Math.abs(scaled), decimals, locale);
  // A value that rounds to zero is shown without a sign.
  const negative = scaled < 0 && /[1-9]/.test(digits);
  if (unit !== 'share' && o.scale) digits += locale === 'de' ? `${NB}${GERMAN_SCALE[o.scale]}` : o.scale;
  if (o.suffix) digits += o.suffix;
  let body: string;
  if (locale === 'de') {
    body = unit === 'share' ? `${digits}${NB}%` : unit === 'gbp' ? `${digits}${NB}£` : unit === 'kmh' ? `${digits} km/h` : digits;
  } else {
    body = unit === 'share' ? `${digits}%` : unit === 'gbp' ? `£${digits}` : unit === 'kmh' ? `${digits} km/h` : digits;
  }
  return negative ? `${MINUS}${body}` : body;
}

export function formatFact(f: FactDef, o: { decimals?: number; locale?: Locale } = {}): string {
  return formatValue(f.value, f.unit, { decimals: o.decimals ?? f.decimals, suffix: f.suffix, scale: f.scale, locale: o.locale });
}
