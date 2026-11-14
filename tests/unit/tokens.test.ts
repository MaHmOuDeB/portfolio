import fs from 'node:fs';
import path from 'node:path';
import { compile } from '@tailwindcss/node';

const repo = path.resolve(import.meta.dirname, '../..');
const tokensPath = path.join(repo, 'src/styles/tokens.css');

const MUST_GENERATE = [
  'font-semibold', 'font-medium', 'font-regular', 'font-sans', 'bg-ink', 'fill-series-2',
  'stroke-series-1', 'text-sm', 'text-xl', 'text-readout', 'text-readout-sm', 'text-display',
  'text-display-sm', 'max-w-text', 'max-w-figure', 'max-w-page', 'rounded-sm', 'rounded-md',
  'py-section', 'min-h-(--size-target)', 'h-(--size-target)', 'top-(--header-h)',
  'z-(--z-header)', 'ease-standard', 'duration-(--duration-base)', 'transition-colors',
  'max-xs:flex-col', 'md:sticky', 'tabular-nums',
];

const MUST_NOT_GENERATE = [
  'bg-blue-500', 'text-white', 'shadow-md', 'font-bold', 'font-normal', 'font-mono', 'text-5xl',
  'rounded-2xl', 'rounded-lg', 'tracking-widest', 'animate-bounce', 'drop-shadow-md',
  'inset-shadow-sm', 'text-shadow-md', 'duration-fast', 'font-display', 'tabular',
];

const source = fs.existsSync(tokensPath) ? fs.readFileSync(tokensPath, 'utf8') : '';

// A fresh compiler per call: build() accumulates candidates, so reuse would hide a missing utility.
async function css(candidates: string[]): Promise<string> {
  const compiler = await compile(source, { base: repo, onDependency() {} });
  return compiler.build(candidates);
}

describe('tokens.css in Tailwind', () => {
  let baseline = '';

  beforeAll(async () => {
    baseline = await css([]);
    // A negative check only means something when the theme actually compiled.
    expect(baseline).toContain('--color-bg');
  });

  test('the file exists', () => {
    expect(source).not.toBe('');
  });

  test.each(MUST_GENERATE)('%s generates CSS', async (candidate) => {
    expect(await css([candidate])).not.toBe(baseline);
  });

  test.each(MUST_NOT_GENERATE)('%s generates nothing', async (candidate) => {
    expect(await css([candidate])).toBe(baseline);
  });

  test('--font-sans points at the next/font variable with system fallbacks', () => {
    expect(baseline).toContain(
      '--font-sans: var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif;',
    );
  });

  test('@theme static emits --color-series-2 with no utility in use', () => {
    expect(baseline).toContain('--color-series-2: #d9620a;');
  });
});
