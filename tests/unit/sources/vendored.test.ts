import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTS, formatFact, type FactId } from '../../../src/lib/facts/index.ts';
import { provenanceOf, pulse, retail, retention, weather } from '../../../src/lib/sources/index.ts';
import { SOURCE_IDS } from '../../../src/lib/facts/types.ts';

const shown = (id: string) => formatFact(FACTS[id as FactId]);
const root = join(import.meta.dirname, '..', '..', '..');

describe('the vendored source exports', () => {
  it('formats the retail returns growth as the raw and the cleaned figure', () => {
    expect(shown('retail.returns.yoy_growth_raw')).toBe('29%');
    expect(shown('retail.returns.yoy_growth_clean')).toBe('2%');
  });

  it('formats the retention figures', () => {
    expect(shown('retention.winback.n_per_arm')).toBe('1,353');
    expect(shown('retention.winback.baseline_rate')).toBe('29%');
    expect(shown('retention.cohort.month1_rate')).toBe('20%');
    expect(shown('retention.rfm.champions_customer_share')).toBe('23%');
  });

  it('formats the weather figures', () => {
    expect(shown('weather.checks.count')).toBe('18');
    expect(shown('weather.quarantine.rows')).toBe('5');
    expect(shown('weather.quarantine.max_wind_kmh')).toBe('2,963 km/h');
    expect(shown('weather.quarantine.threshold_kmh')).toBe('150 km/h');
    expect(shown('weather.model.xgb_auc')).toBe('0.91');
  });

  it('keeps the held-back readings out of the weather export', () => {
    expect(Object.keys(weather.tables)).not.toContain('quarantine');
    expect(JSON.stringify(weather)).not.toMatch(/leak/i);
  });

  it('formats the Pulse event count', () => {
    expect(shown('pulse.events.count')).toBe('7');
  });

  it('exports the two UCI Online Retail II sources from the same input file', () => {
    expect(retention._meta.inputs[0]?.sha256).toBe(retail._meta.inputs[0]?.sha256);
  });

  it('exposes one named export per source, matching its own _meta.source', () => {
    expect([retention, retail, weather, pulse].map((s) => s._meta.source)).toEqual([...SOURCE_IDS]);
  });

  it('reports provenance from the vendored _meta, never typed by hand', () => {
    expect(provenanceOf('retention')).toBe('public-data');
    expect(provenanceOf('retail')).toBe('public-data');
    expect(provenanceOf('weather')).toBe('public-data');
    expect(provenanceOf('pulse')).toBe('none');
  });

  it('src/lib/sources/index.ts is the only reader of data/sources', () => {
    const text = readFileSync(join(root, 'src/lib/sources/index.ts'), 'utf8');
    for (const id of SOURCE_IDS) expect(text).toContain(`data/sources/${id}.json`);
  });
});
