// The fault seam guard. An interactive Figure takes one optional test prop, `faultAfterChange`,
// that makes its chart throw after a change so the browser specs can test the error fallback. It
// must never be switched on in anything the production build can reach. This guard reads the
// source with the TypeScript parser, walks the local module graph from every production root, and
// fails closed on anything it cannot follow.
//
// - Roots: the App Router's special files under src/app (page, layout, route, global-not-found, the
//   metadata files and the rest) with an extension of the plain build's pageExtensions (never
//   `.dev.tsx`), plus proxy, middleware, instrumentation(-client) and mdx-components, in src/ or at
//   the repository root, when present.
// - Edges: static imports and re-exports, literal `import()` and `require()`; `lazy(() => import())`
//   and `next/dynamic` bind to the module's default export. A local import that does not resolve,
//   a non-literal `import()` or `require()`, or an asset that does not exist fails.
// - Affected components: every top-level component that destructures `faultAfterChange` from its
//   props, and, to a fixed point, every component that passes its own props on to one by spread.
// - Inside a component, its received seam is used only as itself: forwarded as
//   `faultAfterChange={faultAfterChange}`, or as a condition that stays in the component (an `if`
//   test, or a JSX child's ternary, `&&` or `||`). Passing it on under another name, or storing,
//   returning or handing it to a call, fails, and an attribute that received it is then checked at
//   every other call site too.
// - A spread onto a tag whose identity cannot be followed (a local variable or parameter) fails
//   unless it is the component's own props. Namespace imports and `export * as` re-exports resolve.
// - A bare specifier must be a Node built-in or an installed package: another alias fails closed.
// - At every JSX call site in a reachable module, `faultAfterChange` may only be the component's
//   own received prop, forwarded unchanged under the same name: `faultAfterChange={faultAfterChange}`
//   bound to its own destructured parameter with no default, or `{...props}` of its own unreassigned
//   parameter with no later attribute or spread. Anything else fails: a bare attribute, `true`, a
//   parenthesised or asserted value, another identifier, a renamed or defaulted binding, an object
//   literal holding the seam, a spread of anything else onto an affected component, a property read
//   of the seam, `createElement` or a direct call of an affected component, or an affected
//   component used as a value (its identity could no longer be followed).
// The fixtures are in-memory sources served by a custom ts.CompilerHost, so typecheck and lint never
// read them.
//
// Known limits. The guard is written against honest mistakes that would ship the test-only switch
// to production: a renamed prop, a forward to a component that drops or rereads it, a condition that
// renders something other than a throwing leaf. It is a name-based static check, so it is not complete
// against deliberately obfuscated code: reflection over props, side effects hidden inside expressions
// or a component that throws on a prop never taken from the seam are out of its scope. The second
// layer is the build-output scan (fault-seam-build.test.ts), which fails if a plain build switches
// the seam on in any form a bundler or the server renderer writes it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, posix, relative, resolve } from 'node:path';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const SEAM = 'faultAfterChange';
const REPO = resolve(import.meta.dirname, '../../..');

// ---------------------------------------------------------------------------------------------
// Hosts: the real repository, or in-memory fixtures. Both are ts.CompilerHost plus a file lister.

type SeamHost = ts.CompilerHost & { listFiles(dir: string): string[] };

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function baseHost(read: (f: string) => string | undefined, exists: (f: string) => boolean, list: (d: string) => string[]): SeamHost {
  return {
    getSourceFile: (fileName, languageVersion) => {
      const text = read(fileName);
      return text === undefined ? undefined : ts.createSourceFile(fileName, text, languageVersion, true, scriptKind(fileName));
    },
    getDefaultLibFileName: () => 'lib.d.ts',
    writeFile: () => {
      throw new Error('the fault seam guard never writes');
    },
    getCurrentDirectory: () => '/',
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: exists,
    readFile: read,
    listFiles: list,
  };
}

function diskHost(): SeamHost {
  const isFile = (f: string) => existsSync(f) && statSync(f).isFile();
  const list = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(dir, e.name)) : [join(dir, e.name)]))
      : [];
  const host = baseHost((f) => (isFile(f) ? readFileSync(f, 'utf8') : undefined), isFile, list);
  // The repository is analysed several times: parse each file once.
  const parsed = new Map<string, ts.SourceFile | undefined>();
  const parse = host.getSourceFile;
  host.getSourceFile = (f, v) => {
    if (!parsed.has(f)) parsed.set(f, parse(f, v));
    return parsed.get(f);
  };
  return host;
}
const DISK = diskHost();

const FIXTURE_ROOT = '/repo';

function memoryHost(files: Record<string, string>): SeamHost {
  const map = new Map(Object.entries(files).map(([p, t]) => [posix.join(FIXTURE_ROOT, p), t]));
  return baseHost(
    (f) => map.get(f),
    (f) => map.has(f),
    (dir) => [...map.keys()].filter((f) => f.startsWith(`${dir}/`)),
  );
}

// ---------------------------------------------------------------------------------------------
// Module records.

type Rule =
  | 'unresolved-import'
  | 'dynamic-import'
  | 'activation'
  | 'renamed-seam'
  | 'seam-default'
  | 'seam-read'
  | 'seam-object'
  | 'seam-reassigned'
  | 'seam-escape'
  | 'unsafe-spread'
  | 'create-element'
  | 'direct-call'
  | 'component-as-value'
  | 'unestablished-identity';

type Violation = { file: string; line: number; rule: Rule; detail: string };

type Binding =
  | { kind: 'import'; module: string | null; name: string }
  | { kind: 'namespace'; module: string | null }
  | { kind: 'local'; node: ts.Node };

type Export =
  | { kind: 'local'; name: string }
  | { kind: 'reexport'; module: string | null; name: string }
  | { kind: 'node'; node: ts.Node };

type Module = {
  file: string;
  sf: ts.SourceFile;
  bindings: Map<string, Binding>;
  exports: Map<string, Export>;
  stars: (string | null)[];
  deps: string[];
  /** Calls whose argument is a literal import(): the module they load and whether the form binds its default export. */
  lazies: { node: ts.CallExpression; module: string; canonical: boolean }[];
};

type Resolved = { kind: 'external' } | { kind: 'code'; file: string } | { kind: 'leaf'; file: string } | { kind: 'missing' };

const CODE_EXT = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];
const LEAF = /\.(css|scss|sass|json|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico|txt)$/i;
const SPECIAL = ['page', 'layout', 'template', 'error', 'global-error', 'not-found', 'global-not-found', 'forbidden', 'unauthorized', 'loading', 'default', 'route', 'sitemap', 'robots', 'manifest'];
const NUMBERED_METADATA = ['icon', 'apple-icon', 'opengraph-image', 'twitter-image'];
const EXTRA_ROOTS = ['proxy', 'middleware', 'instrumentation', 'instrumentation-client', 'mdx-components'];

const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

function unwrap(e: ts.Expression): ts.Expression {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x)) x = x.expression;
  return x;
}

const literalText = (e: ts.Node | undefined): string | null =>
  e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) ? e.text : null;

