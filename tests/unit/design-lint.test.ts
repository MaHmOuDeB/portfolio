import { spawnSync } from 'node:child_process';
import { globSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '@tailwindcss/node';
import ts from 'typescript';
import {
  ALLOW_LIST,
  CSS_RULES,
  SOURCE_RULES,
  lintCompiledCss,
  lintSource,
  type RuleId,
} from '../../scripts/design-lint.ts';

const repo = join(import.meta.dirname, '../..');
const FIXTURES = 'tests/fixtures/design-lint';
const SCRIPT = join(repo, 'scripts/design-lint.ts');
const read = (rel: string) => readFileSync(join(repo, rel), 'utf8');

// A fail fixture marks every line that must be reported with an `expect` comment.
const MARKER = /(?:\/\*|\/\/)\s*expect\b/;
const markedLines = (text: string) =>
  text.split('\n').flatMap((line, i) => (MARKER.test(line) ? [i + 1] : []));
const linesOf = (violations: { rule: RuleId; line: number }[], rule: string) =>
  [...new Set(violations.filter((v) => v.rule === rule).map((v) => v.line))].sort((a, b) => a - b);

type Fixture = { rel: string; rule: string; kind: 'pass' | 'fail' };
function fixtures(dir: 'css' | 'src'): Fixture[] {
  return readdirSync(join(repo, FIXTURES, dir))
    .sort()
    .map((name) => {
      const m = /^(.+)\.(pass|fail)\.(css|tsx|mdx)$/.exec(name);
      if (!m) throw new Error(`unexpected fixture name: ${dir}/${name}`);
      return { rel: `${FIXTURES}/${dir}/${name}`, rule: m[1]!, kind: m[2] as 'pass' | 'fail' };
    });
}
const FORMULA = 'sample-size-formula';
const cssFixtures = fixtures('css');
const srcFixtures = fixtures('src').filter((f) => f.rule !== FORMULA);
const formulaFixtures = fixtures('src').filter((f) => f.rule === FORMULA);

describe('rule ids', () => {
  it('lists the eight compiled-CSS rules and the four source rules', () => {
    expect([...CSS_RULES]).toEqual([
      'no-shadow', 'no-caps', 'no-mono', 'no-keyframes', 'no-arbitrary-colour', 'no-fade-up',
      'no-hover-move', 'no-dark',
    ]);
    expect([...SOURCE_RULES]).toEqual(['no-hex', 'no-arrow-in-content', 'no-middle-dot', 'no-emoji']);
  });

  it('has a passing and a failing fixture for every rule, and no fixture for an unknown rule', () => {
    for (const [rules, list] of [
      [CSS_RULES, cssFixtures],
      [SOURCE_RULES, srcFixtures],
    ] as const) {
      for (const rule of rules) {
        expect(list.some((f) => f.rule === rule && f.kind === 'pass'), `${rule} pass`).toBe(true);
        expect(list.some((f) => f.rule === rule && f.kind === 'fail'), `${rule} fail`).toBe(true);
      }
      for (const f of list) expect(rules as readonly string[]).toContain(f.rule);
    }
  });
});

describe('lintCompiledCss fixtures', () => {
  test.each(cssFixtures.filter((f) => f.kind === 'pass'))('$rel has no violations', ({ rel }) => {
    expect(lintCompiledCss(read(rel), rel)).toEqual([]);
  });

  test.each(cssFixtures.filter((f) => f.kind === 'fail'))('$rel reports $rule on every marked line', ({ rel, rule }) => {
    const text = read(rel);
    expect(markedLines(text).length).toBeGreaterThan(0);
    expect(linesOf(lintCompiledCss(text, rel), rule)).toEqual(markedLines(text));
  });
});

describe('lintSource fixtures', () => {
  test.each(srcFixtures.filter((f) => f.kind === 'pass'))('$rel has no violations', ({ rel }) => {
    expect(lintSource(read(rel), rel)).toEqual([]);
  });

  test.each(srcFixtures.filter((f) => f.kind === 'fail'))('$rel reports $rule on every marked line', ({ rel, rule }) => {
    const text = read(rel);
    expect(markedLines(text).length).toBeGreaterThan(0);
    expect(linesOf(lintSource(text, rel), rule)).toEqual(markedLines(text));
  });
});

describe('violations', () => {
  it('name the rule, the file, the line and the offending declaration', () => {
    expect(lintCompiledCss('.a{color:red}\n.uppercase{text-transform:uppercase}', 'out.css')).toEqual([
      { rule: 'no-caps', file: 'out.css', line: 2, excerpt: '.uppercase { text-transform: uppercase }' },
    ]);
    expect(lintSource('export const A = () => <p>Data · 2026</p>;\n', 'src/a.tsx')).toEqual([
      { rule: 'no-middle-dot', file: 'src/a.tsx', line: 1, excerpt: 'export const A = () => <p>Data · 2026</p>;' },
    ]);
  });

  it('read hex only from CSS declaration values in source CSS, never from comments', () => {
    const css = '/* #000 */\n.a {\n  color: #fff;\n  mask: url(#fade);\n}\n';
    expect(lintSource(css, 'src/a.css')).toEqual([
      { rule: 'no-hex', file: 'src/a.css', line: 3, excerpt: 'color: #fff' },
    ]);
  });

  it('never see TypeScript comments', () => {
    expect(lintSource('// → · 🚀\n/* #fff */\nexport const a = 1;\n', 'src/a.ts')).toEqual([]);
  });
});

describe('Tailwind output for tokens.css', () => {
  const tokens = read('src/styles/tokens.css');
  // A fresh compiler per call: build() accumulates candidates.
  const build = async (candidates: string[]) =>
    (await compile(tokens, { base: repo, onDependency() {} })).build(candidates);

  it('is clean for the theme, preflight and the utilities the site uses', async () => {
    const css = await build([
      'focus-visible:ring-2', 'ring-accent', 'bg-transparent', 'bg-bg', 'text-ink', 'font-sans',
      'hover:text-accent', 'hover:underline', 'translate-x-1', 'transition-colors',
      'duration-(--duration-base)', 'motion-reduce:transition-none',
    ]);
    expect(css).toContain('--color-bg');
    expect(lintCompiledCss(css, 'tailwind.css')).toEqual([]);
  });

  test.each<[string, RuleId]>([
    ['uppercase', 'no-caps'],
    ['bg-[#fff]', 'no-arbitrary-colour'],
    ['text-[rgb(0_0_0)]', 'no-arbitrary-colour'],
    ['font-code', 'no-mono'],
    ['hover:scale-105', 'no-hover-move'],
    ['hover:-translate-y-1', 'no-hover-move'],
    ['shadow-[0_1px_2px_black]', 'no-shadow'],
    ['drop-shadow-[0_1px_1px_black]', 'no-shadow'],
    ['text-shadow-[0_1px_0_black]', 'no-shadow'],
    ['inset-shadow-[0_1px_black]', 'no-shadow'],
    ['dark:bg-ink', 'no-dark'],
  ])('%s is reported as %s', async (candidate, rule) => {
    const rules = lintCompiledCss(await build([candidate]), 'tailwind.css').map((v) => v.rule);
    expect(rules).toContain(rule);
  });
});

describe('ALLOW_LIST', () => {
  it('exempts exactly the tokens, the favicon and the formula file, each with a reason', () => {
    expect(Object.fromEntries(Object.entries(ALLOW_LIST).map(([file, { rules }]) => [file, rules]))).toEqual({
      'src/styles/tokens.css': ['no-hex'],
      'src/app/icon.svg': ['no-hex'],
      'src/lib/stats/power.ts': ['no-middle-dot'],
    });
    for (const { reason } of Object.values(ALLOW_LIST)) expect(reason.length).toBeGreaterThan(10);
  });

  it('clears the current power.ts, and only under its own path', () => {
    const text = read('src/lib/stats/power.ts');
    expect(lintSource(text, 'src/lib/stats/power.ts')).toEqual([]);
    expect(lintSource(text, join(repo, 'src/lib/stats/power.ts'))).toEqual([]);
    expect(lintSource(text, 'src/lib/stats/other.ts').map((v) => v.rule)).toContain('no-middle-dot');
  });

  it('clears the hex values in tokens.css, and only under its own path', () => {
    const text = read('src/styles/tokens.css');
    expect(lintSource(text, 'src/styles/tokens.css')).toEqual([]);
    expect(lintSource(text, 'src/styles/other.css').map((v) => v.rule)).toContain('no-hex');
  });
});

// power.ts may use U+00B7 only because SAMPLE_SIZE_FORMULA is always shown inside <code>. This scan
// keeps that true: it returns the lines where the formula is used in JSX outside a <code> element.
function formulaOutsideCode(text: string, file: string): number[] {
  if (file.endsWith('.mdx')) {
    const lines: number[] = [];
    for (const m of text.matchAll(/\{[^}]*\bSAMPLE_SIZE_FORMULA\b[^}]*\}/g)) {
      const before = text.slice(0, m.index);
      const open = (before.match(/<code\b[^>]*>/g) ?? []).length;
      const close = (before.match(/<\/code>/g) ?? []).length;
      if (open <= close) lines.push(before.split('\n').length);
    }
    return lines;
  }
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const lines: number[] = [];
  const visit = (node: ts.Node, inCode: boolean): void => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === 'code') inCode = true;
    if (ts.isIdentifier(node) && node.text === 'SAMPLE_SIZE_FORMULA' && !inCode && ts.findAncestor(node, ts.isJsxExpression)) {
      lines.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
    }
    ts.forEachChild(node, (child) => visit(child, inCode));
  };
  visit(sf, false);
  return lines;
}

