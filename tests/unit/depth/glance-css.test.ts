import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The outcome paragraph of a case study is body-sized prose, not a display heading: text-xl,
// text-2xl from md, about 60 characters wide, normal weight.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (selector: string) =>
  [...css.matchAll(new RegExp(`\\n\\s*${selector.replace(/[[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]!);

describe('the glance outcome', () => {
  const [base, wide] = rules('[data-glance-outcome]');
  it('is text-xl with a 60ch measure and normal weight', () => {
    expect(base).toMatch(/font-size:\s*var\(--text-xl\)/);
    expect(base).toMatch(/max-width:\s*60ch/);
    expect(base).toMatch(/font-weight:\s*400/);
  });
  it('is text-2xl from md', () => {
    expect(wide).toMatch(/font-size:\s*var\(--text-2xl\)/);
    expect(wide).not.toMatch(/--text-display/);
  });
});