function inTypePosition(n: ts.Node): boolean {
  for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isHeritageClause(p)) return true;
    if (ts.isStatement(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

const hasModifier = (n: ts.Node, kind: ts.SyntaxKind) => ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind);

// ---------------------------------------------------------------------------------------------
// The analysis.

type Analysis = { roots: string[]; reachable: string[]; affected: string[]; violations: Violation[] };

export function analyse(host: SeamHost, root: string, pageExtensions: readonly string[], extraRoots: readonly string[] = []): Analysis {
  const violations: Violation[] = [];
  const modules = new Map<string, Module>();
  const rel = (f: string) => relative(root, f).split('\\').join('/');
  const report = (node: ts.Node, rule: Rule, detail: string) => {
    const sf = node.getSourceFile();
    violations.push({ file: rel(sf.fileName), line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, rule, detail });
  };

  function resolveSpec(from: string, spec: string): Resolved {
    let base: string;
    if (spec.startsWith('@/')) base = posix.join(root, 'src', spec.slice(2));
    else if (spec.startsWith('.')) base = posix.join(posix.dirname(from), spec);
    else if (spec.startsWith('/')) base = spec;
    else {
      // A bare specifier is a package only if it is a Node built-in or installed; anything else
      // (another alias, a typo) might be local, so it fails closed.
      const first = spec.split('/')[0]!;
      if (spec.startsWith('node:') || builtinModules.includes(first)) return { kind: 'external' };
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : first;
      return host.fileExists(posix.join(root, 'node_modules', pkg, 'package.json')) ? { kind: 'external' } : { kind: 'missing' };
    }
    if (LEAF.test(base)) return host.fileExists(base) ? { kind: 'leaf', file: base } : { kind: 'missing' };
    if (CODE_EXT.some((e) => base.endsWith(e))) return host.fileExists(base) ? { kind: 'code', file: base } : { kind: 'missing' };
    for (const c of [...CODE_EXT.map((e) => base + e), ...CODE_EXT.map((e) => posix.join(base, `index${e}`))]) {
      if (host.fileExists(c)) return { kind: 'code', file: c };
    }
    return { kind: 'missing' };
  }

  function parse(file: string): Module {
    const sf = host.getSourceFile(file, ts.ScriptTarget.Latest);
    if (!sf) throw new Error(`cannot read ${file}`);
    const m: Module = { file, sf, bindings: new Map(), exports: new Map(), stars: [], deps: [], lazies: [] };
    const edge = (node: ts.Node, spec: string): string | null => {
      const r = resolveSpec(file, spec);
      if (r.kind === 'missing') {
        report(node, 'unresolved-import', spec);
        return null;
      }
      if (r.kind === 'code') {
        m.deps.push(r.file);
        return r.file;
      }
      return null;
    };
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st)) {
        const spec = literalText(st.moduleSpecifier)!;
        if (st.importClause?.isTypeOnly) continue;
        const target = edge(st, spec);
        const clause = st.importClause;
        if (!clause) continue;
        if (clause.name) m.bindings.set(clause.name.text, { kind: 'import', module: target, name: 'default' });
        const nb = clause.namedBindings;
        if (nb && ts.isNamespaceImport(nb)) m.bindings.set(nb.name.text, { kind: 'namespace', module: target });
        if (nb && ts.isNamedImports(nb)) {
          for (const el of nb.elements) {
            if (!el.isTypeOnly) m.bindings.set(el.name.text, { kind: 'import', module: target, name: (el.propertyName ?? el.name).text });
          }
        }
      } else if (ts.isExportDeclaration(st)) {
        if (st.isTypeOnly) continue;
        const spec = literalText(st.moduleSpecifier);
        const target = spec === null ? null : edge(st, spec);
        const clause = st.exportClause;
        if (spec !== null && !clause) m.stars.push(target);
        else if (clause && ts.isNamespaceExport(clause)) m.exports.set(clause.name.text, { kind: 'reexport', module: target, name: '*' });
        else if (clause && ts.isNamedExports(clause)) {
          for (const el of clause.elements) {
            if (el.isTypeOnly) continue;
            const from = (el.propertyName ?? el.name).text;
            m.exports.set(el.name.text, spec === null ? { kind: 'local', name: from } : { kind: 'reexport', module: target, name: from });
          }
        }
      } else if (ts.isExportAssignment(st)) {
        const e = unwrap(st.expression);
        m.exports.set('default', ts.isIdentifier(e) ? { kind: 'local', name: e.text } : { kind: 'node', node: e });
      } else if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) {
        if (st.name) m.bindings.set(st.name.text, { kind: 'local', node: st });
        if (hasModifier(st, ts.SyntaxKind.ExportKeyword)) {
          const key = hasModifier(st, ts.SyntaxKind.DefaultKeyword) ? 'default' : st.name!.text;
          m.exports.set(key, st.name ? { kind: 'local', name: st.name.text } : { kind: 'node', node: st });
        }
      } else if (ts.isVariableStatement(st)) {
        const exported = hasModifier(st, ts.SyntaxKind.ExportKeyword);
        for (const d of st.declarationList.declarations) {
          for (const name of boundNames(d.name)) {
            m.bindings.set(name, { kind: 'local', node: d });
            if (exported) m.exports.set(name, { kind: 'local', name });
          }
        }
      } else if (ts.isImportEqualsDeclaration(st) && ts.isExternalModuleReference(st.moduleReference)) {
        const spec = literalText(st.moduleReference.expression);
        if (spec === null) report(st, 'dynamic-import', 'import = require() with a non-literal specifier');
        else m.bindings.set(st.name.text, { kind: 'namespace', module: edge(st, spec) });
      } else if ((ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st)) && ts.isIdentifier(st.name)) {
        m.bindings.set(st.name.text, { kind: 'local', node: st });
      }
    }
    // Dynamic imports and require() anywhere in the module.
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const isImport = n.expression.kind === ts.SyntaxKind.ImportKeyword;
        const isRequire = ts.isIdentifier(n.expression) && n.expression.text === 'require';
        if (isImport || isRequire) {
          const spec = literalText(n.arguments[0]);
          if (spec === null) report(n, 'dynamic-import', `${isImport ? 'import()' : 'require()'} with a non-literal specifier`);
          else {
            const target = edge(n, spec);
            if (target !== null && isImport) m.lazies.push({ node: n, module: target, canonical: canonicalLazy(n) });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return m;
  }

  /** `lazy(() => import('x'))` or `dynamic(() => import('x'), options?)`, the import being the call's whole callback body. */
  function canonicalLazy(imp: ts.CallExpression): boolean {
    let body: ts.Node = imp;
    while (ts.isParenthesizedExpression(body.parent)) body = body.parent;
    const arrow = body.parent;
    if (!arrow || !ts.isArrowFunction(arrow) || arrow.body !== body || arrow.parameters.length > 0) return false;
    let callee: ts.Node = arrow;
    while (ts.isParenthesizedExpression(callee.parent)) callee = callee.parent;
    const call = callee.parent;
    if (!call || !ts.isCallExpression(call) || call.arguments[0] !== callee) return false;
    const fn = call.expression;
    const name = ts.isIdentifier(fn) ? fn.text : ts.isPropertyAccessExpression(fn) ? fn.name.text : '';
    return name === 'lazy' || name === 'dynamic';
  }

  function boundNames(name: ts.BindingName): string[] {
    if (ts.isIdentifier(name)) return [name.text];
    return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : boundNames(el.name)));
  }

  // --- Graph walk.
  const pageExt = new Set(pageExtensions);
  const special = new RegExp(`^(?:${SPECIAL.join('|')}|(?:${NUMBERED_METADATA.join('|')})\\d*)\\.(.+)$`);
  const roots = host
    .listFiles(posix.join(root, 'src/app'))
    .filter((f) => {
      const match = special.exec(posix.basename(f));
      return match !== null && pageExt.has(match[1]!);
    });
  for (const name of EXTRA_ROOTS) {
    for (const dir of ['src', '.']) {
      for (const ext of ['ts', 'js', 'tsx', 'jsx']) {
        const f = posix.join(root, dir, `${name}.${ext}`);
        if (host.fileExists(f)) roots.push(f);
      }
    }
  }
  roots.push(...extraRoots.map((f) => posix.join(root, f)));
  const queue = [...roots];
  while (queue.length > 0) {
    const f = queue.shift()!;
    if (modules.has(f)) continue;
    const m = parse(f);
    modules.set(f, m);
    queue.push(...m.deps);
  }

  // --- Identity: a component is `${file}#${local name}`.
  type Id = string;
  function exportId(module: string | null, name: string, seen: Set<string>): Id | null {
    if (module === null) return null;
    const m = modules.get(module);
    if (!m) return null;
    const key = `${module}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const e = m.exports.get(name);
    if (e?.kind === 'local') return localId(m, e.name, seen);
    if (e?.kind === 'reexport') return e.name === '*' ? null : exportId(e.module, e.name, seen);
    if (e?.kind === 'node') return `${module}#default`;
    if (name !== 'default') {
      for (const star of m.stars) {
        const r = exportId(star, name, seen);
        if (r !== null) return r;
      }
    }
    return null;
  }
  function localId(m: Module, name: string, seen = new Set<string>()): Id | null {
    const b = m.bindings.get(name);
    if (!b) return null;
    if (b.kind === 'import') return exportId(b.module, b.name, seen);
    if (b.kind === 'namespace') return null;
    if (ts.isVariableDeclaration(b.node) && ts.isIdentifier(b.node.name) && b.node.initializer) {
      const init = unwrap(b.node.initializer);
      if (ts.isIdentifier(init) && init.text !== name) return localId(m, init.text, seen);
      const lazy = m.lazies.find((l) => l.canonical && isWithin(l.node, init) && init.pos <= l.node.pos);
      if (lazy && ts.isCallExpression(init)) return exportId(lazy.module, 'default', seen);
    }
    return `${m.file}#${name}`;
  }
  const isWithin = (inner: ts.Node, outer: ts.Node) => inner.pos >= outer.pos && inner.end <= outer.end;

  /**
   * The module a namespace name stands for: an `import * as NS`, or a name that resolves through
   * imports and re-exports to an `export * as NS`. Null for an external package's namespace,
   * undefined when the name is not a namespace.
   */
  function exportNamespace(module: string | null, name: string, seen: Set<string>): string | null | undefined {
    if (module === null) return undefined;
    const m = modules.get(module);
    if (!m) return undefined;
    const key = `${module}#${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const e = m.exports.get(name);
    if (e?.kind === 'reexport') return e.name === '*' ? e.module : exportNamespace(e.module, e.name, seen);
    if (e?.kind === 'local') return namespaceBinding(m, e.name, seen);
    if (name !== 'default') {
      for (const star of m.stars) {
        const r = exportNamespace(star, name, seen);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  }
  function namespaceBinding(m: Module, name: string, seen = new Set<string>()): string | null | undefined {
    const b = m.bindings.get(name);
    if (b?.kind === 'namespace') return b.module;
    if (b?.kind === 'import') return exportNamespace(b.module, b.name, seen);
    return undefined;
  }

  /** The function a component identity names, if it is one. */
  function componentNode(id: Id): ts.FunctionLikeDeclaration | null {
    const [file, name] = [id.slice(0, id.lastIndexOf('#')), id.slice(id.lastIndexOf('#') + 1)];
    const m = modules.get(file);
    if (!m) return null;
    let node: ts.Node | undefined;
    if (name === 'default' && m.exports.get('default')?.kind === 'node') node = (m.exports.get('default') as { node: ts.Node }).node;
    else {
      const b = m.bindings.get(name);
      node = b?.kind === 'local' ? b.node : undefined;
    }
    if (node && ts.isVariableDeclaration(node) && node.initializer) node = unwrap(node.initializer);
    return node && isFunctionLike(node) ? node : null;
  }

  // --- Lexical scope.
  function declaredIn(scope: ts.Node, name: string): ts.Node | undefined {
    const inBinding = (bn: ts.BindingName, owner: ts.Node): ts.Node | undefined => {
      if (ts.isIdentifier(bn)) return bn.text === name ? owner : undefined;
      for (const el of bn.elements) {
        if (ts.isOmittedExpression(el)) continue;
        const found = inBinding(el.name, ts.isIdentifier(el.name) ? el : owner);
        if (found) return found;
      }
      return undefined;
    };
    if (isFunctionLike(scope)) {
      for (const p of scope.parameters) {
        const found = inBinding(p.name, p);
        if (found) return found;
      }
      if (ts.isFunctionExpression(scope) && scope.name?.text === name) return scope;
      if (scope.body && ts.isBlock(scope.body)) {
        let hoisted: ts.Node | undefined;
        const walk = (n: ts.Node): void => {
          if (hoisted || isFunctionLike(n)) return;
          if (ts.isVariableDeclarationList(n) && !(n.flags & ts.NodeFlags.BlockScoped)) {
            for (const d of n.declarations) hoisted ??= inBinding(d.name, d);
          }
          ts.forEachChild(n, walk);
        };
        ts.forEachChild(scope.body, walk);
        if (hoisted) return hoisted;
      }
      return undefined;
    }
    const statements = ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope)
      ? scope.statements
      : ts.isCaseBlock(scope)
        ? scope.clauses.flatMap((c) => [...c.statements])
        : undefined;
    if (statements) {
      for (const st of statements) {
        if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) {
          const found = inBinding(d.name, d);
          if (found) return found;
        }
        if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name?.text === name) return st;
        if (ts.isSourceFile(scope) && ts.isImportDeclaration(st) && st.importClause) {
          const c = st.importClause;
          if (c.name?.text === name) return c;
          const nb = c.namedBindings;
          if (nb && ts.isNamespaceImport(nb) && nb.name.text === name) return nb;
          if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) if (el.name.text === name) return el;
        }
        if (ts.isSourceFile(scope) && ts.isImportEqualsDeclaration(st) && st.name.text === name) return st;
      }
      return undefined;
    }
    if (ts.isCatchClause(scope) && scope.variableDeclaration) return inBinding(scope.variableDeclaration.name, scope.variableDeclaration);
    if ((ts.isForStatement(scope) || ts.isForInStatement(scope) || ts.isForOfStatement(scope)) && scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
      for (const d of scope.initializer.declarations) {
        const found = inBinding(d.name, d);
        if (found) return found;
      }
    }
    if (ts.isClassExpression(scope) && scope.name?.text === name) return scope;
    return undefined;
  }
  /** The declaration an identifier refers to, the scope that holds it, or undefined for a global. */
  function lookup(id: ts.Identifier): { decl: ts.Node; scope: ts.Node } | undefined {
    for (let s: ts.Node | undefined = id.parent; s; s = s.parent) {
      const decl = declaredIn(s, id.text);
      if (decl) return { decl, scope: s };
    }
    return undefined;
  }
  const isTopLevel = (r: { scope: ts.Node } | undefined) => r !== undefined && ts.isSourceFile(r.scope);

  /** The identity an expression names (a JSX tag or a value), 'dynamic' if a local binding, null if intrinsic or external. */
  function identityOf(m: Module, e: ts.Node): Id | null | 'dynamic' {
    if (ts.isIdentifier(e)) {
      const r = lookup(e);
      if (!r) return null;
      if (!isTopLevel(r)) return 'dynamic';
      return localId(m, e.text);
    }
    if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) {
      const r = lookup(e.expression);
      const ns = isTopLevel(r) ? namespaceBinding(m, e.expression.text) : undefined;
      if (ns === null) return null;
      if (ns !== undefined) return exportId(ns, e.name.text, new Set());
      return 'dynamic';
    }
    return ts.isJsxNamespacedName(e) ? null : 'dynamic';
  }
  const isIntrinsic = (tag: ts.JsxTagNameExpression) => ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);

  // --- Seam bindings in parameters.
  /** The destructured seam of a function's first parameter, if it has one. */
  function seamElement(fn: ts.FunctionLikeDeclaration): ts.BindingElement | undefined {
    const p = fn.parameters[0];
    if (!p || !ts.isObjectBindingPattern(p.name)) return undefined;
    return p.name.elements.find((el) => (el.propertyName ? ts.isIdentifier(el.propertyName) && el.propertyName.text : ts.isIdentifier(el.name) && el.name.text) === SEAM || (ts.isIdentifier(el.name) && el.name.text === SEAM));
  }
  function isOwnProps(fn: ts.FunctionLikeDeclaration, decl: ts.Node): boolean {
    const p = fn.parameters[0];
    return p !== undefined && decl === p && ts.isIdentifier(p.name) && !p.initializer && !p.dotDotDotToken;
  }
  /** Writes to an identifier (or a property of it) inside a function body. */
  function isWritten(fn: ts.FunctionLikeDeclaration, decl: ts.Node, name: string): boolean {
    let written = false;
    const rootOf = (e: ts.Expression): ts.Expression => {
      let x = unwrap(e);
      while (ts.isPropertyAccessExpression(x) || ts.isElementAccessExpression(x)) x = unwrap(x.expression);
      return x;
    };
    const target = (e: ts.Expression) => {
      const r = rootOf(e);
      return ts.isIdentifier(r) && r.text === name && lookup(r)?.decl === decl;
    };
    const walk = (n: ts.Node): void => {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && target(n.left)) written = true;
      if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && target(n.operand)) written = true;
      if (ts.isDeleteExpression(n) && target(n.expression)) written = true;
      ts.forEachChild(n, walk);
    };
    if (fn.body) walk(fn.body);
    return written;
  }
  /** The enclosing function whose own first parameter `decl` is. */
  const ownerOf = (decl: ts.Node): ts.FunctionLikeDeclaration | undefined => {
    let p: ts.Node | undefined = decl;
    while (p && !isFunctionLike(p)) p = p.parent;
    return p;
  };

  // --- Components of the reachable modules.
  const components = new Map<Id, { m: Module; fn: ts.FunctionLikeDeclaration }>();
  for (const m of modules.values()) {
    const names = [...m.bindings.keys()].filter((n) => m.bindings.get(n)!.kind === 'local');
    for (const n of names) {
      const fn = componentNode(`${m.file}#${n}`);
      if (fn) components.set(`${m.file}#${n}`, { m, fn });
    }
    const def = componentNode(`${m.file}#default`);
    if (def) components.set(`${m.file}#default`, { m, fn: def });
  }
  const componentFns = new Set([...components.values()].map((c) => c.fn));
  const idOfFn = new Map([...components].map(([id, c]) => [c.fn as ts.Node, id]));

  const affected = new Set<Id>();
  for (const [id, { fn }] of components) if (seamElement(fn)) affected.add(id);

  const jsxIn = (n: ts.Node): (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] => {
    const out: (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[] = [];
    const walk = (x: ts.Node): void => {
      if (ts.isJsxOpeningElement(x) || ts.isJsxSelfClosingElement(x)) out.push(x);
      ts.forEachChild(x, walk);
    };
    walk(n);
    return out;
  };
  // Forwarders, to a fixed point: a component that spreads its own props onto an affected one.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [id, { m, fn }] of components) {
      if (affected.has(id) || !fn.body) continue;
      const forwards = jsxIn(fn.body).some((el) => {
        const t = identityOf(m, el.tagName);
        if (typeof t !== 'string' || t === 'dynamic' || !affected.has(t)) return false;
        return el.attributes.properties.some((a) => {
          if (!ts.isJsxSpreadAttribute(a)) return false;
          const e = a.expression;
          const r = ts.isIdentifier(e) ? lookup(e) : undefined;
          return r !== undefined && isOwnProps(fn, r.decl);
        });
      });
      if (forwards) {
        affected.add(id);
        changed = true;
      }
    }
  }
  const affectedFiles = new Set([...affected].map((id) => id.slice(0, id.lastIndexOf('#'))));

  // --- The seam never changes name and never escapes its component. Inside the component whose
  // parameter declares it, a reference to the seam is allowed in three shapes only, the ones that
  // can do nothing but forward it or throw:
  //   (a) the exact forward `faultAfterChange={faultAfterChange}` (an own-props spread names no seam);
  //   (b) `if (<cond>) throw ...;`, with no else and nothing but the throw in the then-branch;
  //   (c) a JSX child `{<cond> ? <Leaf /> : null}`, where Leaf is a top-level function of the same
  //       module that is not exported, takes no parameters, and is rendered with no attributes.
  // <cond> holds only the seam and plain local bindings of that component (its own props or
  // variables), joined by !, comparisons, && and ||: no call, assignment or property read. Anything
  // else (another attribute, a variable, a hook, a return, a nested callback) fails, and an attribute
  // of another name that received the seam is checked at every other call site too.
  const tainted = new Set<string>();
  const escapeAttrs = new Set<ts.Node>();
  const PASS_THROUGH = new Set([
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
  ]);
  const isJsxChild = (n: ts.Node) => ts.isJsxExpression(n) && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent));
  function climbParens(n: ts.Node): ts.Node {
    let x = n;
    while (ts.isParenthesizedExpression(x.parent)) x = x.parent;
    return x;
  }
  const enclosingFunction = (n: ts.Node): ts.Node | undefined => {
    let p: ts.Node | undefined = n.parent;
    while (p && !isFunctionLike(p)) p = p.parent;
    return p;
  };
  const within = (inner: ts.Node, outer: ts.Node) => inner.getStart() >= outer.getStart() && inner.end <= outer.end;
  /** Only the seam and plain bindings of `owner`, joined by !, comparisons, && and ||. */
  function pureCondition(e: ts.Node, owner: ts.Node): boolean {
    if (ts.isParenthesizedExpression(e)) return pureCondition(e.expression, owner);
    if (ts.isPrefixUnaryExpression(e)) return e.operator === ts.SyntaxKind.ExclamationToken && pureCondition(e.operand, owner);
    if (ts.isBinaryExpression(e)) return PASS_THROUGH.has(e.operatorToken.kind) && pureCondition(e.left, owner) && pureCondition(e.right, owner);
    if (e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword || e.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isIdentifier(e)) {
      const decl = lookup(e)?.decl;
      return decl !== undefined && within(decl, owner) && enclosingFunction(decl) === owner;
    }
    return false;
  }
  /** `throw new Error(<string literal>)`, and nothing else. */
  const isErrorThrow = (st: ts.Node | undefined): boolean => {
    if (!st || !ts.isThrowStatement(st) || !st.expression || !ts.isNewExpression(st.expression)) return false;
    const e = st.expression;
    return ts.isIdentifier(e.expression) && e.expression.text === 'Error' && e.arguments?.length === 1 && literalText(e.arguments[0]) !== null;
  };
  const isOnlyThrow = (st: ts.Statement): boolean =>
    isErrorThrow(st) || (ts.isBlock(st) && st.statements.length === 1 && isErrorThrow(st.statements[0]));
  const isNull = (e: ts.Expression) => unwrap(e).kind === ts.SyntaxKind.NullKeyword;
  /**
   * A module-local throwing leaf: `<Leaf />` with no attributes, a top-level, unexported,
   * parameterless function whose body is exactly `throw new Error(<string literal>)`.
   */
  function isLocalLeaf(m: Module, e: ts.Expression): boolean {
    const el = unwrap(e);
    if (!ts.isJsxSelfClosingElement(el) || el.attributes.properties.length > 0 || !ts.isIdentifier(el.tagName)) return false;
    const name = el.tagName.text;
    if (!isTopLevel(lookup(el.tagName))) return false;
    const b = m.bindings.get(name);
    if (b?.kind !== 'local') return false;
    let fn: ts.Node = b.node;
    if (ts.isVariableDeclaration(fn)) {
      if (!fn.initializer || hasModifier(fn.parent.parent, ts.SyntaxKind.ExportKeyword)) return false;
      fn = unwrap(fn.initializer);
    } else if (hasModifier(fn, ts.SyntaxKind.ExportKeyword)) return false;
    // Its whole body is one `throw new Error(<string literal>)`: it can do nothing but throw.
    if (!isFunctionLike(fn) || fn.parameters.length > 0 || !fn.body || !ts.isBlock(fn.body)) return false;
    if (fn.body.statements.length !== 1 || !isErrorThrow(fn.body.statements[0])) return false;
    const exported = [...m.exports.values()].some((x) => (x.kind === 'local' && x.name === name) || (x.kind === 'node' && x.node === b.node));
    return !exported;
  }
  function seamUseAllowed(m: Module, id: ts.Identifier, owner: ts.Node): boolean {
    const p0 = id.parent;
    if (ts.isJsxExpression(p0) && p0.expression === id && ts.isJsxAttribute(p0.parent) && ts.isIdentifier(p0.parent.name) && p0.parent.name.text === SEAM) return true;
    if (enclosingFunction(id) !== owner) return false;
    let n: ts.Node = id;
    for (;;) {
      const p = n.parent;
      if (ts.isParenthesizedExpression(p)) n = p;
      else if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) n = p;
      else if (ts.isBinaryExpression(p) && PASS_THROUGH.has(p.operatorToken.kind)) n = p;
      else break;
    }
    if (!pureCondition(n, owner)) return false;
    const p = n.parent;
    if (ts.isIfStatement(p) && p.expression === n) return p.elseStatement === undefined && isOnlyThrow(p.thenStatement);
    if (ts.isConditionalExpression(p) && p.condition === n) return isJsxChild(climbParens(p).parent) && isNull(p.whenFalse) && isLocalLeaf(m, p.whenTrue);
    return false;
  }
  const isSeamParamBinding = (decl: ts.Node | undefined) =>
    decl !== undefined && ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent) && ts.isParameter(decl.parent.parent);
  for (const m of modules.values()) {
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n.text === SEAM && !inTypePosition(n)) {
        const parent = n.parent;
        const notReference =
          (ts.isBindingElement(parent) && (parent.name === n || parent.propertyName === n)) ||
          (ts.isJsxAttribute(parent) && parent.name === n) ||
          (ts.isPropertyAccessExpression(parent) && parent.name === n) ||
          (ts.isPropertyAssignment(parent) && parent.name === n);
        const decl = lookup(n)?.decl;
        const owner = decl && isSeamParamBinding(decl) ? ownerOf(decl) : undefined;
        if (!notReference && owner !== undefined && !seamUseAllowed(m, n, owner)) {
          report(n, 'seam-escape', 'the seam is forwarded only as itself, or used as a condition that stays in the component');
          let a: ts.Node | undefined = n.parent;
          while (a && !ts.isJsxAttribute(a) && !ts.isStatement(a) && !isFunctionLike(a)) a = a.parent;
          if (a && ts.isJsxAttribute(a) && ts.isIdentifier(a.name)) {
            escapeAttrs.add(a);
            const t = identityOf(m, a.parent.parent.tagName);
            if (typeof t === 'string' && t !== 'dynamic') tainted.add(`${t}::${a.name.text}`);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(m.sf);
  }

  // --- Checks over every reachable module.
  for (const m of modules.values()) {
    // Only names that can refer to an affected component need the value-use check: top-level
    // bindings that resolve to one, and namespace imports (whose members might).
    const candidates = new Set<string>();
    for (const name of m.bindings.keys()) {
      if (namespaceBinding(m, name) !== undefined) candidates.add(name);
      else {
        const id = localId(m, name);
        if (id !== null && affected.has(id)) candidates.add(name);
      }
    }
    const visit = (n: ts.Node): void => {
      // A seam binding: only a component's own first-parameter destructuring, unrenamed, without a default.
      if (ts.isBindingElement(n)) {
        const named = ts.isIdentifier(n.name) && n.name.text === SEAM;
        const fromSeam = n.propertyName !== undefined && literalText(n.propertyName) === SEAM || (n.propertyName !== undefined && ts.isIdentifier(n.propertyName) && n.propertyName.text === SEAM);
        if (named || fromSeam) {
          const pattern = n.parent;
          const param = pattern.parent;
          const fn = ts.isParameter(param) ? param.parent : undefined;
          if (!ts.isParameter(param) || !fn || !isFunctionLike(fn) || fn.parameters[0] !== param) {
            report(n, 'seam-read', 'the seam is read only by destructuring a component’s own first parameter');
          } else {
            if ((n.propertyName && !(ts.isIdentifier(n.propertyName) && n.propertyName.text === SEAM)) || !named) report(n, 'renamed-seam', 'the seam keeps its name at every hop');
            if (n.initializer) report(n, 'seam-default', 'the seam has no default');
            if (!componentFns.has(fn)) report(n, 'unestablished-identity', 'only a top-level component may take the seam');
            if (named && isWritten(fn, n, SEAM)) report(n, 'seam-reassigned', 'the seam is never reassigned');
          }
        }
      }
      // Property reads and object literals holding the seam.
      if (ts.isPropertyAccessExpression(n) && n.name.text === SEAM && !inTypePosition(n)) report(n, 'seam-read', `.${SEAM}`);
      if (ts.isElementAccessExpression(n) && literalText(n.argumentExpression) === SEAM) report(n, 'seam-read', `[${SEAM}]`);
      if (ts.isObjectLiteralExpression(n)) {
        for (const p of n.properties) {
          const name = p.name && (ts.isIdentifier(p.name) || ts.isPrivateIdentifier(p.name) ? p.name.text : ts.isComputedPropertyName(p.name) ? literalText(p.name.expression) : literalText(p.name));
          if (name === SEAM) report(p, 'seam-object', 'an object literal holds the seam');
        }
      }
      // JSX call sites.
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) checkJsx(m, n);
      // Uses of an affected component as a value.
      if ((ts.isIdentifier(n) && candidates.has(n.text)) || (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && candidates.has(n.expression.text))) {
        checkValueUse(m, n);
      }
      // A dynamic import of a module with affected components that does not bind its default export.
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const lazy = m.lazies.find((l) => l.node === n);
        if (lazy && affectedFiles.has(lazy.module) && !lazy.canonical) report(n, 'unestablished-identity', 'a dynamic import of a seam module must be lazy(() => import(...)) or dynamic(() => import(...))');
        if (lazy && lazy.canonical && affectedFiles.has(lazy.module)) {
          // The lazy result must be bound to a top-level const, so its call sites can be followed.
          let p: ts.Node = n;
          while (!ts.isVariableDeclaration(p) && !ts.isSourceFile(p) && !ts.isStatement(p)) p = p.parent;
          if (!ts.isVariableDeclaration(p) || !ts.isIdentifier(p.name) || !ts.isSourceFile(p.parent.parent.parent)) {
            report(n, 'unestablished-identity', 'a lazy seam component is bound to a top-level const');
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(m.sf);
  }

  function checkJsx(m: Module, el: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void {
    const props = el.attributes.properties;
    const fnOf = (n: ts.Node) => {
      let p: ts.Node | undefined = n.parent;
      while (p && !isFunctionLike(p)) p = p.parent;
      return p;
    };
    // Every explicit seam attribute, on any element.
    for (const a of props) {
      if (!ts.isJsxAttribute(a) || !ts.isIdentifier(a.name) || a.name.text !== SEAM) continue;
      const init = a.initializer;
      const expr = init && ts.isJsxExpression(init) ? init.expression : undefined;
      if (!expr || !ts.isIdentifier(expr) || expr.text !== SEAM) {
        report(a, 'activation', `${SEAM} must be forwarded as ${SEAM}={${SEAM}}`);
        continue;
      }
      const r = lookup(expr);
      const decl = r?.decl;
      const ok =
        decl !== undefined &&
        ts.isBindingElement(decl) &&
        !decl.initializer &&
        (!decl.propertyName || (ts.isIdentifier(decl.propertyName) && decl.propertyName.text === SEAM)) &&
        ts.isObjectBindingPattern(decl.parent) &&
        ts.isParameter(decl.parent.parent) &&
        isFunctionLike(decl.parent.parent.parent) &&
        decl.parent.parent.parent.parameters[0] === decl.parent.parent;
      if (!ok) {
        report(a, 'activation', `${SEAM} is not this component’s own received prop`);
        continue;
      }
      // A forward reaches only a component that takes the seam itself and is traced here.
      const target = isIntrinsic(el.tagName) ? null : identityOf(m, el.tagName);
      if (typeof target !== 'string' || target === 'dynamic' || !affected.has(target)) {
        report(a, 'activation', `${SEAM} is forwarded only to a component that takes it`);
      }
    }
    // An affected component's own props (which may hold the seam) are spread only onto another
    // affected component, never onto an element or a component that would drop or reread them.
    for (const a of props) {
      if (!ts.isJsxSpreadAttribute(a) || !ts.isIdentifier(a.expression)) continue;
      const r = lookup(a.expression);
      const owner = r ? ownerOf(r.decl) : undefined;
      if (!r || !owner || !isOwnProps(owner, r.decl)) continue;
      const ownerId = idOfFn.get(owner);
      if (ownerId === undefined || !affected.has(ownerId)) continue;
      const target = isIntrinsic(el.tagName) ? null : identityOf(m, el.tagName);
      if (typeof target !== 'string' || target === 'dynamic' || !affected.has(target)) {
        report(a, 'unsafe-spread', 'a seam component spreads its props only onto another seam component');
      }
    }
    if (isIntrinsic(el.tagName)) return;
    const t = identityOf(m, el.tagName);
    // An attribute that carries a renamed seam, set anywhere else.
    if (typeof t === 'string' && t !== 'dynamic') {
      for (const a of props) {
        if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && !escapeAttrs.has(a) && tainted.has(`${t}::${a.name.text}`)) {
          report(a, 'activation', `${a.name.text} carries a renamed ${SEAM}`);
        }
      }
    }
    // A tag whose identity cannot be followed: a spread could hand it anything, so only the
    // component's own props may be spread onto it.
    if (t === 'dynamic') {
      for (const a of props) {
        if (!ts.isJsxSpreadAttribute(a)) continue;
        const r = ts.isIdentifier(a.expression) ? lookup(a.expression) : undefined;
        const owner = r ? ownerOf(r.decl) : undefined;
        const own = r !== undefined && owner !== undefined && isOwnProps(owner, r.decl) && componentFns.has(owner) && !isWritten(owner, r.decl, (a.expression as ts.Identifier).text);
        if (!own) report(a, 'unestablished-identity', 'a spread onto a component whose identity cannot be followed');
      }
      return;
    }
    if (typeof t !== 'string' || !affected.has(t)) return;
    // Spreads onto an affected component: only the component's own props, last.
    props.forEach((a, i) => {
      if (!ts.isJsxSpreadAttribute(a)) return;
      const e = a.expression;
      const r = ts.isIdentifier(e) ? lookup(e) : undefined;
      const owner = r ? ownerOf(r.decl) : undefined;
      const fn = fnOf(el);
      const later = props.slice(i + 1).some((b) => ts.isJsxSpreadAttribute(b) || (ts.isIdentifier(b.name) && b.name.text === SEAM));
      const ok =
        r !== undefined &&
        owner !== undefined &&
        isOwnProps(owner, r.decl) &&
        componentFns.has(owner) &&
        fn !== undefined &&
        !isWritten(owner, r.decl, (e as ts.Identifier).text) &&
        !later;
      if (!ok) report(a, 'unsafe-spread', 'only the component’s own unreassigned props may be spread onto a seam component, last');
    });
  }

  function checkValueUse(m: Module, n: ts.Identifier | ts.PropertyAccessExpression): void {
    if (inTypePosition(n)) return;
    const parent = n.parent;
    if (ts.isIdentifier(n)) {
      // Not a reference: names of declarations, properties, attributes and specifiers.
      if (ts.isPropertyAccessExpression(parent) && parent.name === n) return;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === n && namespaceBinding(m, n.text) !== undefined) return;
      if (
        (ts.isPropertyAssignment(parent) && parent.name === n) ||
        (ts.isBindingElement(parent) && (parent.name === n || parent.propertyName === n)) ||
        (ts.isVariableDeclaration(parent) && parent.name === n) ||
        (ts.isParameter(parent) && parent.name === n) ||
        ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isEnumDeclaration(parent) || ts.isEnumMember(parent) || ts.isGetAccessor(parent) || ts.isSetAccessor(parent) || ts.isPropertySignature(parent) || ts.isMethodSignature(parent) || ts.isLabeledStatement(parent) || ts.isBreakOrContinueStatement(parent)) && (parent as { name?: ts.Node }).name === n) ||
        ts.isImportClause(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isImportEqualsDeclaration(parent) ||
        ts.isJsxAttribute(parent) ||
        ts.isJsxNamespacedName(parent)
      ) {
        return;
      }
    }
    const id = identityOf(m, n);
    if (typeof id !== 'string' || id === 'dynamic' || !affected.has(id)) return;
    // Allowed: the tag of a JSX element, a top-level alias, a default export.
    if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) && parent.tagName === n) return;
    if (ts.isVariableDeclaration(parent) && parent.initializer === n && ts.isIdentifier(parent.name) && ts.isSourceFile(parent.parent.parent.parent)) return;
    if (ts.isExportAssignment(parent)) return;
    if (ts.isCallExpression(parent) && parent.expression === n) return report(n, 'direct-call', 'an affected component is rendered as JSX, never called');
    if (ts.isPropertyAccessExpression(parent) && parent.expression === n && ['call', 'apply', 'bind'].includes(parent.name.text)) return report(n, 'direct-call', 'an affected component is rendered as JSX, never called');
    if (ts.isCallExpression(parent) && parent.arguments[0] === n) {
      const callee = parent.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (['createElement', 'cloneElement', 'jsx', 'jsxs', 'jsxDEV', '_jsx', '_jsxs'].includes(name)) return report(n, 'create-element', `${name} of an affected component`);
    }
    report(n, 'component-as-value', 'an affected component is used as a value, so its call sites cannot be followed');
  }

  return {
    roots: roots.map(rel).sort(),
    reachable: [...modules.keys()].map(rel).sort(),
    affected: [...affected].map((id) => `${rel(id.slice(0, id.lastIndexOf('#')))}#${id.slice(id.lastIndexOf('#') + 1)}`).sort(),
    violations,
  };
}

