// The Retention page's sources: the vendored retention and retail exports, read through the one
// loader in @/lib/sources (never imported again here), and the commits they are pinned to. Server
// only: pages pass islands just the rows they plot.
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import { provenanceOf, retail, retention } from '@/lib/sources';
import lock from '../../../sources.lock.json';

export const RETENTION = retention;
export const RETAIL = retail;

export type Cohort = (typeof RETENTION.tables.cohort_matrix)[number];
export type RfmSegment = (typeof RETENTION.tables.rfm_segments)[number];
export type ReturnMode = 'raw' | 'clean';

type PageSource = 'retention' | 'retail';

/**
 * The provenance badge of a public-data Figure, from the export's own metadata. A source that is
 * not public data has no badge to give, so it throws rather than print a hand-written one.
 */
export function figureProvenance(id: PageSource): Provenance {
  const provenance = provenanceOf(id);
  if (provenance === 'none') throw new Error(`${id}: the export is not public data, so it has no Figure badge`);
  return provenance;
}

/** The Jan to Nov 2010 acquisition cohorts, months 0 to 12, in export order. */
export const COHORTS: readonly Cohort[] = RETENTION.tables.cohort_matrix;
/** The cohort a Figure shows before the visitor picks one: the first in the export. */
export const DEFAULT_COHORT_MONTH = '2010-01';

if (!COHORTS.some((c) => c.cohort_month === DEFAULT_COHORT_MONTH)) {
  throw new Error(`retention: no cohort ${DEFAULT_COHORT_MONTH} in the export`);
}

/** A source repository at the commit its export is pinned to in sources.lock.json. */
export function sourceRepo(id: PageSource): { name: string; commit: string; tree: string; file: (path?: string) => string } {
  const entry = lock.sources[id];
  const base = `https://github.com/${entry.repo}`;
  return {
    name: entry.repo,
    commit: entry.commit,
    tree: `${base}/tree/${entry.commit}`,
    // With no path, the export file itself.
    file: (path = entry.path) => `${base}/blob/${entry.commit}/${path}`,
  };
}
