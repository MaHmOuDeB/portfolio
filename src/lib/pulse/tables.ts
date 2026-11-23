// The taxonomy table of the Pulse page: the export's events word for word, one row each, with no
// column added (no grouping of the events). Pure: it takes the rows the server read from the export.
import type { TableData } from '@/components/kit/DataTable';
import { PULSE_TAXONOMY_REFS } from '@/lib/pulse/names';
import type { PulseTaxonomyRow } from '@/lib/pulse/taxonomy';

/** The words around the table's rows: the four column names and the note. The rows themselves are the export's. */
export type TaxonomyText = { columns: readonly [string, string, string, string]; note: string };

export const EN_TAXONOMY: TaxonomyText = {
  columns: ['Event', 'Fires when', 'Properties', 'Question it was designed to answer'],
  note: "Names and properties as the source code states them; triggers and questions as the project's README states them.",
};

export function taxonomyTable(rows: readonly PulseTaxonomyRow[], text: TaxonomyText = EN_TAXONOMY): TableData {
  return {
    columns: [...text.columns],
    rows: rows.map((r) => [r.name, r.fires_when, r.properties.join(', '), r.question]),
    note: text.note,
    refs: PULSE_TAXONOMY_REFS,
  };
}