// ---------------------------------------------------------------------------------------------
// The repository.

let pageExtensions: string[] = [];
beforeAll(async () => {
  // The plain build: next.config.ts read without KITCHEN_SINK.
  const saved = process.env.KITCHEN_SINK;
  delete process.env.KITCHEN_SINK;
  try {
    const config = (await import('../../../next.config.ts')).default as { pageExtensions?: string[] };
    pageExtensions = config.pageExtensions ?? [];
  } finally {
    if (saved !== undefined) process.env.KITCHEN_SINK = saved;
  }
});

const show = (v: Violation[]) => v.map((x) => `${x.file}:${x.line} ${x.rule}: ${x.detail}`);

describe('the production graph of this repository', { timeout: 30_000 }, () => {
  it('reads the plain build’s page extensions, which never include the dev-only pages', () => {
    expect(pageExtensions).toEqual(expect.arrayContaining(['tsx', 'ts']));
    expect(pageExtensions).not.toContain('dev.tsx');
  });

  it('has no seam activation, no unresolved or dynamic import and no unfollowable seam component', () => {
    const a = analyse(DISK, REPO, pageExtensions);
    expect(show(a.violations)).toEqual([]);
    // the walk is real: it starts at the layout and the proxy and reaches the kit and the shell
    expect(a.roots).toEqual(expect.arrayContaining(['src/app/layout.tsx', 'src/proxy.ts']));
    expect(a.roots.some((r) => r.endsWith('.dev.tsx'))).toBe(false);
    expect(a.reachable.length).toBeGreaterThan(20);
    expect(a.reachable).toEqual(expect.arrayContaining(['src/components/shell/SiteHeader.tsx', 'src/app/fonts.ts']));
    expect(a.reachable.some((f) => f.includes('kitchen-sink'))).toBe(false);
  });

  it('finds the seam components from the source when a route renders them, and accepts their forwarding', () => {
    const a = analyse(DISK, REPO, pageExtensions, ['src/app/kitchen-sink/retention/page.dev.tsx']);
    expect(show(a.violations)).toEqual([]);
    expect(a.affected).toEqual(
      expect.arrayContaining([
        'src/components/retention/ReturnsFigure.tsx#ReturnsFigure',
        'src/components/retention/ReturnsFigureClient.tsx#ReturnsFigureClient',
        'src/components/retention/ReturnsFigureClient.tsx#ReturnsIsland',
        'src/components/retention/ReturnsInteractive.tsx#ReturnsInteractive',
        'src/components/retention/ReturnsView.tsx#ReturnsFigureView',
        'src/components/retention/CohortFigure.tsx#CohortFigure',
        'src/components/retention/CohortFigureClient.tsx#CohortFigureClient',
        'src/components/retention/CohortFigureClient.tsx#CohortIsland',
        'src/components/retention/CohortInteractive.tsx#CohortInteractive',
        'src/components/retention/CohortView.tsx#CohortFigureView',
      ]),
    );
  });

  it('would reject the faults host if a production root reached it: one activation per Figure it sets', () => {
    const host = 'src/app/kitchen-sink/retention/faults/page.dev.tsx';
    const a = analyse(DISK, REPO, pageExtensions, [host]);
    expect(a.violations.map((v) => [v.file, v.rule])).toEqual([[host, 'activation'], [host, 'activation']]);
    // each violation is the line that sets the seam on that Figure, the cohort Figure among them
    const lines = readFileSync(join(REPO, host), 'utf8').split('\n');
    const tagged = a.violations.map((v) => lines[v.line - 1]!.trim());
    expect(tagged).toEqual(expect.arrayContaining([expect.stringMatching(/^<ReturnsFigure faultAfterChange \/>$/), expect.stringMatching(/^<CohortFigure rows=\{COHORTS\} faultAfterChange \/>$/)]));
  });

  it('finds the full planner’s seam components from the Lab host, and accepts their forwarding', () => {
    const a = analyse(DISK, REPO, pageExtensions, ['src/app/kitchen-sink/lab/page.dev.tsx']);
    expect(show(a.violations)).toEqual([]);
    expect(a.affected).toEqual(
      expect.arrayContaining([
        'src/components/lab/FullPlanner.tsx#FullPlanner',
        'src/components/lab/FullPlannerControls.tsx#FullPlannerIsland',
        'src/components/lab/FullPlannerClient.tsx#FullPlannerClient',
        'src/components/lab/FullPlannerView.tsx#SizingFigureView',
        'src/components/lab/DurationFigure.tsx#DurationFigure',
        'src/components/lab/FullPlannerView.tsx#DurationFigureView',
      ]),
    );
  });

  it('would reject the Lab faults host if a production root reached it', () => {
    const host = 'src/app/kitchen-sink/lab/faults/page.dev.tsx';
    const a = analyse(DISK, REPO, pageExtensions, [host]);
    expect(a.violations.map((v) => [v.file, v.rule])).toEqual([[host, 'activation']]);
    const lines = readFileSync(join(REPO, host), 'utf8').split('\n');
    expect(lines[a.violations[0]!.line - 1]!.trim()).toBe('<FullPlanner faultAfterChange />');
  });
});

