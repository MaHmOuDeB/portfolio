import { readFileSync } from 'node:fs';
import { SOURCE_IDS, validateExport } from '../../../scripts/sources/schema.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type SchemaId = Parameters<typeof validateExport>[1];

const NAMES = ['retention', 'retail', 'weather', 'pulse', 'profile'] as const;
const load = (name: string): Json =>
  JSON.parse(readFileSync(new URL(`../../fixtures/sources/${name}.valid.json`, import.meta.url), 'utf8'));
const clone = <T>(x: T): T => structuredClone(x);
const id = (name: string) => `${name}/1` as SchemaId;

function errorsOf(json: unknown, schema: SchemaId): string[] {
  const r = validateExport(json, schema);
  expect(r.ok).toBe(false);
  return r.ok ? [] : r.errors;
}

describe('SOURCE_IDS', () => {
  it('lists the four sources in order', () => {
    expect(SOURCE_IDS).toEqual(['retention', 'retail', 'weather', 'pulse']);
  });
});

describe('valid fixtures', () => {
  for (const name of NAMES) {
    it(`${name} passes its own schema and fails every other`, () => {
      const json = load(name);
      expect(validateExport(json, id(name))).toEqual({ ok: true });
      for (const other of NAMES.filter((n) => n !== name)) {
        expect(validateExport(json, id(other)).ok, `${name} against ${other}`).toBe(false);
      }
    });
  }
});

describe('retention mutations', () => {
  const base = load('retention');

  it('rejects a missing _meta.inputs and names the path', () => {
    const j = clone(base);
    delete j._meta.inputs;
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/_meta .*inputs/);
  });

  it('rejects a malformed sha256', () => {
    const j = clone(base);
    j._meta.inputs[0].sha256 = 'abc';
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/_meta\/inputs\/0\/sha256 /);
  });

  it('rejects an uppercase fact key', () => {
    const j = clone(base);
    j.facts['Cohort.month1'] = j.facts['cohorts.retention_month1'];
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/facts .*Cohort\.month1/);
  });

  it('rejects a unit outside the Global Constraints list', () => {
    const j = clone(base);
    j.facts['cohorts.retention_month1'].unit = 'percent';
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/facts\/cohorts\.retention_month1\/unit /);
  });

  it('rejects decimals above 4', () => {
    const j = clone(base);
    j.facts['cohorts.retention_month1'].decimals = 5;
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/facts\/cohorts\.retention_month1\/decimals /);
  });

  it('rejects a string value on a non-date fact', () => {
    const j = clone(base);
    j.facts['cohorts.retention_month1'].value = '0.2';
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/facts\/cohorts\.retention_month1\/value /);
  });

  it('rejects an extra top-level key', () => {
    const j = clone(base);
    j.extra = 1;
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/ 'extra'/);
  });

  it('rejects 10 cohort rows', () => {
    const j = clone(base);
    j.tables.cohort_matrix.pop();
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/tables\/cohort_matrix /);
  });

  it('rejects 12 retention entries', () => {
    const j = clone(base);
    j.tables.cohort_matrix[0].retention.pop();
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/tables\/cohort_matrix\/0\/retention /);
  });

  it('rejects an extra column in a row', () => {
    const j = clone(base);
    j.tables.models[0].customer_id = 'x';
    expect(errorsOf(j, 'retention/1').join('\n')).toMatch(/\/tables\/models\/0 .*customer_id/);
  });
});

describe('date facts', () => {
  it('requires an ISO string for unit date and rejects a number', () => {
    const j = clone(load('retail'));
    j.facts['sales.last_date'].value = 20111209;
    expect(errorsOf(j, 'retail/1').join('\n')).toMatch(/\/facts\/sales\.last_date\/value /);
  });
});

describe('weather forbids the leakage story', () => {
  const base = load('weather');

  it('rejects an added tables.leakage_demo', () => {
    const j = clone(base);
    j.tables.leakage_demo = [];
    expect(errorsOf(j, 'weather/1').join('\n')).toMatch(/\/tables .*leakage_demo/);
  });

  it('rejects a fact key containing leak in any case', () => {
    for (const key of ['model.leak_r2', 'model.LEAK_r2']) {
      const j = clone(base);
      j.facts[key] = j.facts['quarantine.rows'];
      expect(errorsOf(j, 'weather/1').join('\n'), key).toMatch(/\/facts /);
    }
  });

  it('rejects a leak-named column in a row', () => {
    const j = clone(base);
    j.tables.checks[0].leak_flag = true;
    expect(errorsOf(j, 'weather/1').join('\n')).toMatch(/\/tables\/checks\/0 /);
  });

  it('rejects a tables.quarantine array', () => {
    const j = clone(base);
    j.tables.quarantine = [{ wind_kmh: 120 }];
    expect(errorsOf(j, 'weather/1').join('\n')).toMatch(/\/tables .*quarantine/);
  });
});

describe('profile allows exactly the eight approved facts', () => {
  const base = load('profile');

  it('rejects a ninth fact key', () => {
    const j = clone(base);
    j.facts['audible.unlisted_key'] = j.facts['audible.markets'];
    expect(errorsOf(j, 'profile/1').join('\n')).toMatch(/\/facts .*audible\.unlisted_key/);
  });

  it('rejects a missing approved key', () => {
    const j = clone(base);
    delete j.facts['audible.teams'];
    expect(errorsOf(j, 'profile/1').join('\n')).toMatch(/\/facts .*audible\.teams/);
  });

  it('rejects a fact whose from is not fact-sheet', () => {
    const j = clone(base);
    j.facts['audible.markets'].from = 'results.json#/x';
    expect(errorsOf(j, 'profile/1').join('\n')).toMatch(/\/facts\/audible\.markets\/from /);
  });
});

describe('validateExport', () => {
  it('throws on an unknown schema id', () => {
    expect(() => validateExport({}, 'nope/1' as never)).toThrow(new Error('unknown schema nope/1'));
  });
});
