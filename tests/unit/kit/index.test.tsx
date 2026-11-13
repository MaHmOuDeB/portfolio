import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as kit from '@/components/kit';
import * as kitClient from '@/components/kit/client';
import { KIT_DIR, entryExportNames, entryModules, exportedNames, hasUseClient } from '../kit-exports';

const sourceOf = (name: string) => readFileSync(join(KIT_DIR, name), 'utf8');
const kitFiles = readdirSync(KIT_DIR).filter((f) => /\.tsx?$/.test(f) && f !== 'index.ts' && f !== 'client.ts');
const fileOf = (specifier: string) => kitFiles.find((f) => f.replace(/\.tsx?$/, '') === specifier.replace('./', ''))!;
const clientFiles = kitFiles.filter((f) => hasUseClient(sourceOf(f)));

describe('exportedNames', () => {
  it('reads declarations, classes, clauses, aliases, type exports and default exports', () => {
    const text = `
      export function a() {}
      export class B {}
      export const c = 1, d = 2;
      export type E = string;
      export interface F {}
      export enum G { X }
      export { h, i as j };
      export { k } from './k';
      export type { L } from './l';
      export default function () {}
      const unexported = 1;
    `;
    expect(exportedNames(text)).toEqual(['a', 'B', 'c', 'd', 'E', 'F', 'G', 'h', 'j', 'k', 'L', 'default']);
    expect(exportedNames('const x = 1; export default x;')).toEqual(['default']);
  });
});

describe('the kit entry points', () => {
  it('has client files to split off', () => {
    expect(clientFiles.length).toBeGreaterThanOrEqual(7);
  });

  it('are not client modules themselves, so a Server Component can import either', () => {
    expect(hasUseClient(sourceOf('index.ts'))).toBe(false);
    expect(hasUseClient(sourceOf('client.ts'))).toBe(false);
    // The detector sees a real directive.
    expect(hasUseClient(sourceOf('Slider.tsx'))).toBe(true);
  });

  it('give every export of every kit file to exactly one entry point', () => {
    const index = entryExportNames('index');
    const client = entryExportNames('client');
    expect(index.filter((n) => client.includes(n)), 'exported by both').toEqual([]);
    expect(new Set(index).size, 'duplicate in index').toBe(index.length);
    expect(new Set(client).size, 'duplicate in client').toBe(client.length);
    for (const file of kitFiles) {
      const names = exportedNames(sourceOf(file));
      expect(names, `${file} has a default export, which no entry point can name`).not.toContain('default');
      for (const name of names) {
        expect(index.includes(name) || client.includes(name), `${file}: ${name} is in neither index.ts nor client.ts`).toBe(true);
      }
    }
  });

  it('index re-exports only from modules that are not client modules', () => {
    for (const specifier of entryModules('index')) {
      expect(clientFiles, `index.ts re-exports from the client module ${specifier}`).not.toContain(fileOf(specifier));
    }
  });

  it('client re-exports only from client modules', () => {
    for (const specifier of entryModules('client')) {
      expect(clientFiles, `client.ts re-exports from ${specifier}, which has no 'use client'`).toContain(fileOf(specifier));
    }
  });

  it('keep the client modules out of index: only Figure (its error boundary) and TextArea (its live counter) import one', () => {
    const importers = kitFiles.filter((f) => {
      const text = sourceOf(f);
      return clientFiles.some((c) => {
        const base = c.replace(/\.tsx?$/, '');
        return new RegExp(`from '\\./${base}'`).test(text);
      }) && !hasUseClient(text);
    });
    expect(importers).toEqual(['Figure.tsx', 'TextArea.tsx']);
  });

  it('exports each value as defined', () => {
    for (const entry of [kit, kitClient]) {
      for (const [name, value] of Object.entries(entry)) expect(value, name).toBeDefined();
    }
    expect(Object.keys(kit)).toEqual(expect.arrayContaining(['Figure', 'ChartFrame', 'Fact', 'Callout', 'MARK_UNITS']));
    expect(Object.keys(kitClient)).toEqual(
      expect.arrayContaining(['Slider', 'Segmented', 'ResetButton', 'StepNav', 'LoadOnIntent', 'FigureErrorBoundary', 'useFigureParams']),
    );
    expect(Object.keys(kit)).not.toContain('Slider');
  });

  it('keeps the file of every hook-using component a client module', () => {
    // The entry points re-export across the boundary, so the directive has to stay in each client
    // file. useId is allowed in Server Components, so it does not count.
    const hooks = /\b(?:useState|useEffect|useLayoutEffect|useRef|useCallback|useMemo|useReducer|useSearchParams|useRouter|catchError)\b/;
    for (const file of kitFiles) {
      const text = sourceOf(file);
      const code = text.replace(/\/\/[^\n]*/g, '');
      if (hooks.test(code)) expect(hasUseClient(text), `${file} uses a hook or a boundary without 'use client'`).toBe(true);
    }
  });

  it('renders a server component through the index', () => {
    const html = renderToStaticMarkup(<kit.Callout title="Limit">Seeded.</kit.Callout>);
    expect(html).toContain('Limit');
    expect(html).toContain('Seeded.');
  });
});
