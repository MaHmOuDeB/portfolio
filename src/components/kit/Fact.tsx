// The one <Fact> markup on every page: <data value="{raw value}" data-fact="{id}">{display}</data>.
// The truth audit finds figures through the data-fact attribute. Server-safe, no hooks.
import { formatFact, getFact, type FactId } from '@/lib/facts';
import type { Locale } from '@/lib/i18n/locale';

/** `locale` writes the number in German ("de"); omitted, it is the English form. */
export function Fact({ id, decimals, locale }: { id: FactId; decimals?: number; locale?: Locale }) {
  const fact = getFact(id);
  return (
    <data value={fact.value} data-fact={id}>
      {formatFact(fact, { decimals, locale })}
    </data>
  );
}
