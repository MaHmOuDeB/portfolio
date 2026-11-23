// A figure computed from facts, a simulation, live data or the build. It names where it came from
// in data-derived so the truth audit can check the refs. Server-safe, no hooks.
// The formatter comes from its own module so client bundles do not pull in the FACTS map.
import { formatValue } from '@/lib/facts/format';
import type { FactId } from '@/lib/facts';
import type { SourceId, Unit } from '@/lib/facts/types';
import type { Locale } from '@/lib/i18n/locale';

export type DerivedRef = FactId | `source:${SourceId}` | 'simulated' | 'live' | 'build';

// Also used by chart ticks and table cells that carry a derived number.
export function derivedAttr(refs: readonly DerivedRef[]): { 'data-derived': string } {
  if (refs.length === 0) throw new Error('a derived figure needs at least one ref');
  return { 'data-derived': refs.join(' ') };
}

export function Derived({
  value,
  unit,
  refs,
  decimals,
  suffix,
  scale,
  locale,
}: {
  value: number | string;
  unit: Unit;
  refs: readonly DerivedRef[];
  decimals?: number;
  suffix?: '+';
  scale?: 'k' | 'M';
  /** The number's language; omitted, English. */
  locale?: Locale;
}) {
  return (
    <data value={value} {...derivedAttr(refs)}>
      {formatValue(value, unit, { decimals, suffix, scale, locale })}
    </data>
  );
}
