// The taxonomy table of the Pulse page: the export's events word for word, one row each, with no
// column added (no grouping of the events). Pure: it takes the rows the server read from the export.
import type { TableData } from '@/components/kit/DataTable';
import { PULSE_TAXONOMY_REFS } from '@/lib/pulse/names';
import type { PulseTaxonomyRow } from '@/lib/pulse/taxonomy';

export function taxonomyTable(rows: readonly PulseTaxonomyRow[]): TableData {
  return {
    columns: ['Event', 'Fires when', 'Properties', 'Question it was designed to answer'],
    rows: rows.map((r) => [r.name, r.fires_when, r.properties.join(', '), r.question]),
    note: "Names and properties as the source code states them; triggers and questions as the project's README states them.",
    refs: PULSE_TAXONOMY_REFS,
  };
}