// ---------------------------------------------------------------------------------------------
// Fixtures: in-memory sources.

const BASE: Record<string, string> = {
  // The packages the fixtures import, as installed: a bare specifier must name one of them.
  'node_modules/react/package.json': '{}',
  'node_modules/next/package.json': '{}',
  'src/app/layout.tsx': `import './globals.css';
import type { ReactNode } from 'react';
export default function Layout({ children }: { children: ReactNode }) { return <html><body>{children}</body></html>; }`,
  'src/app/globals.css': 'body { margin: 0 }',
  'src/components/x/Throwing.tsx': `'use client';
import { useState } from 'react';
export type ThrowingProps = { data: number; faultAfterChange?: true };
export default function Throwing({ data, faultAfterChange }: ThrowingProps) {
  const [changed] = useState(false);
  if (faultAfterChange && changed) throw new Error('seam');
  return <p>{data}</p>;
}`,
  'src/components/x/Island.tsx': `'use client';
import { lazy } from 'react';
import type { ThrowingProps } from './Throwing';
const LazyThrowing = lazy(() => import('./Throwing'));
export function ThrowingIsland(props: ThrowingProps) { return <LazyThrowing {...props} />; }`,
  'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) {
  return <section><ThrowingIsland data={1} faultAfterChange={faultAfterChange} /></section>;
}`,
  'src/components/x/index.ts': `export { XFigure } from './XFigure';
