import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const KIT_DIR = join(import.meta.dirname, '../../src/components/kit');

export type EntryPoint = 'index' | 'client';

/**
 * The names a module exports, from its source (types do not exist at runtime): declarations
 * (function, class, const/let/var, type, interface, enum), `export { a, b as c }` clauses, with or
 * without `from`, `export type { ... }`, and `default` for a default export.
 */
export function exportedNames(text: string): string[] {
  const source = ts.createSourceFile('module.tsx', text, ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  source.forEachChild((node) => {
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const el of node.exportClause.elements) names.push(el.name.text);
      }
      return;
    }
    if (ts.isExportAssignment(node)) {
      names.push('default');
      return;
    }
    if (!ts.canHaveModifiers(node)) return;
    const modifiers = ts.getModifiers(node) ?? [];
    if (!modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return;
    if (modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      names.push('default');
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) names.push(decl.name.getText());
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      node.name
    ) {
      names.push(node.name.text);
    }
  });
  return names;
}

/** Every name src/components/kit/<entry>.ts exports, types included. */
export function entryExportNames(entry: EntryPoint): string[] {
  return exportedNames(readFileSync(join(KIT_DIR, `${entry}.ts`), 'utf8'));
}

/** The module specifiers an entry point re-exports from, such as './Slider'. */
export function entryModules(entry: EntryPoint): string[] {
  const text = readFileSync(join(KIT_DIR, `${entry}.ts`), 'utf8');
  const source = ts.createSourceFile(`${entry}.ts`, text, ts.ScriptTarget.Latest, true);
  const modules: string[] = [];
  source.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.push(node.moduleSpecifier.text);
    }
  });
  return modules;
}

/** Whether the module's first statement is the 'use client' directive (a mention in a comment does not count). */
export function hasUseClient(text: string): boolean {
  const first = ts.createSourceFile('module.tsx', text, ts.ScriptTarget.Latest, true).statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client';
}

/** Every name the kit exports across both entry points. */
export function kitExportNames(): string[] {
  return [...entryExportNames('index'), ...entryExportNames('client')];
}
