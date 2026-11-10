// The planner's client file and the loader are bundled with the page. Their static imports, followed
// through every file they reach, must never arrive at the statistics library: the island that does
// (PlannerInteractive) is only reached through a dynamic import, which this walk does not follow.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(import.meta.dirname, '../../../src');
const ROOTS = [join(SRC, 'components/figures/PlannerFigureClient.tsx'), join(SRC, 'components/figures/EagerOrIntent.tsx')];
const STATS = join(SRC, 'lib/stats') + '/';

/** Static value imports and re-exports only: `import type` is erased by the bundler, and a dynamic import() is a separate chunk. */
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
  return null;
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

describe('the planner code the page loads at once', () => {
  it('reaches no statistics code through static imports', () => {
    const seen = reachable(ROOTS);
    const leaks = [...seen].filter(([file]) => file.startsWith(STATS)).map(([file, via]) => `${file} (imported by ${via})`);
    expect(leaks).toEqual([]);
    // the walk is real: it reaches the planner values and the loader's own files
    expect([...seen.keys()].some((f) => f.endsWith('lib/lab/planner-values.ts'))).toBe(true);
  });

  it('would catch a leak: the statistics side of the planner does reach the statistics', () => {
    const seen = reachable([join(SRC, 'lib/lab/planner.ts')]);
    expect([...seen.keys()].some((f) => f.startsWith(STATS))).toBe(true);
  });

  it('does not follow the dynamic import of the island', () => {
    const seen = reachable(ROOTS);
    expect([...seen.keys()].some((f) => f.endsWith('PlannerInteractive.tsx'))).toBe(false);
  });
});
