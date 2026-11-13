// The Pulse event names and the refs of the taxonomy schema. Browser-safe: it imports nothing from
// the sources (only a type), so an island can name events and mark them as sourced without the
// export file. The server module src/lib/pulse/taxonomy.ts checks these names against the export
// when it loads, and re-exports them.
import type { DerivedRef } from '@/components/kit/Derived';

/** The event names in export order. The taxonomy module throws at load if the export disagrees. */
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

/** The refs of everything in a taxonomy row: the event names, triggers, questions and property keys. */
export const PULSE_TAXONOMY_REFS = ['source:pulse'] as const satisfies readonly DerivedRef[];
