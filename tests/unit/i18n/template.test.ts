import { describe, expect, it } from 'vitest';
import { fill, type Template } from '@/lib/i18n/template';

describe('fill', () => {
  it('replaces every placeholder, repeats included', () => {
    const t = '{n} of {total}, {n} again' as Template<'n' | 'total'>;
    expect(fill(t, { n: '3', total: '5' })).toBe('3 of 5, 3 again');
  });

  it('leaves text without placeholders alone', () => {
    expect(fill('plain' as Template<never>, {})).toBe('plain');
  });

  it('does not re-expand a value that holds braces', () => {
    const t = '{a} {b}' as Template<'a' | 'b'>;
    expect(fill(t, { a: '{b}', b: 'x' })).toBe('{b} x');
  });

  it('throws on a missing value, naming it', () => {
    const t = '{n} of {total}' as Template<'n' | 'total'>;
    expect(() => fill(t, { n: '3' } as never)).toThrow(/total/);
  });
});
