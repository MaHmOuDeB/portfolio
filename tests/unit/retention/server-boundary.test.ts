// The vendored exports stay on the server. The Retention data module, the table builders and the
// sourced copy import the export JSON (through @/lib/sources) and the lock file, so a value import of
// any of them from client code would ship the exports to the browser. Islands receive only the rows
// they plot, as props. This walks every module marked 'use client', with every static value import
// and every literal dynamic import it reaches (JSON and other files included), and fails if the walk
// arrives at one of them or at the export files and lock file directly, or meets a local import it
// cannot resolve. A type import is erased by the bundler and is allowed.
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
  // the exports themselves and the lock file, should anything import them directly
  ...readdirSync(join(ROOT, 'data/sources')).filter((n) => n.endsWith('.json')).map((n) => join(ROOT, 'data/sources', n)),
  join(ROOT, 'sources.lock.json'),
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

const isFile = (f: string) => existsSync(f) && statSync(f).isFile();

/** A local file for a local specifier (code, JSON or any other asset), null for a package; throws if a local one does not resolve. */
function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const c of [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map((e) => base + e), join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (isFile(c)) return c;
  }
  throw new Error(`cannot resolve ${spec} from ${relative(ROOT, from)}`);
}

const isCode = (f: string) => /\.(tsx?|jsx?|mjs)$/.test(f);

/**
 * Every file reached from `roots` (modules, and the JSON or other files they import, as leaves),
 * with the module that first imported it, and the local imports that did not resolve.
 */
function walk(roots: readonly string[]): { seen: Map<string, string>; unresolved: string[] } {
  const seen = new Map<string, string>();
  const unresolved: string[] = [];
  const queue: [string, string][] = roots.map((r) => [r, '(root)']);
  while (queue.length > 0) {
    const [file, via] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, via);
    if (!isCode(file)) continue;
    for (const spec of valueSpecifiers(parse(file))) {
      try {
        const next = resolveSpec(file, spec);
        if (next !== null) queue.push([next, file]);
      } catch (e) {
        unresolved.push((e as Error).message);
      }
    }
  }
  return { seen, unresolved };
}

const clientModules = sourceFiles(SRC).filter((f) => isClient(parse(f)));

describe('the walk follows what a bundler would include', () => {
  it('resolves a JSON import to the file, so the exports themselves are checked', () => {
    expect(resolveSpec(join(SRC, 'components/retention/X.tsx'), '../../../data/sources/retail.json')).toBe(join(ROOT, 'data/sources/retail.json'));
    expect(resolveSpec(join(SRC, 'lib/retention/data.ts'), '../../../sources.lock.json')).toBe(join(ROOT, 'sources.lock.json'));
  });

  it('forbids the vendored exports and the lock file too', () => {
    for (const f of [...readdirSync(join(ROOT, 'data/sources')).filter((n) => n.endsWith('.json')).map((n) => join(ROOT, 'data/sources', n)), join(ROOT, 'sources.lock.json')]) {
      expect(SERVER_ONLY, relative(ROOT, f)).toContain(f);
    }
  });

  it('fails on a local import it cannot resolve instead of skipping it', () => {
    expect(walk(clientModules).unresolved).toEqual([]);
    expect(() => resolveSpec(join(SRC, 'components/retention/X.tsx'), './Missing')).toThrow(/cannot resolve/);
    expect(() => resolveSpec(join(SRC, 'components/retention/X.tsx'), '@/lib/nope')).toThrow(/cannot resolve/);
  });
});

describe('the Retention sources stay on the server', () => {
  it('no client module reaches the data module, the tables, the source loader or the sourced copy', () => {
    const { seen: reached, unresolved } = walk(clientModules);
    expect(unresolved).toEqual([]);
    const leaks = SERVER_ONLY.filter((f) => reached.has(f)).map((f) => `${relative(ROOT, f)} (imported by ${relative(ROOT, reached.get(f)!)})`);
    expect(leaks).toEqual([]);
  });

  it('the walk is real: it covers the returns island, and a server module does reach the sources', () => {
    expect(clientModules.map((f) => relative(ROOT, f))).toEqual(
      expect.arrayContaining(['src/components/retention/ReturnsFigureClient.tsx', 'src/components/retention/ReturnsInteractive.tsx']),
    );
    expect(walk(clientModules).seen.has(join(SRC, 'lib/retention/returns.ts'))).toBe(true);
    const server = walk([join(SRC, 'components/retention/ReturnsFigure.tsx')]).seen;
    expect(server.has(join(SRC, 'lib/sources/index.ts'))).toBe(true);
    // JSON files are followed as leaves: the server side does reach the export itself
    expect(server.has(join(ROOT, 'data/sources/retail.json'))).toBe(true);
  });
});
