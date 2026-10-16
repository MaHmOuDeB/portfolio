// Public entry point for facts: the generated data, the formatters and a checked lookup.
import { FACTS, type FactId } from './facts.generated.ts';
import type { FactDef } from './types.ts';

export { FACTS, FACT_DISPLAYS, type FactId } from './facts.generated.ts';
export { formatFact, formatValue } from './format.ts';

// A cast id from outside the type system fails loudly instead of rendering nothing.
export function getFact(id: FactId): FactDef {
  if (!Object.hasOwn(FACTS, id)) throw new Error(`unknown fact ${id}`);
  return FACTS[id];
}