describe('SAMPLE_SIZE_FORMULA renders inside <code>', () => {
  test.each(formulaFixtures)('$rel ($kind)', ({ rel, kind }) => {
    const text = read(rel);
    expect(formulaOutsideCode(text, rel)).toEqual(kind === 'pass' ? [] : markedLines(text));
    if (kind === 'fail') expect(markedLines(text).length).toBeGreaterThan(0);
  });

  it('holds for every use under src/ and content/', () => {
    const files = globSync(['src/**/*.{ts,tsx}', 'content/**/*.mdx'], { cwd: repo });
    expect(files.length).toBeGreaterThan(0);
    const outside = files.flatMap((f) => formulaOutsideCode(read(f), f).map((line) => `${f}:${line}`));
    expect(outside).toEqual([]);
  });
});

describe('the CLI', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', SCRIPT, ...args], {
      cwd: repo,
      encoding: 'utf8',
    });

  it('prints "rule file:line excerpt" and exits 1 on a violation', () => {
    const rel = `${FIXTURES}/css/no-caps.fail.css`;
    const r = run('--css', rel);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`no-caps ${rel}:2 .uppercase { text-transform: uppercase }`);
  });

  it('exits 0 on clean compiled CSS', () => {
    const r = run('--css', `${FIXTURES}/css/*.pass.css`);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('exits 0 on the current source tree', () => {
    const r = run('--src');
    expect(r.stdout).not.toMatch(/^no-/m);
    expect(r.status).toBe(0);
  });

  it('exits 1 when the CSS glob matches nothing, so a missing build cannot pass', () => {
    const r = run('--css', 'no-such-dir/**/*.css');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no files match');
  });

  it('exits 1 with usage on no or unknown arguments', () => {
    expect(run().status).toBe(1);
    expect(run('--bogus').status).toBe(1);
  });
});
