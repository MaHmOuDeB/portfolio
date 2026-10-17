import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const read = (rel: string) => {
  const file = path.join(repo, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
};

const css = read('src/styles/tokens.css');
const doc = read('docs/design/tokens.md');

/** Base variable names (with the leading `--`) declared inside the `@theme` block. */
function declaredVariables(): string[] {
  const start = css.indexOf('@theme');
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  const block = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
  const names = new Set<string>();
  for (const match of block.matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)) {
    const name = match[1] ?? '';
    if ((match[2] ?? '').trim() === 'initial') continue;
    // A `--x--y` sub-property (for example `--text-xs--line-height`) documents as `--x`.
    names.add(name.replace(/^(--[^-][\w-]*?)--.*$/, '$1'));
  }
  return [...names];
}

/** Every backticked token in the document; inline code may wrap across a line break. */
const backticked = new Set(
  [...doc.matchAll(/`([^`]+)`/g)].map((m) => (m[1] ?? '').replace(/\s+/g, ' ')),
);

/** The backticked names that document a variable: full, bare, or without the colour/breakpoint prefix. */
function documentedForms(variable: string): string[] {
  const bare = variable.slice(2);
  return [variable, bare, bare.replace(/^color-/, ''), bare.replace(/^breakpoint-/, '')];
}

/** Backticked names in the first column of markdown table rows. */
function firstColumnNames(): string[] {
  const names: string[] = [];
  for (const line of doc.split('\n')) {
    if (!line.startsWith('|')) continue;
    const first = line.split('|')[1]?.trim() ?? '';
    const match = /^`([^`]+)`$/.exec(first);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

describe('tokens.css and docs/design/tokens.md', () => {
  test('both files exist and the theme declares variables', () => {
    expect(css).not.toBe('');
    expect(doc).not.toBe('');
    expect(declaredVariables().length).toBeGreaterThan(40);
  });

  test('every declared variable is documented', () => {
    const missing = declaredVariables().filter(
      (variable) => !documentedForms(variable).some((form) => backticked.has(form)),
    );
    expect(missing).toEqual([]);
  });

  test('every table row name maps to a declared variable', () => {
    const declared = declaredVariables();
    const known = new Set(declared.flatMap(documentedForms));
    const unknown = firstColumnNames().filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
    expect(firstColumnNames().length).toBeGreaterThan(20);
  });

  test('the document carries nothing from the private folder', () => {
    for (const forbidden of ['private/', 'gate2-review', 'DECISIONS']) {
      expect(doc).not.toContain(forbidden);
    }
  });
});
