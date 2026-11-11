// What the peeking Figure loads in the browser, followed through static imports:
// - The page loads its client file and the loader at once. They must never reach the model, the
//   precomputed table or the statistics: those arrive only with the island, through its dynamic
//   import, which this walk does not follow.
// - The island reaches the model and its table, but never the simulation engine or the random number
//   generator: the browser looks results up and never simulates.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../../src');
const EAGER = [join(SRC, 'components/figures/PeekingFigureClient.tsx'), join(SRC, 'components/figures/EagerOrIntent.tsx')];
const ISLAND = join(SRC, 'components/figures/PeekingInteractive.tsx');
const STATS = join(SRC, 'lib/stats') + '/';
const MODEL = join(SRC, 'lib/lab/peeking.ts');
const TABLE = join(SRC, 'lib/lab/peeking-table.generated.ts');
const ENGINE = [join(SRC, 'lib/stats/peeking.ts'), join(SRC, 'lib/stats/rng.ts'), join(SRC, 'lib/stats/index.ts')];

/** Static value imports and re-exports only: `import type` is erased, and import() is a separate chunk. */
function staticSpecifiers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) found.push(m[1]!);
  return found;
}

function resolveSpecifier(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`unresolved local import ${spec} in ${from}`);
}

function reachable(roots: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const queue: Array<[string, string]> = roots.map((r) => [r, '(root)']);
  while (queue.length > 0) {
    const [file, via] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, via);
    for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
      const next = resolveSpecifier(file, spec);
      if (next !== null) queue.push([next, file]);
    }
  }
  return seen;
}

const leaks = (seen: Map<string, string>, bad: (f: string) => boolean) =>
  [...seen].filter(([file]) => bad(file)).map(([file, via]) => `${file} (imported by ${via})`);

describe('the peeking code the page loads at once', () => {
  it('reaches neither the model, its table nor any statistics code', () => {
    const seen = reachable(EAGER);
    expect(leaks(seen, (f) => f === MODEL || f === TABLE || f.startsWith(STATS))).toEqual([]);
    // the walk is real: it reaches the client-safe values and the kit controls
    expect(seen.has(join(SRC, 'lib/lab/peeking-values.ts'))).toBe(true);
    expect(seen.has(join(SRC, 'components/kit/Slider.tsx'))).toBe(true);
  });

  it('does not follow the dynamic import of the island', () => {
    expect(reachable(EAGER).has(ISLAND)).toBe(false);
  });
});

describe('the peeking island', () => {
  it('reaches the model and its table, never the simulation engine, the generator or the statistics barrel', () => {
    const seen = reachable([ISLAND]);
    expect(seen.has(MODEL)).toBe(true);
    expect(seen.has(TABLE)).toBe(true);
    expect(leaks(seen, (f) => ENGINE.includes(f))).toEqual([]);
  });

  it('would catch a leak: the statistics barrel does reach the engine', () => {
    const seen = reachable([join(SRC, 'lib/stats/index.ts')]);
    expect(seen.has(join(SRC, 'lib/stats/peeking.ts'))).toBe(true);
  });
});