export * from './Island';`,
  'src/app/page.tsx': `import { XFigure } from '@/components/x/XFigure';
export default function Page() { return <XFigure />; }`,
};

function run(files: Record<string, string>, extraRoots: string[] = []) {
  return analyse(memoryHost({ ...BASE, ...files }), FIXTURE_ROOT, ['tsx', 'ts', 'jsx', 'js'], extraRoots);
}
const rules = (files: Record<string, string>) => run(files).violations.map((v) => `${v.file} ${v.rule}`);

describe('fixtures that pass', () => {
  it('the island pattern: a lazy alias, a received-props spread and forwarding with no default', () => {
    const a = run({});
    expect(show(a.violations)).toEqual([]);
    expect(a.affected).toEqual([
      'src/components/x/Island.tsx#ThrowingIsland',
      'src/components/x/Throwing.tsx#Throwing',
      'src/components/x/XFigure.tsx#XFigure',
    ].sort());
    expect(a.roots).toEqual(['src/app/layout.tsx', 'src/app/page.tsx']);
    // the lazy import is an edge: the island's code is reached through it
    expect(a.reachable).toContain('src/components/x/Throwing.tsx');
  });

  it('an isolated dev host that sets the seam, reached by no production root', () => {
    expect(rules({ 'src/app/kitchen-sink/faults/page.dev.tsx': `import { XFigure } from '@/components/x/XFigure';
