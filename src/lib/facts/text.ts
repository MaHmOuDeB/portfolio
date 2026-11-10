// A fact as plain text, for places that cannot render <Fact>: a string prop, a title, an
// accessible name, a metadata field. It prints exactly what <Fact> prints, through the same
// lookup and formatter, so a figure is written one way on every page.
import { formatFact, getFact, type FactId } from './index.ts';

export function factText(id: FactId, options: { decimals?: number } = {}): string {
  return formatFact(getFact(id), options);
}
