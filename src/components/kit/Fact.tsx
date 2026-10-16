// The one <Fact> markup on every page: <data value="{raw value}" data-fact="{id}">{display}</data>.
// The truth audit finds figures through the data-fact attribute. Server-safe, no hooks.
import { formatFact, getFact, type FactId } from '@/lib/facts';

export function Fact({ id, decimals }: { id: FactId; decimals?: number }) {
  const fact = getFact(id);
  return (
    <data value={fact.value} data-fact={id}>
      {formatFact(fact, { decimals })}
    </data>
  );
}
