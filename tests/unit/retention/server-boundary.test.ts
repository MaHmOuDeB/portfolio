// The vendored exports stay on the server. The Retention data module, the table builders and the
// sourced copy import the export JSON (through @/lib/sources) and the lock file, so a value import of
// any of them from client code would ship the exports to the browser. Islands receive only the rows
// they plot, as props. This walks every module marked 'use client', with every static value import
// and every literal dynamic import it reaches, and fails if the walk arrives at one of them. A type
// import is erased by the bundler and is allowed.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');
const SRC = join(ROOT, 'src');
const SERVER_ONLY = [
  join(SRC, 'lib/retention/data.ts'),
  join(SRC, 'lib/retention/tables.ts'),
  join(SRC, 'lib/sources/index.ts'),
  join(ROOT, 'content/retention.tsx'),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

const isClient = (sf: ts.SourceFile) => {
  const first = sf.statements[0];
  return first !== undefined && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client';
};

/** Value imports, value re-exports and literal dynamic imports. */
function valueSpecifiers(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && !st.importClause?.isTypeOnly) {
      const nb = st.importClause?.namedBindings;
      const allTypes = !st.importClause?.name && nb !== undefined && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly);
      if (!allTypes) out.push((st.moduleSpecifier as ts.StringLiteral).text);
    }
    if (ts.isExportDeclaration(st) && !st.isTypeOnly && st.moduleSpecifier) out.push((st.moduleSpecifier as ts.StringLiteral).text);
  }
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile() && /\.(tsx?|jsx?)$/.test(c)) return c;
  }
  return null;
}

/** Every module reached from `roots`, with the module that first imported it. */
function walk(roots: readonly string[]): Map<string, string> {
  const seen = new Map<string, string>();
  const queue: [string, string][] = roots.map((r) => [r, '(root)']);
  while (queue.length > 0) {
    const [file, via] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, via);
    for (const spec of valueSpecifiers(parse(file))) {
      const next = resolveSpec(file, spec);
      if (next !== null) queue.push([next, file]);
    }
  }
  return seen;
}

const clientModules = sourceFiles(SRC).filter((f) => isClient(parse(f)));

describe('the Retention sources stay on the server', () => {
  it('no client module reaches the data module, the tables, the source loader or the sourced copy', () => {
    const reached = walk(clientModules);
    const leaks = SERVER_ONLY.filter((f) => reached.has(f)).map((f) => `${relative(ROOT, f)} (imported by ${relative(ROOT, reached.get(f)!)})`);
    expect(leaks).toEqual([]);
  });

  it('the walk is real: it covers the returns island, and a server module does reach the sources', () => {
    expect(clientModules.map((f) => relative(ROOT, f))).toEqual(
      expect.arrayContaining(['src/components/retention/ReturnsFigureClient.tsx', 'src/components/retention/ReturnsInteractive.tsx']),
    );
    expect(walk(clientModules).has(join(SRC, 'lib/retention/returns.ts'))).toBe(true);
    expect(walk([join(SRC, 'components/retention/ReturnsFigure.tsx')]).has(join(SRC, 'lib/sources/index.ts'))).toBe(true);
  });
});
