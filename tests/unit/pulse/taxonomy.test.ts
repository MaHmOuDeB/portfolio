// The Pulse taxonomy adapter: the seven tracked events of the vendored Pulse export, as the export
// states them. Names, order, the moment each fires, the product question it was designed to answer
// and its property list are copied from the export unchanged, with no field added (no grouping of
// the events, no count of groups). The export file is read from disk here, independently of the
// loader the module uses.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as taxonomyModule from '@/lib/pulse/taxonomy';
import { PULSE_EVENT_NAMES, PULSE_TAXONOMY_REFS, pulseTaxonomy } from '@/lib/pulse/taxonomy';
import { pulse } from '@/lib/sources';

const ROOT = resolve(import.meta.dirname, '../../..');
type SourceEvent = { name: string; fires_when: string; question: string; properties: string[] };
const SOURCE = JSON.parse(readFileSync(join(ROOT, 'data/sources/pulse.json'), 'utf8')) as {
  facts: Record<string, { value: number }>;
  tables: { events: SourceEvent[] };
};
const SOURCE_EVENTS = SOURCE.tables.events;

describe('pulseTaxonomy', () => {
  it('returns the export events exactly: names, order, triggers, questions and property lists', () => {
    expect(pulseTaxonomy()).toEqual(SOURCE_EVENTS);
  });

  it('has as many events as the sourced events fact, and seven in this export', () => {
    expect(pulseTaxonomy()).toHaveLength(SOURCE.facts['events.count']!.value);
    expect(SOURCE_EVENTS).toHaveLength(7);
  });

  it('keeps every row to the export keys: no grouping field or anything else added', () => {
    for (const row of pulseTaxonomy()) {
      expect(Object.keys(row).sort()).toEqual(['fires_when', 'name', 'properties', 'question']);
    }
  });

  it('keeps the questions word for word, predictive wording included', () => {
    expect(pulseTaxonomy().map((r) => r.question)).toEqual(SOURCE_EVENTS.map((e) => e.question));
  });

  it('names the events in a typed list that equals the export, in order', () => {
    expect([...PULSE_EVENT_NAMES]).toEqual(SOURCE_EVENTS.map((e) => e.name));
    expect(pulseTaxonomy().map((r) => r.name)).toEqual([...PULSE_EVENT_NAMES]);
  });

  it('cannot be changed by a caller: rows and property lists are frozen, and each call is fresh', () => {
    const rows = pulseTaxonomy();
    expect(Object.isFrozen(rows)).toBe(true);
    for (const row of rows) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.properties)).toBe(true);
    }
    // The export object itself is not the returned value, so freezing never reaches the loader's copy.
    expect(rows[0]).not.toBe(pulse.tables.events[0]);
    expect(Object.isFrozen(pulse.tables.events[0])).toBe(false);
  });

  it('refuses to load when the export renames, reorders, drops or adds an event', async () => {
    const real = SOURCE_EVENTS;
    const variants: SourceEvent[][] = [
      real.map((e, i) => (i === 1 ? { ...e, name: 'Applied Filters' } : e)),
      [real[1]!, real[0]!, ...real.slice(2)],
      real.slice(0, 6),
      [...real, { ...real[6]!, name: 'Deleted Saved View' }],
    ];
    for (const events of variants) {
      vi.resetModules();
      vi.doMock('@/lib/sources', async (importOriginal) => {
        const actual = await importOriginal<typeof import('@/lib/sources')>();
        return { ...actual, pulse: { ...actual.pulse, tables: { ...actual.pulse.tables, events } } };
      });
      await expect(import('@/lib/pulse/taxonomy')).rejects.toThrow(/not the typed event names/);
      vi.doUnmock('@/lib/sources');
    }
    vi.resetModules();
    await expect(import('@/lib/pulse/taxonomy')).resolves.toBeDefined();
  });

  it('marks the schema as sourced from the Pulse export', () => {
    expect(PULSE_TAXONOMY_REFS).toEqual(['source:pulse']);
  });

  it('exports only the taxonomy, its names and its refs (no grouping or count of its own)', () => {
    expect(Object.keys(taxonomyModule).sort()).toEqual(['PULSE_EVENT_NAMES', 'PULSE_TAXONOMY_REFS', 'pulseTaxonomy']);
  });
});

/** Every import specifier of a module, value or type, static or dynamic. */
function importsOf(file: string): string[] {
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = n.arguments[0];
      out.push(arg && ts.isStringLiteral(arg) ? arg.text : '<non-literal dynamic import>');
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'require') out.push('<require>');
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('the taxonomy module imports', () => {
  it('reads the export only through the one source loader, with nothing else imported', () => {
    expect(importsOf(join(ROOT, 'src/lib/pulse/taxonomy.ts')).sort()).toEqual(['@/components/kit/Derived', '@/lib/sources']);
  });
});
