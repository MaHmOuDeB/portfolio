import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPERIMENT, TAU2 } from '../../../src/experiment.config';
import { HEADLINES } from '../../../content/experiment/headlines';
import { canonicalJson, preregHash } from '../../../scripts/prereg-hash';

const ROOT = join(import.meta.dirname, '../../..');

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Design = { experiment: Json; tau2: Json; headlines: Json };

function design(): Design {
  return structuredClone({ experiment: EXPERIMENT, tau2: TAU2, headlines: HEADLINES }) as unknown as Design;
}

/** Every leaf under `node`, as a path from `node`. */
function leaves(node: Json, path: (string | number)[] = []): (string | number)[][] {
  if (node === null || typeof node !== 'object') return [path];
  const keys: (string | number)[] = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
  return keys.flatMap((k) => leaves((node as unknown as Node)[k] as Json, [...path, k]));
}

type Node = Record<string | number, Json>;

/** Replaces the leaf at `path` with a changed value. */
function mutate(root: Json, path: (string | number)[]): void {
  let cursor = root as unknown as Node;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as unknown as Node;
  const last = path[path.length - 1] as string | number;
  cursor[last] = changed(cursor[last] as Json);
}

function changed(value: Json): Json {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}x`;
  if (typeof value === 'boolean') return !value;
  return 'changed';
}

const isStartedOn = (path: (string | number)[]): boolean => path[path.length - 1] === 'startedOn';

describe('canonicalJson', () => {
  it('sorts keys at every depth and writes no whitespace', () => {
    expect(canonicalJson({ b: [{ z: 1, a: 2 }], a: null })).toBe('{"a":null,"b":[{"a":2,"z":1}]}');
  });
});

describe('preregHash', () => {
  it('is 64 lowercase hex characters and stable', () => {
    expect(preregHash()).toMatch(/^[0-9a-f]{64}$/);
    expect(preregHash()).toBe(preregHash());
  });

  it('changes when any pre-registered EXPERIMENT value changes', () => {
    const base = preregHash(design());
    const paths = leaves(design().experiment).filter((p) => !isStartedOn(p));
    expect(paths.length).toBeGreaterThan(30);
    for (const path of paths) {
      const copy = design();
      mutate(copy.experiment, path);
      expect(preregHash(copy), `experiment.${path.join('.')}`).not.toBe(base);
    }
  });

  it('changes when a tau2 value changes', () => {
    const base = preregHash(design());
    for (const key of ['primary', 'guardrail'] as const) {
      const copy = design();
      (copy.tau2 as { [k: string]: number })[key] = (copy.tau2 as { [k: string]: number })[key]! + 1e-9;
      expect(preregHash(copy), `tau2.${key}`).not.toBe(base);
    }
  });

  it('changes when any headline part changes', () => {
    const base = preregHash(design());
    const paths = leaves(design().headlines);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      const copy = design();
      mutate(copy.headlines, path);
      expect(preregHash(copy), `headlines.${path.join('.')}`).not.toBe(base);
    }
  });

  it('does not change when a startedOn date is set', () => {
    const base = preregHash(design());
    const copy = design();
    const experiment = copy.experiment as { calibration: { startedOn: Json }; ab: { startedOn: Json } };
    experiment.calibration.startedOn = '2026-11-09T00:00:00+01:00';
    experiment.ab.startedOn = '2026-11-30T00:00:00+01:00';
    expect(preregHash(copy)).toBe(base);
  });

  it('matches the hash written in docs/experiment/prereg.md (the design freeze)', () => {
    const text = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8');
    const written = /^Pre-registration hash: ([0-9a-f]{64})$/m.exec(text)?.[1];
    expect(
      written,
      'the config or headlines changed without a new pre-registration version: run `npm run prereg:hash`, ' +
        'update prereg.md, and bump the version and tag if the design itself changed',
    ).toBe(preregHash());
  });
});
