// The Weather note's source adapter. It reads the vendored weather export through the one loader in
// @/lib/sources and hands the page only what it may show: how many checks there are at each level,
// the dataset's name and link, whether a licence is stated, and the badge. No check name, failing-row
// count or reading leaves this file, so the page cannot print a row of the data. Server only.
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import { getFact } from '@/lib/facts';
import { provenanceOf, weather } from '@/lib/sources';

export type CheckLevel = 'error' | 'warn' | 'info';
export const CHECK_LEVELS: readonly CheckLevel[] = ['error', 'warn', 'info'];

/** The number of checks at each level, in the order error, warn, info, checked against the facts. */
export function checkLevels(): readonly { level: CheckLevel; count: number }[] {
  const counts = new Map<CheckLevel, number>(CHECK_LEVELS.map((l) => [l, 0]));
  for (const c of weather.tables.checks) {
    const level = c.severity as CheckLevel;
    if (!CHECK_LEVELS.includes(level)) throw new Error(`weather: unknown check level '${c.severity}'`);
    counts.set(level, counts.get(level)! + 1);
  }
  if (weather.tables.checks.length !== getFact('weather.checks.count').value) {
    throw new Error('weather: the check list does not match the checks.count fact');
  }
  if (counts.get('error') !== getFact('weather.checks.error_count').value) {
    throw new Error('weather: the error-level checks do not match the checks.error_count fact');
  }
  return CHECK_LEVELS.map((level) => ({ level, count: counts.get(level)! }));
}

/** The dataset as the export names it. Its Kaggle page gives no licence ("Not stated ..."). */
export const WEATHER_DATASET: { name: string; url: string; licenceStated: boolean } = {
  name: weather._meta.dataset.name,
  url: weather._meta.dataset.url,
  licenceStated: !weather._meta.dataset.licence.startsWith('Not stated'),
};

/** The badge of the note's sourced table, from the export's own metadata. */
export function weatherProvenance(): Provenance {
  const provenance = provenanceOf('weather');
  if (provenance === 'none') throw new Error('weather: the export is not public data, so it has no badge');
  return provenance;
}

/** The check rule for sparse places ("fewer than 20 times"), read from the export's check name. */
export function sparsePlaceThreshold(): number {
  const check = weather.tables.checks.find((c) => /^locations observed fewer than \d+ times$/.test(c.name));
  if (!check) throw new Error('weather: no sparse-location check in the export');
  if (check.failing_rows !== getFact('weather.checks.sparse_locations').value) {
    throw new Error('weather: the sparse-location check does not match its fact');
  }
  return Number(/\d+/.exec(check.name)![0]);
}
