import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from '../../../src/lib/facts/types.ts';

const root = join(import.meta.dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('the facts contract', () => {
  it('src/lib/facts/types.ts equals the frozen text byte for byte', () => {
    const actual = readFileSync(join(root, 'src/lib/facts/types.ts'), 'utf8');
    const frozen = readFileSync(join(root, 'tests/fixtures/facts/types.ts.txt'), 'utf8');
    expect(actual).toBe(frozen);
  });

  it('lists the four source ids', () => {
    expect(SOURCE_IDS).toEqual(['retention', 'retail', 'weather', 'pulse']);
  });

  it('keeps one Fact component and one data-fact attribute, both in src/components/kit/Fact.tsx', () => {
    const offenders = sourceFiles(join(root, 'src'))
      .map((path) => relative(root, path))
      .filter((path) => path !== 'src/components/kit/Fact.tsx' && path !== 'src/lib/facts/facts.generated.ts')
      .filter((path) => {
        const text = readFileSync(join(root, path), 'utf8');
        return /data-fact/.test(text) || /(function|const|class)\s+Fact\b/.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