export default function Host() { return <XFigure faultAfterChange />; }` })).toEqual([]);
  });

  it('a non-route app module that sets the seam but is imported by nothing', () => {
    expect(rules({ 'src/app/_parts/loose.tsx': `import { XFigure } from '@/components/x/XFigure';
export function Loose() { return <XFigure faultAfterChange />; }` })).toEqual([]);
  });

  it('type declarations naming the seam, and spreads onto unrelated components', () => {
    expect(rules({
      'src/components/x/Other.tsx': `export type P = { faultAfterChange?: true; label: string };
export interface Q { faultAfterChange?: true }
function Label({ label }: { label: string }) { return <span>{label}</span>; }
export function Other(extra: { label: string }) { const more = { label: 'a' }; return <><Label {...extra} /><Label {...more} /></>; }`,
      'src/app/page.tsx': `import { XFigure } from '@/components/x/XFigure';
import { Other } from '@/components/x/Other';
export default function Page() { return <><XFigure /><Other label="b" /></>; }`,
    })).toEqual([]);
  });

  it('a CSS-importing root and JSON leaves', () => {
    expect(rules({
      'src/app/data.json': '{}',
      'src/app/privacy/page.tsx': `import data from '../data.json';
import './privacy.module.css';
export default function P() { return <p>{String(data)}</p>; }`,
      'src/app/privacy/privacy.module.css': '.a {}',
    })).toEqual([]);
  });

  it('a barrel re-export and a namespace import, forwarding unchanged', () => {
    expect(rules({
      'src/components/x/Wrap.tsx': `import * as X from './index';
export function Wrap({ faultAfterChange }: { faultAfterChange?: true }) { return <X.XFigure faultAfterChange={faultAfterChange} />; }`,
      'src/app/page.tsx': `import { Wrap } from '@/components/x/Wrap';
export default function Page() { return <Wrap />; }`,
    })).toEqual([]);
  });
});

const page = (body: string, imports = `import { XFigure } from '@/components/x/XFigure';`) => ({
  'src/app/page.tsx': `${imports}\nexport default function Page() { ${body} }`,
});

describe('fixtures that fail', () => {
  it('a production page that sets the seam on the cohort view, an inner hop', () => {
    const view = 'src/components/retention/CohortView.tsx';
    const route = 'src/app/page.tsx';
    const a = run({
      [view]: `function SeamFailure(): never {
  throw new Error('The cohort chart failed after a change (test seam)');
}
export function CohortFigureView({ changed, faultAfterChange }: { changed?: boolean; faultAfterChange?: true }) {
  return <figure>{faultAfterChange && changed ? <SeamFailure /> : null}</figure>;
}`,
      [route]: `import { CohortFigureView } from '@/components/retention/CohortView';
