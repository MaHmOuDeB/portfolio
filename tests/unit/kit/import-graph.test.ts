// The kit and the figure logic are bundled for the client. They read the pre-registered values from
// src/experiment.values.ts (data only); nothing they import, directly or through other files, may
// reach the statistics library or src/experiment.config.ts (which computes TAU2 at load).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../../src');
const ROOTS = [join(SRC, 'lib/figure'), join(SRC, 'components/kit')];
const FORBIDDEN = (file: string) => file.startsWith(join(SRC, 'lib/stats') + '/') || file === join(SRC, 'experiment.config.ts');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Module specifiers of static imports, re-exports and dynamic imports. Type-only imports are kept: a bundler drops them, but a value import must not hide behind them. */
export function specifiers(text: string): string[] {
  const found: string[] = [];
  const patterns = [/\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/g, /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g];
  for (const re of patterns) for (const m of text.matchAll(re)) found.push(m[1]!);
  return found;
}

function resolveSpecifier(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file reachable from `roots`, with the first file that imported it. */
function reachable(roots: string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const queue: Array<[string, string]> = roots.map((r) => [r, '(root)']);
  while (queue.length > 0) {
    const [file, via] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, via);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      const next = resolveSpecifier(file, spec);
      if (next !== null) queue.push([next, file]);
    }
  }
  return seen;
}

describe('specifiers', () => {
  it('reads imports, type imports, re-exports and dynamic imports', () => {
    const text = `
      import a from './a';
      import { b, type C } from "@/b";
      import type { D } from './d';
      import './side-effect';
      export { e } from './e';
      export * from './f';
      const g = import('./g');
      const notAnImport = "from './nope'";
    `;
    expect(specifiers(text)).toEqual(['./a', '@/b', './d', './side-effect', './e', './f', './g']);
  });
});

describe('the kit and the figure logic', () => {
  const graph = reachable(ROOTS.flatMap(filesUnder));

  it('walk a real graph', () => {
    expect(graph.size).toBeGreaterThan(40);
    expect(graph.has(join(SRC, 'experiment.values.ts'))).toBe(true);
  });

  it('never reach the statistics library or the experiment config', () => {
    const hits = [...graph].filter(([file]) => FORBIDDEN(file)).map(([file, via]) => `${relative(SRC, file)} (imported by ${relative(SRC, via)})`);
    expect(hits).toEqual([]);
  });

  it('would notice a forbidden import (the guard itself)', () => {
    const config = join(SRC, 'experiment.config.ts');
    expect(FORBIDDEN(config)).toBe(true);
    expect(reachable([config]).has(join(SRC, 'lib/stats/sequential.ts'))).toBe(true);
  });
});
