import { readFileSync } from 'node:fs';

// The envelope ($defs.meta, $defs.fact) is copied into every schema file, so these tests
// keep the copies in sync and tie the unit enum to the Unit type in the facts contract.
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SOURCES = ['retention', 'retail', 'weather', 'pulse'] as const;
const ALL = [...SOURCES, 'profile'] as const;

const schema = (name: string): Json =>
  JSON.parse(readFileSync(new URL(`../../../data/schemas/${name}-1.schema.json`, import.meta.url), 'utf8'));
const clone = <T>(x: T): T => structuredClone(x);

const LEAK_RULE = { not: { pattern: '[Ll][Ee][Aa][Kk]' } };

// Removes the weather-only leak rule everywhere, returning how many were removed.
function stripLeakRule(node: unknown, counter = { n: 0 }): { value: unknown; removed: number } {
  const walk = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === 'object') {
      const out: Json = {};
      for (const [k, v] of Object.entries(x)) {
        if (k === 'propertyNames' && JSON.stringify(v) === JSON.stringify(LEAK_RULE)) {
          counter.n += 1;
          continue;
        }
        out[k] = walk(v);
      }
      return out;
    }
    return x;
  };
  const value = walk(node);
  return { value, removed: counter.n };
}

function unitsFromContract(): string[] {
  const src = readFileSync(new URL('../../../src/lib/facts/types.ts', import.meta.url), 'utf8');
  const m = /export type Unit =([^;]+);/.exec(src);
  if (!m?.[1]) throw new Error('Unit type not found in src/lib/facts/types.ts');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1] as string);
}

// A source schema's meta/fact with the per-source consts and the weather leak rule removed.
function normalised(name: string, def: 'meta' | 'fact'): Json {
  const copy = clone(schema(name).$defs[def]);
  if (def === 'meta') {
    delete copy.properties.schema;
    delete copy.properties.source;
    copy.required = copy.required.filter((k: string) => k !== 'schema' && k !== 'source');
  }
  return stripLeakRule(copy).value as Json;
}

describe('schema envelope stays in sync', () => {
  it('the unit enum of every fact def equals the Unit type in the facts contract', () => {
    const units = unitsFromContract();
    expect(units).toHaveLength(8);
    for (const name of ALL) {
      expect(schema(name).$defs.fact.properties.unit.enum, name).toEqual(units);
    }
  });

  it('meta is identical across the four source schemas apart from the schema and source consts', () => {
    const [first, ...rest] = SOURCES;
    for (const name of rest) expect(normalised(name, 'meta'), `${name} vs ${first}`).toEqual(normalised(first, 'meta'));
  });

  it('fact is identical across the four source schemas apart from the weather leak rule', () => {
    const [first, ...rest] = SOURCES;
    for (const name of rest) expect(normalised(name, 'fact'), `${name} vs ${first}`).toEqual(normalised(first, 'fact'));
  });

  it('each source meta pins its own schema and source consts', () => {
    for (const name of SOURCES) {
      const props = schema(name).$defs.meta.properties;
      expect(props.schema, name).toEqual({ const: `${name}/1` });
      expect(props.source, name).toEqual({ const: name });
    }
  });

  it('only the weather schema carries the leak rule, and every weather object has it', () => {
    for (const name of SOURCES.filter((n) => n !== 'weather')) {
      expect(stripLeakRule(schema(name)).removed, name).toBe(0);
    }
    expect(stripLeakRule(schema('profile')).removed).toBe(0);

    const missing: string[] = [];
    const walk = (x: unknown, path: string): void => {
      if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${path}/${i}`));
      if (!x || typeof x !== 'object') return;
      const o = x as Json;
      if (o.type === 'object' && JSON.stringify(o.propertyNames?.not) !== JSON.stringify(LEAK_RULE.not)) {
        missing.push(path || '/');
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`);
    };
    walk(schema('weather'), '');
    expect(missing).toEqual([]);
  });

  it('profile fact differs from the source fact only in from being the const profile', () => {
    const profile = clone(schema('profile').$defs.fact);
    const source = clone(schema('retention').$defs.fact);
    expect(profile.properties.from).toEqual({ const: 'profile' });
    expect(source.properties.from).toEqual({ type: 'string' });
    delete profile.properties.from;
    delete source.properties.from;
    expect(profile).toEqual(source);
  });

  it('profile meta is only schema and source, both consts', () => {
    const meta = schema('profile').$defs.meta;
    expect(meta.properties).toEqual({ schema: { const: 'profile/1' }, source: { const: 'profile' } });
    expect(meta.required).toEqual(['schema', 'source']);
    expect(meta.additionalProperties).toBe(false);
  });
});