export default function Page() {
  return <CohortFigureView changed faultAfterChange />;
}`,
    });
    expect(a.affected).toContain(`${view}#CohortFigureView`);
    expect(a.violations.map((v) => [v.file, v.line, v.rule])).toEqual([[route, 3, 'activation']]);
  });

  it.each([
    ['a bare attribute', 'return <XFigure faultAfterChange />;'],
    ['explicit true', 'return <XFigure faultAfterChange={true} />;'],
    ['typed true', 'return <XFigure faultAfterChange={true as const} />;'],
    ['parenthesised true', 'return <XFigure faultAfterChange={(true)} />;'],
    ['an identifier set to true', 'const on = true as const; return <XFigure faultAfterChange={on} />;'],
    ['a local named like the seam', 'const faultAfterChange = true as const; return <XFigure faultAfterChange={faultAfterChange} />;'],
    ['a string', 'return <XFigure faultAfterChange="true" />;'],
  ])('%s at a production call site', (_, body) => {
    expect(rules(page(body))).toContain('src/app/page.tsx activation');
  });

  it('a literal spread', () => {
    expect(rules(page('return <XFigure {...{ faultAfterChange: true }} />;'))).toEqual(
      expect.arrayContaining(['src/app/page.tsx seam-object', 'src/app/page.tsx unsafe-spread']),
    );
  });

  it('a dynamic spread onto an affected component', () => {
    expect(rules(page('const extra = Math.random() > 1 ? {} : {}; return <XFigure {...extra} />;'))).toContain('src/app/page.tsx unsafe-spread');
  });

  it('createElement of an affected component', () => {
    expect(rules(page(`return createElement(XFigure, { faultAfterChange: true });`, `import { createElement } from 'react';\nimport { XFigure } from '@/components/x/XFigure';`))).toEqual(
      expect.arrayContaining(['src/app/page.tsx create-element', 'src/app/page.tsx seam-object']),
    );
    expect(rules(page(`return React.createElement(XFigure, {});`, `import React from 'react';\nimport { XFigure } from '@/components/x/XFigure';`))).toContain('src/app/page.tsx create-element');
  });

  it('a direct call of an affected component', () => {
    expect(rules(page('return XFigure({});'))).toContain('src/app/page.tsx direct-call');
    expect(rules(page('return XFigure.call(null, {});'))).toContain('src/app/page.tsx direct-call');
  });

  it('an affected component used as a value, or wrapped', () => {
    expect(rules(page('const Memo = memo(XFigure); return <Memo />;', `import { memo } from 'react';\nimport { XFigure } from '@/components/x/XFigure';`))).toContain('src/app/page.tsx component-as-value');
    expect(rules(page('const C = [XFigure][0]!; return <C />;'))).toContain('src/app/page.tsx component-as-value');
  });

  it('an alias and a namespace member still resolve to the affected component', () => {
    expect(rules({ 'src/app/page.tsx': `import { XFigure } from '@/components/x/XFigure';
const Alias = XFigure;
export default function Page() { return <Alias faultAfterChange />; }` })).toContain('src/app/page.tsx activation');
    expect(rules({ 'src/app/page.tsx': `import * as X from '@/components/x';
export default function Page() { return <X.XFigure faultAfterChange={true} />; }` })).toContain('src/app/page.tsx activation');
    expect(rules({ 'src/app/page.tsx': `import * as X from '@/components/x';
export default function Page() { return <X.ThrowingIsland data={1} {...{ faultAfterChange: true }} />; }` })).toContain('src/app/page.tsx unsafe-spread');
  });

  it('a fault-activating wrapper under src/lib', () => {
    expect(rules({
      'src/lib/wrap.tsx': `import { XFigure } from '@/components/x/XFigure';
export function Wrapped() { return <XFigure faultAfterChange />; }`,
      ...page('return <Wrapped />;', `import { Wrapped } from '@/lib/wrap';`),
    })).toContain('src/lib/wrap.tsx activation');
  });

  it('a production route importing an activating dev helper', () => {
    expect(rules({
      'src/app/kitchen-sink/_parts/helper.tsx': `import { XFigure } from '@/components/x/XFigure';
export function Helper() { return <XFigure faultAfterChange />; }`,
      ...page('return <Helper />;', `import { Helper } from './kitchen-sink/_parts/helper';`),
    })).toContain('src/app/kitchen-sink/_parts/helper.tsx activation');
  });

  it('a non-route app module reached from a layout', () => {
    expect(rules({
      'src/app/_parts/section.tsx': `import { XFigure } from '@/components/x/XFigure';
export function Section() { return <XFigure faultAfterChange />; }`,
      'src/app/layout.tsx': `import './globals.css';
import type { ReactNode } from 'react';
import { Section } from './_parts/section';
export default function Layout({ children }: { children: ReactNode }) { return <html><body><Section />{children}</body></html>; }`,
    })).toContain('src/app/_parts/section.tsx activation');
  });

  it('the proxy and the metadata files are roots too', () => {
    expect(rules({ 'src/proxy.ts': `import { on } from './lib/on';\nexport function proxy() { return on; }`, 'src/lib/on.tsx': `import { XFigure } from '@/components/x/XFigure';\nexport const on = <XFigure faultAfterChange />;` })).toContain('src/lib/on.tsx activation');
    expect(rules({ 'src/app/opengraph-image.tsx': `import { XFigure } from '@/components/x/XFigure';\nexport default function Image() { return <XFigure faultAfterChange />; }` })).toContain('src/app/opengraph-image.tsx activation');
  });

  it('a wrapper whose destructured seam defaults to true', () => {
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure({ faultAfterChange = true }: { faultAfterChange?: true }) {
  return <ThrowingIsland data={1} faultAfterChange={faultAfterChange} />;
}`,
    })).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx seam-default', 'src/components/x/XFigure.tsx activation']));
  });

  it('a renamed seam, either way round', () => {
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure({ faultAfterChange: f }: { faultAfterChange?: true }) { return <ThrowingIsland data={1} faultAfterChange={f} />; }`,
    })).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx renamed-seam', 'src/components/x/XFigure.tsx activation']));
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure({ debug: faultAfterChange }: { debug?: true }) { return <ThrowingIsland data={1} faultAfterChange={faultAfterChange} />; }`,
    })).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx renamed-seam', 'src/components/x/XFigure.tsx activation']));
  });

  it('a reassigned seam, a seam read from props and a seam destructured in the body', () => {
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) { faultAfterChange = true; return <ThrowingIsland data={1} faultAfterChange={faultAfterChange} />; }`,
    })).toContain('src/components/x/XFigure.tsx seam-reassigned');
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure(props: { faultAfterChange?: true }) { return <ThrowingIsland data={1} faultAfterChange={props.faultAfterChange} />; }`,
    })).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx seam-read', 'src/components/x/XFigure.tsx activation']));
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure(props: { faultAfterChange?: true }) { const { faultAfterChange } = props; return <ThrowingIsland data={1} faultAfterChange={faultAfterChange} />; }`,
    })).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx seam-read', 'src/components/x/XFigure.tsx activation']));
  });

  it('a props spread that is reassigned, overridden later, or not the component’s own', () => {
    const island = (body: string) => ({ 'src/components/x/Island.tsx': `'use client';
import { lazy } from 'react';
import type { ThrowingProps } from './Throwing';
const LazyThrowing = lazy(() => import('./Throwing'));
export function ThrowingIsland(props: ThrowingProps) { ${body} }` });
    expect(rules(island('props = { data: 1, faultAfterChange: true }; return <LazyThrowing {...props} />;'))).toContain('src/components/x/Island.tsx unsafe-spread');
    expect(rules(island('const more = {}; return <LazyThrowing {...props} {...more} />;'))).toContain('src/components/x/Island.tsx unsafe-spread');
    expect(rules(island('return [props].map((p) => <LazyThrowing key="a" {...p} />);'))).toContain('src/components/x/Island.tsx unsafe-spread');
    expect(rules(island('const { faultAfterChange, ...rest } = props; return <LazyThrowing {...rest} />;'))).toEqual(
      expect.arrayContaining(['src/components/x/Island.tsx unsafe-spread', 'src/components/x/Island.tsx seam-read']),
    );
  });

  it('a seam component that is not top-level', () => {
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
export function XFigure() {
  const Inner = ({ faultAfterChange }: { faultAfterChange?: true }) => <ThrowingIsland data={1} faultAfterChange={faultAfterChange} />;
  return <Inner />;
}`,
    })).toContain('src/components/x/XFigure.tsx unestablished-identity');
  });

  it('a lazy import of a seam module whose identity cannot be followed', () => {
    expect(rules(island2(`const LazyThrowing = lazy(() => import('./Throwing').then((m) => ({ default: m.default })));`))).toContain('src/components/x/Island.tsx unestablished-identity');
    expect(rules(island2(`const LazyThrowing = lazy(async () => { await Promise.resolve(); return import('./Throwing'); });`))).toContain('src/components/x/Island.tsx unestablished-identity');
  });

  it('a non-literal dynamic import or require', () => {
    expect(rules(page(`const name = './x'; void import(name); return null;`, ''))).toContain('src/app/page.tsx dynamic-import');
    expect(rules(page('const name = "./x"; require(name); return null;', ''))).toContain('src/app/page.tsx dynamic-import');
  });

  it('unresolved local imports, including a missing stylesheet', () => {
    expect(rules(page('return null;', `import { Nope } from './missing';`))).toContain('src/app/page.tsx unresolved-import');
    expect(rules(page('return null;', `import '@/lib/nope';`))).toContain('src/app/page.tsx unresolved-import');
    expect(rules(page('return null;', `import './gone.css';`))).toContain('src/app/page.tsx unresolved-import');
  });
});

function island2(lazyLine: string) {
  return {
    'src/components/x/Island.tsx': `'use client';
import { lazy } from 'react';
import type { ThrowingProps } from './Throwing';
${lazyLine}
export function ThrowingIsland(props: ThrowingProps) { return <LazyThrowing {...props} />; }`,
  };
}

describe('fixtures added after review: the seam never changes name or escapes', () => {
  const view = {
    'src/components/x/View.tsx': `export function View({ chartFails, x }: { chartFails?: boolean; x?: unknown }) {
  if (chartFails) throw new Error('seam');
  return <p>{String(x)}</p>;
}`,
  };
  const figure = (body: string, extra = '') => ({
    ...view,
    'src/components/x/XFigure.tsx': `import { useEffect, useState } from 'react';
import { View } from './View';
${extra}
export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) {
  const [changed] = useState(false);
  ${body}
}`,
  });

  it.each([
    ['a renamed forward', 'return <View chartFails={faultAfterChange === true && changed} />;'],
    ['a forward of a value built from the seam', 'return <View x={faultAfterChange && changed} />;'],
    ['a seam stored in a variable', 'const on = faultAfterChange; return <View x={on} />;'],
    ['a seam handed to a hook', 'const [kept] = useState(faultAfterChange); return <View x={kept} />;'],
    ['a seam in an array', 'return <View x={[faultAfterChange]} />;'],
    ['a seam returned', 'return faultAfterChange ? <View /> : <View x={changed} />, faultAfterChange;'],
  ])('%s fails', (_, body) => {
    expect(rules(figure(body))).toContain('src/components/x/XFigure.tsx seam-escape');
  });

  it('a production page that sets the renamed prop fails at the page too', () => {
    const files = {
      ...figure('return <View chartFails={faultAfterChange === true && changed} />;'),
      ...page('return <><XFigure /><View chartFails /></>;', `import { XFigure } from '@/components/x/XFigure';\nimport { View } from '@/components/x/View';`),
    };
    expect(rules(files)).toEqual(expect.arrayContaining(['src/components/x/XFigure.tsx seam-escape', 'src/app/page.tsx activation']));
  });

  it('the two shapes that can only throw pass: `if (cond) throw` and a JSX child `cond ? <Leaf /> : null`', () => {
    expect(rules(figure('if (faultAfterChange && changed) throw new Error("seam"); return <View />;'))).toEqual([]);
    expect(rules(figure('if (!(faultAfterChange !== true) && changed) { throw new Error("seam"); } return <View />;'))).toEqual([]);
    expect(rules(figure('return <section>{faultAfterChange && changed ? <Boom /> : null}<View /></section>;', 'function Boom(): never { throw new Error("seam"); }'))).toEqual([]);
    // the shipped view: a destructured plain prop in the condition, a module-local leaf
    expect(rules({
      'src/components/x/XFigure.tsx': `import { ThrowingIsland } from './Island';
function Boom(): never { throw new Error('seam'); }
export function XFigure({ faultAfterChange, changed }: { faultAfterChange?: true; changed?: boolean }) {
  return <section>{faultAfterChange && changed ? <Boom /> : null}<ThrowingIsland data={1} faultAfterChange={faultAfterChange} /></section>;
}`,
    })).toEqual([]);
  });

  const leaf = 'function Boom(): never { throw new Error("seam"); }';
  it.each([
    ['R1: a variable set inside a permitted if', 'let on = false; if (faultAfterChange) on = true; return <View chartFails={on && changed} />;', ''],
    ['R2: a JSX-child ternary that renders a renamed prop', 'return <section>{faultAfterChange && changed ? <View chartFails /> : <View />}</section>;', ''],
    ['R3: an if that returns a renamed prop', 'if (faultAfterChange && changed) return <View chartFails />; return <View />;', ''],
    ['R4: state set in an effect', 'const [boom, setBoom] = useState(false); useEffect(() => { if (faultAfterChange) setBoom(true); }, []); return <View chartFails={boom} />;', ''],
    ['R5: an assignment inside the condition', 'let on = false; if (faultAfterChange && (on = true)) {} return <View chartFails={on} />;', ''],
    ['an if with an else', 'if (faultAfterChange) throw new Error("seam"); else console.log("no"); return <View />;', ''],
    ['a call in the condition', 'if (faultAfterChange && Math.random() > 0.5) throw new Error("seam"); return <View />;', ''],
    ['a property read in the condition', 'if (faultAfterChange && window.closed) throw new Error("seam"); return <View />;', ''],
    ['a throwing leaf that is exported', 'return <section>{faultAfterChange ? <Boom /> : null}</section>;', 'export function Boom(): never { throw new Error("seam"); }'],
    ['a throwing leaf that takes props', 'return <section>{faultAfterChange ? <Boom label="x" /> : null}</section>;', 'function Boom(_: { label: string }): never { throw new Error("seam"); }'],
    ['a leaf from another module', 'return <section>{faultAfterChange ? <View /> : null}</section>;', ''],
    ['a ternary whose other branch renders', 'return <section>{faultAfterChange ? <Boom /> : <View />}</section>;', leaf],
    ['a JSX-child || form', 'return <section>{!(faultAfterChange === true) || <View />}</section>;', ''],
    ['a JSX-child && form', 'return <section>{faultAfterChange && <Boom />}</section>;', leaf],
    ['a ternary outside a JSX child', 'const el = faultAfterChange ? <Boom /> : null; return <section>{el}</section>;', leaf],
    ['a condition inside a nested callback', 'return <section>{[1].map(() => (faultAfterChange ? <Boom key="b" /> : null))}</section>;', leaf],
    ['destructuring with a rename', 'const { x: y } = { x: faultAfterChange }; return <View chartFails={y} />;', ''],
    ['an object spread holding the seam', 'return <View {...{ chartFails: faultAfterChange }} />;', ''],
    ['a helper that receives it', 'const flag = pass(faultAfterChange); return <View chartFails={flag} />;', 'function pass(v?: true) { return v === true; }'],
  ])('%s fails', (_, body, extra) => {
    expect(rules(figure(body, extra)), body).toContain('src/components/x/XFigure.tsx seam-escape');
  });

  it('R2b: a renamed prop on a component a production page also renders fails', () => {
    const files = {
      ...figure('return <section>{faultAfterChange && changed ? <View chartFails /> : <View />}</section>;'),
      ...page('return <><XFigure /><View chartFails /></>;', `import { XFigure } from '@/components/x/XFigure';\nimport { View } from '@/components/x/View';`),
    };
    expect(rules(files)).toContain('src/components/x/XFigure.tsx seam-escape');
  });
});

describe('fixtures added after review: identities and roots the guard must follow', () => {
  it('a namespace re-export resolves, so a spread on its member is checked', () => {
    expect(rules({
      'src/components/x/ns.ts': `export * as NS from './XFigure';`,
      ...page(`const o = JSON.parse('{}'); return <NS.XFigure {...o} />;`, `import { NS } from '@/components/x/ns';`),
    })).toContain('src/app/page.tsx unsafe-spread');
    expect(rules({
      'src/components/x/ns.ts': `export * as NS from './XFigure';`,
      ...page('return <NS.XFigure />;', `import { NS } from '@/components/x/ns';`),
    })).toEqual([]);
  });

  it('a spread onto a tag whose identity cannot be followed fails closed', () => {
    expect(rules(page(`return <Pick as={XFigure} />;`, `import type { ComponentType } from 'react';
import { XFigure } from '@/components/x/XFigure';
function Pick({ as: Comp }: { as: ComponentType }) { const o = JSON.parse('{}'); return <Comp {...o} />; }`))).toEqual(
      expect.arrayContaining(['src/app/page.tsx unestablished-identity']),
    );
  });

  it('a bare specifier that is not an installed package, or another alias, is unresolved', () => {
    expect(rules(page('return null;', `import { Evil } from '~/evil';`))).toContain('src/app/page.tsx unresolved-import');
    expect(rules(page('return null;', `import x from 'not-installed';`))).toContain('src/app/page.tsx unresolved-import');
    expect(rules(page('return null;', `import { useState } from 'react';\nimport dynamic from 'next/dynamic';\nimport { readFileSync } from 'node:fs';\nimport path from 'path';`))).toEqual([]);
  });

  it("Next's global-not-found and mdx-components files are roots", () => {
    const activates = `import { XFigure } from '@/components/x/XFigure';\nexport default function F() { return <XFigure faultAfterChange />; }`;
    expect(rules({ 'src/app/global-not-found.tsx': activates })).toContain('src/app/global-not-found.tsx activation');
    expect(rules({ 'src/mdx-components.tsx': activates })).toContain('src/mdx-components.tsx activation');
    expect(rules({ 'mdx-components.tsx': activates })).toContain('mdx-components.tsx activation');
  });
});

describe('the alias map the guard resolves', () => {
  it('is exactly the one tsconfig path, @/*', () => {
    const tsconfig = ts.parseConfigFileTextToJson('tsconfig.json', readFileSync(join(REPO, 'tsconfig.json'), 'utf8')).config as {
      compilerOptions: { paths?: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
  });
});

describe('fixtures added in the last guard round: a leaf only throws, a forward only reaches a seam component', () => {
  const view = {
    'src/components/x/View.tsx': `export function View({ chartFails }: { chartFails?: boolean }) {
  if (chartFails) throw new Error('seam');
  return <p>view</p>;
}`,
  };
  const withLeaf = (leaf: string, body = 'return <section>{faultAfterChange && changed ? <Leaf /> : null}<View /></section>;') => ({
    ...view,
    'src/components/x/XFigure.tsx': `import { useEffect, useState } from 'react';
import { View } from './View';
let armed = false;
${leaf}
export function XFigure({ faultAfterChange, changed }: { faultAfterChange?: true; changed?: boolean }) {
  ${body}
}
export function Reader() { return <View chartFails={armed} />; }`,
  });

  it.each([
    ['B1: a leaf that renders a renamed prop', 'function Leaf() { return <View chartFails />; }'],
    ['B10: an arrow leaf that renders a renamed prop', 'const Leaf = () => <View chartFails />;'],
    ['B2: a leaf that writes a module variable', 'function Leaf() { armed = true; return null; }'],
    ['B3: a leaf that writes a global in an effect', 'function Leaf() { useEffect(() => { (globalThis as { armed?: boolean }).armed = true; }); return null; }'],
    ['a leaf that throws something other than a new Error with a literal', 'function Leaf(): never { throw armed; }'],
    ['a leaf whose message is computed', 'function Leaf(): never { throw new Error(String(armed)); }'],
    ['a leaf with a statement before its throw', 'function Leaf(): never { armed = true; throw new Error("seam"); }'],
  ])('%s fails', (_, leaf) => {
    expect(rules(withLeaf(leaf))).toContain('src/components/x/XFigure.tsx seam-escape');
  });

  it('B1b: a renamed-prop leaf with a production page rendering the same prop fails', () => {
    const files = {
      ...withLeaf('function Leaf() { return <View chartFails />; }'),
      ...page('return <><XFigure /><View chartFails /></>;', `import { XFigure } from '@/components/x/XFigure';\nimport { View } from '@/components/x/View';`),
    };
    expect(rules(files)).toContain('src/components/x/XFigure.tsx seam-escape');
  });

  it('B4: an if whose throw runs an assignment first fails', () => {
    expect(rules(withLeaf('', 'if (faultAfterChange && changed) throw (armed = true, new Error("seam")); return <View />;'))).toContain('src/components/x/XFigure.tsx seam-escape');
    expect(rules(withLeaf('', 'if (faultAfterChange && changed) throw new Error(String(armed)); return <View />;'))).toContain('src/components/x/XFigure.tsx seam-escape');
  });

  it('the strict leaf and the strict if pass', () => {
    expect(rules(withLeaf('function Leaf(): never { throw new Error("The chart failed after a change"); }'))).toEqual([]);
    expect(rules(withLeaf('const Leaf = (): never => { throw new Error(`seam`); };'))).toEqual([]);
    expect(rules(withLeaf('', 'if (faultAfterChange && changed) { throw new Error("seam"); } return <View />;'))).toEqual([]);
  });

  const generic = {
    'src/components/x/Generic.tsx': `import { View } from './View';
export function Generic(props: Record<string, unknown>) { return <View chartFails={Object.values(props).some(Boolean)} />; }`,
  };
  it('B5: a forward by name onto a component that does not take the seam fails', () => {
    expect(rules({
      ...view,
      ...generic,
      'src/components/x/XFigure.tsx': `import { Generic } from './Generic';
export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) { return <Generic faultAfterChange={faultAfterChange} />; }`,
    })).toContain('src/components/x/XFigure.tsx activation');
  });

  it('B5b: the same, with a production page rendering the renamed prop', () => {
    expect(rules({
      ...view,
      ...generic,
      'src/components/x/XFigure.tsx': `import { Generic } from './Generic';
