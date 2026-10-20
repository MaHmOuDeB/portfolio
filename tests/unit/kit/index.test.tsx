import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as kit from '@/components/kit';
import { kitExportNames } from '../kit-exports';

const KIT_DIR = join(import.meta.dirname, '../../../src/components/kit');
const sourceOf = (name: string) => readFileSync(join(KIT_DIR, name), 'utf8');
const kitFiles = readdirSync(KIT_DIR).filter((f) => /\.tsx?$/.test(f) && f !== 'index.ts');
/** Whether the module's first statement is the 'use client' directive (a mention in a comment does not count). */
function usesDirective(text: string): boolean {
  const first = ts.createSourceFile('m.ts', text, ts.ScriptTarget.Latest, true).statements[0];
  return !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use client';
}

describe('the kit index', () => {
  it('is not a client module, so a Server Component can import it', () => {
    expect(usesDirective(sourceOf('index.ts'))).toBe(false);
    // The detector sees a real directive.
    expect(usesDirective(sourceOf('Slider.tsx'))).toBe(true);
  });

  it('exports every export of every kit file', () => {
    const indexed = new Set(kitExportNames());
    for (const file of kitFiles) {
      const text = sourceOf(file);
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      source.forEachChild((node) => {
        const exported = ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (exported && (ts.isFunctionDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))) {
          expect(indexed, `${file}: ${node.name?.text}`).toContain(node.name!.text);
        }
        if (exported && ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            expect(indexed, `${file}: ${decl.name.getText()}`).toContain(decl.name.getText());
          }
        }
      });
    }
  });

  it('exports each value as something callable or a constant', () => {
    const values = Object.keys(kit);
    expect(values).toEqual(expect.arrayContaining(['Figure', 'ChartFrame', 'Fact', 'Slider', 'useFigureParams', 'MARK_UNITS']));
    for (const name of values) expect(kit[name as keyof typeof kit], name).toBeDefined();
  });

  it('keeps the file of every hook-using component a client module', () => {
    // The index re-exports across the boundary, so the directive has to stay in each client file.
    // useId is allowed in Server Components, so it does not count.
    const hooks = /\b(?:useState|useEffect|useLayoutEffect|useRef|useCallback|useMemo|useReducer|useSearchParams|useRouter|catchError)\b/;
    for (const file of kitFiles) {
      const text = sourceOf(file);
      const code = text.replace(/\/\/[^\n]*/g, '');
      if (hooks.test(code)) expect(usesDirective(text), `${file} uses a hook or a boundary without 'use client'`).toBe(true);
    }
  });

  it('renders a server component through the index', () => {
    const html = renderToStaticMarkup(<kit.Callout title="Limit">Seeded.</kit.Callout>);
    expect(html).toContain('Limit');
    expect(html).toContain('Seeded.');
  });
});
