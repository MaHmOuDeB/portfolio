// Rounding and provenance checks on the Retention tables and prose that the shape tests do not
// cover: a share column prints whole percents, so every share fact behind one must be a
// zero-decimal fact; each printed RFM customer share is the true share of the counts, not a
// double-rounded copy; and every derived number in the prose is a value of the export it names, or
// one of the listed constants of the source code.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RetentionChecks, RetentionLimits, RetentionMethod, RetentionSources, RetentionSummary } from '../../../content/retention';
import type { TableData } from '@/components/kit/DataTable';
import { FACTS, formatValue, getFact, type FactId } from '@/lib/facts';
import { RETAIL, RETENTION, sourceRepo } from '@/lib/retention/data';
import { cohortTable, holdoutTable, modelsTable, returnsTable, rfmTable, targetingTable } from '@/lib/retention/tables';

const TABLES: readonly [string, () => TableData][] = [
  ['returns raw', () => returnsTable('raw')],
  ['returns clean', () => returnsTable('clean')],
  ['cohorts', cohortTable],
  ['rfm', rfmTable],
  ['models', modelsTable],
  ['targeting', targetingTable],
  ['holdout', holdoutTable],
];

const isFact = (ref: string): ref is FactId => Object.hasOwn(FACTS, ref);

describe('share columns', () => {
  it.each(TABLES)('%s: every share fact behind a share column is a zero-decimal fact', (_, build) => {
    const t = build();
    if (!t.formats?.includes('share')) return;
    for (const ref of t.refs.filter(isFact)) {
      const fact = getFact(ref);
      if (fact.unit === 'share') expect(fact.decimals, ref).toBe(0);
    }
  });

  it('at least one table with a share column cites a share fact, so the check above is exercised', () => {
    const cited = TABLES.flatMap(([, build]) => {
      const t = build();
      return t.formats?.includes('share') ? t.refs.filter(isFact).filter((r) => getFact(r).unit === 'share') : [];
    });
    expect(cited.length).toBeGreaterThan(0);
  });

  it('prints each RFM customer share as the true share of the counts, never a double-rounded copy', () => {
    const t = rfmTable();
    const total = t.rows.reduce((sum, row) => sum + (row[1] as number), 0);
    expect(total).toBe(RETENTION.tables.rfm_segments.reduce((sum, s) => sum + s.customers, 0));
    for (const row of t.rows) {
      expect(formatValue(row[2] as number, 'share'), String(row[0])).toBe(formatValue((row[1] as number) / total, 'share'));
    }
  });
});

// Constants of the source code that the exports do not carry, per source: the reversal window
// (sql/01_clean.sql in both repositories), the label and lapse window, the Champions scores, the
// sizing's significance level and power, and the bootstrap interval's level (src/analysis.py).
const CODE_CONSTANTS: Record<string, readonly (number | string)[]> = {
  'source:retail': [24],
  'source:retention': [24, 90, 4, 5, 0.05, 0.8, 0.95],
};

function leafValues(x: unknown, out = new Set<string>()): Set<string> {
  if (x !== null && typeof x === 'object') for (const v of Object.values(x)) leafValues(v, out);
  else out.add(String(x));
  return out;
}
const EXPORT_VALUES: Record<string, Set<string>> = {
  'source:retail': leafValues(RETAIL),
  'source:retention': leafValues(RETENTION),
};

const SECTIONS: readonly (() => ReactNode)[] = [RetentionSummary, RetentionMethod, RetentionChecks, RetentionLimits, RetentionSources];
const html = SECTIONS.map((S) => renderToStaticMarkup(<S />)).join('\n');
type DerivedNode = { tag: string; value: string | undefined; refs: string[]; text: string };

function parseDerived(markup: string): DerivedNode[] {
  return [...markup.matchAll(/<(\w+)([^>]*?)\sdata-derived="([^"]*)"[^>]*>([^<]*)</g)].map((m) => ({
    tag: m[1]!,
    value: /value="([^"]*)"/.exec(m[2]!)?.[1],
    refs: m[3]!.split(' '),
    text: m[4]!,
  }));
}

/** The text a value should print as, from the unit and decimals its own text shows. */
function expectedText(value: string, text: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatValue(value, 'date');
  const decimals = /\.(\d+)/.exec(text)?.[1]?.length ?? 0;
  return formatValue(Number(value), text.endsWith('%') ? 'share' : 'count', { decimals });
}

/** Each derived node that is not a value of a source it names, a listed constant or arithmetic on its facts, or whose text is another number. */
function unexplained(nodes: readonly DerivedNode[]): string[] {
  const out: string[] = [];
  for (const d of nodes) {
    const sources = d.refs.filter((r) => r.startsWith('source:'));
    const facts = d.refs.filter(isFact);
    const label = `[${d.refs.join(' ')}]`;
    if (d.tag === 'data' && d.value !== undefined) {
      const fromSource = sources.some((s) => EXPORT_VALUES[s]?.has(d.value!) || CODE_CONSTANTS[s]?.some((c) => String(c) === d.value));
      // The target rate: the baseline plus the rise, in whole points.
      const fromFacts =
        facts.length === 2 &&
        facts.includes('retention.winback.baseline_rate') &&
        facts.includes('retention.winback.uplift_pp') &&
        Number(d.value) === Math.round((getFact('retention.winback.baseline_rate').value as number) * 100 + (getFact('retention.winback.uplift_pp').value as number)) / 100;
      if (!fromSource && !fromFacts) out.push(`${d.value} ${label}`);
      else if (expectedText(d.value, d.text) !== d.text) out.push(`${d.value} printed as ${d.text} ${label}`);
    } else if (d.tag === 'code') {
      const id = sources[0]?.slice('source:'.length) as 'retention' | 'retail' | undefined;
      if (!id || !sourceRepo(id).commit.startsWith(d.text)) out.push(`${d.text} ${label}`);
    } else if (!sources.some((s) => EXPORT_VALUES[s]?.has(d.text))) {
      out.push(`${d.text} ${label}`);
    }
  }
  return out;
}

const derived = parseDerived(html);

describe('derived numbers in the Retention prose', () => {
  it('finds the derived numbers it checks', () => {
    expect(derived.length).toBeGreaterThan(15);
  });

  it('names public-data sources only: no simulated, live or build ref, and no fact of another source', () => {
    for (const d of derived) {
      for (const ref of d.refs) {
        if (isFact(ref)) expect(['retention', 'retail'], ref).toContain(getFact(ref).source);
        else expect(['source:retention', 'source:retail'], ref).toContain(ref);
      }
    }
  });

  it('each value is a value of a source it names, a listed code constant, or arithmetic on the facts it names, printed as itself', () => {
    expect(unexplained(derived)).toEqual([]);
  });

  it('would catch an untraced number, and a value printed as another number, through the same check', () => {
    expect(unexplained(parseDerived('<data value="0.123" data-derived="source:retention">12%</data>'))).toEqual(['0.123 [source:retention]']);
    // 0.29 is a real export value, so only the displayed text gives it away.
    expect(unexplained(parseDerived('<data value="0.29" data-derived="source:retention">35%</data>'))).toEqual(['0.29 printed as 35% [source:retention]']);
    expect(unexplained(parseDerived('<data value="0.29" data-derived="source:retention">29%</data>'))).toEqual([]);
    expect(unexplained(parseDerived('<code data-derived="source:retail">abcdef0</code>'))).toEqual(['abcdef0 [source:retail]']);
  });
});