export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) { return <Generic faultAfterChange={faultAfterChange} />; }`,
      ...page('return <><XFigure /><View chartFails /></>;', `import { XFigure } from '@/components/x/XFigure';\nimport { View } from '@/components/x/View';`),
    })).toContain('src/components/x/XFigure.tsx activation');
  });

  it('B12: a forward onto an own-props spread into a component that does not take the seam fails', () => {
    expect(rules({
      ...view,
      ...generic,
      'src/components/x/Island.tsx': `import { Generic } from './Generic';
export function ThrowingIsland(props: { data: number; faultAfterChange?: true }) { return <Generic {...props} />; }`,
    })).toContain('src/components/x/XFigure.tsx activation');
  });

  it('a forward by name onto an intrinsic element fails', () => {
    expect(rules({
      'src/components/x/XFigure.tsx': `export function XFigure({ faultAfterChange }: { faultAfterChange?: true }) { return <div data-x="1" {...{}} faultAfterChange={faultAfterChange} />; }`,
    })).toContain('src/components/x/XFigure.tsx activation');
  });
});

describe('fixtures for the full planner: a paired island whose seam reaches two Figures', () => {
  // The repository's shape in miniature: a server composition, a lazy island loaded through a
  // received-props spread, the island forwarding the seam to the sizing view and to the duration
  // Figure, and the duration Figure forwarding it to its view.
  const lab: Record<string, string> = {
    'src/components/lab/FullPlannerView.tsx': `function SizingSeamFailure(): never {
  throw new Error('The sizing readout failed after a change (test seam)');
}
function DurationSeamFailure(): never {
  throw new Error('The duration readout failed after a change (test seam)');
}
export function SizingFigureView({ changed, faultAfterChange }: { changed?: boolean; faultAfterChange?: true }) {
  return <figure>{faultAfterChange && changed ? <SizingSeamFailure /> : null}</figure>;
}
export function DurationFigureView({ changed, faultAfterChange }: { changed?: boolean; faultAfterChange?: true }) {
  return <figure>{faultAfterChange && changed ? <DurationSeamFailure /> : null}</figure>;
}`,
    'src/components/lab/DurationFigure.tsx': `'use client';
import { useState } from 'react';
import { DurationFigureView } from './FullPlannerView';
export function DurationFigure({ nPerArm, faultAfterChange }: { nPerArm: number; faultAfterChange?: true }) {
  const [changed] = useState(nPerArm < 0);
  return <DurationFigureView changed={changed} faultAfterChange={faultAfterChange} />;
}`,
    'src/components/lab/FullPlannerClient.tsx': `'use client';
import { useState } from 'react';
import { DurationFigure } from './DurationFigure';
import { SizingFigureView } from './FullPlannerView';
export type FullPlannerClientProps = { id: string; faultAfterChange?: true };
export default function FullPlannerClient({ id, faultAfterChange }: FullPlannerClientProps) {
  const [changed] = useState(id === '');
  return <div><SizingFigureView changed={changed} faultAfterChange={faultAfterChange} /><DurationFigure nPerArm={1} faultAfterChange={faultAfterChange} /></div>;
}`,
    'src/components/lab/FullPlannerControls.tsx': `'use client';
import { lazy } from 'react';
import type { FullPlannerClientProps } from './FullPlannerClient';
const LazyFullPlanner = lazy(() => import('./FullPlannerClient'));
export function FullPlannerIsland(props: FullPlannerClientProps) { return <LazyFullPlanner {...props} />; }`,
    'src/components/lab/FullPlanner.tsx': `import { FullPlannerIsland } from './FullPlannerControls';
export function FullPlanner({ id = 'planner', faultAfterChange }: { id?: string; faultAfterChange?: true }) {
  return <section><FullPlannerIsland id={id} faultAfterChange={faultAfterChange} /></section>;
}`,
  };
  const labPage = (body: string, imports = `import { FullPlanner } from '@/components/lab/FullPlanner';`): Record<string, string> => ({
    ...lab,
    'src/app/page.tsx': `${imports}\nexport default function Page() {\n  ${body}\n}`,
  });

  it('the faithful chain passes, and every hop is found from the source', () => {
    const a = run(labPage('return <FullPlanner />;'));
    expect(show(a.violations)).toEqual([]);
    expect(a.affected).toEqual(
      expect.arrayContaining([
        'src/components/lab/FullPlanner.tsx#FullPlanner',
        'src/components/lab/FullPlannerControls.tsx#FullPlannerIsland',
        'src/components/lab/FullPlannerClient.tsx#FullPlannerClient',
        'src/components/lab/FullPlannerView.tsx#SizingFigureView',
        'src/components/lab/DurationFigure.tsx#DurationFigure',
        'src/components/lab/FullPlannerView.tsx#DurationFigureView',
      ]),
    );
  });

  it.each([
    ['the composition', 'return <FullPlanner faultAfterChange />;', `import { FullPlanner } from '@/components/lab/FullPlanner';`],
    ['the duration Figure, an inner hop', 'return <DurationFigure nPerArm={1} faultAfterChange />;', `import { DurationFigure } from '@/components/lab/DurationFigure';`],
    ['the duration view, the last hop', 'return <DurationFigureView changed faultAfterChange />;', `import { DurationFigureView } from '@/components/lab/FullPlannerView';`],
  ])('a production page that sets the seam on %s fails', (_, body, imports) => {
    const a = run(labPage(body, imports));
    expect(a.violations.map((v) => [v.file, v.line, v.rule])).toEqual([['src/app/page.tsx', 3, 'activation']]);
  });

  it('the island forwarding the seam to the duration Figure with a defaulting expression fails', () => {
    const files = labPage('return <FullPlanner />;');
    files['src/components/lab/FullPlannerClient.tsx'] = files['src/components/lab/FullPlannerClient.tsx']!.replace(
      '<DurationFigure nPerArm={1} faultAfterChange={faultAfterChange} />',
      '<DurationFigure nPerArm={1} faultAfterChange={faultAfterChange ?? true} />',
    );
    expect(rules(files)).toContain('src/components/lab/FullPlannerClient.tsx activation');
  });
});
