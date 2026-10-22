// The vendored source exports (data/sources/<id>.json, written by scripts/sync-sources.ts).
// Pages read tables from here and numbers through <Fact>; nothing else imports the JSON files.
import type { SourceId } from '../facts/types.ts';
import pulse from '../../../data/sources/pulse.json';
import retail from '../../../data/sources/retail.json';
import retention from '../../../data/sources/retention.json';
import weather from '../../../data/sources/weather.json';

export { pulse, retail, retention, weather };

const ALL = { retention, retail, weather, pulse } as const;

/** 'public-data' for a source built on a public dataset, 'none' for a hand-written one (Pulse). */
export function provenanceOf(id: SourceId): 'public-data' | 'none' {
  const provenance: string = ALL[id]._meta.provenance;
  if (provenance !== 'public-data' && provenance !== 'none') {
    throw new Error(`${id}: unknown _meta.provenance '${provenance}'`);
  }
  return provenance;
}
