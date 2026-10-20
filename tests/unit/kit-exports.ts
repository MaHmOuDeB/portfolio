import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/** Every name src/components/kit/index.ts exports, types included (types do not exist at runtime). */
export function kitExportNames(): string[] {
  const file = join(import.meta.dirname, '../../src/components/kit/index.ts');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  source.forEachChild((node) => {
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const el of node.exportClause.elements) names.push(el.name.text);
    }
  });
  return names;
}
