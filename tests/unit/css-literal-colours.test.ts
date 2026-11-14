import fs from 'node:fs';
import path from 'node:path';

// Tailwind 4 writes a static hex fallback for every color-mix(), and its minifier turns `black` and
// `transparent` inside a gradient into hex, so the built CSS would hold a literal outside the theme
// (the design lint's no-arbitrary-colour rule). This reads the source, which is quicker than a build:
// globals.css may only reach a colour through var(--color-*). It does not read other CSS files, a
// Tailwind class written in a component, or the compiled output; the design lint on the build does.
const repo = path.resolve(import.meta.dirname, '../..');
const source = fs
  .readFileSync(path.join(repo, 'src/app/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')) // comments, keeping line numbers
  .replace(/url\([^)]*\)/gi, 'url()');

/** Every declaration value in the file with its line: text between a property colon and `;` or `}`. */
function declarations(): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = [];
  for (const m of source.matchAll(/(?:^|[;{}\n])\s*(-{0,2}[a-z][\w-]*)\s*:\s*([^;{}]+)(?=[;}])/gi)) {
    const upTo = source.slice(0, m.index! + m[0].length - m[2]!.length);
    found.push({ line: upTo.split('\n').length, value: m[2]! });
  }
  return found;
}

const LITERALS: readonly [string, RegExp][] = [
  ['color-mix()', /color-mix\(/i],
  ['rgb()', /\brgba?\(/i],
  ['hsl()', /\bhsla?\(/i],
  ['a hex colour', /#[0-9a-f]{3,8}\b/i],
  ['black or white', /(?<![\w-])(?:black|white)(?![\w-])/i],
];

describe('globals.css holds no literal colour', () => {
  const decls = declarations();

  test('the scan finds declarations', () => {
    expect(decls.length).toBeGreaterThan(100);
  });

  test.each(LITERALS)('no declaration value uses %s', (_name, pattern) => {
    const hits = decls.filter((d) => pattern.test(d.value)).map((d) => `${d.line}: ${d.value.trim()}`);
    expect(hits).toEqual([]);
  });

  test('no gradient names transparent (the minifier writes it as hex)', () => {
    const hits = decls
      .filter((d) => /gradient\([^;]*(?<![\w-])transparent(?![\w-])/i.test(d.value))
      .map((d) => `${d.line}: ${d.value.trim()}`);
    expect(hits).toEqual([]);
  });
});
