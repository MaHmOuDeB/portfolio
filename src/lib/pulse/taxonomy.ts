// The Pulse event taxonomy: the seven tracked events of the vendored Pulse export, each with the
// moment it fires, the product question it was designed to answer and its property list, exactly as
// the export states them. Server only (it reads the export): a page passes the rows to its island as
// props, so the export file never ships to the browser whole.
import type { DerivedRef } from '@/components/kit/Derived';
import { pulse } from '@/lib/sources';

/** The event names in export order. The module throws at load if the export disagrees. */
export const PULSE_EVENT_NAMES = [
  'Viewed Dashboard',
  'Applied Filter',
  'Changed Date Range',
  'Viewed Chart Detail',
  'Exported Report',
  'Saved View',
  'Loaded Saved View',
] as const;

export type PulseEventName = (typeof PULSE_EVENT_NAMES)[number];

/** One export event, with the export's own keys and nothing added. */
export type PulseTaxonomyRow = Readonly<{
  name: PulseEventName;
  fires_when: string;
  question: string;
  properties: readonly string[];
}>;

/** The refs of everything in a taxonomy row: the event names, triggers, questions and property keys. */
export const PULSE_TAXONOMY_REFS = ['source:pulse'] as const satisfies readonly DerivedRef[];

const SOURCE_NAMES = pulse.tables.events.map((e) => e.name);
if (SOURCE_NAMES.length !== PULSE_EVENT_NAMES.length || SOURCE_NAMES.some((n, i) => n !== PULSE_EVENT_NAMES[i])) {
  throw new Error(`pulse: the export's events (${SOURCE_NAMES.join(', ')}) are not the typed event names`);
}

/** The export's events in export order, as frozen copies (each call returns new rows). */
export function pulseTaxonomy(): readonly PulseTaxonomyRow[] {
  return Object.freeze(
    pulse.tables.events.map((e, i) =>
      Object.freeze({
        fires_when: e.fires_when,
        name: PULSE_EVENT_NAMES[i]!,
        properties: Object.freeze([...e.properties]),
        question: e.question,
      }),
    ),
  );
}
