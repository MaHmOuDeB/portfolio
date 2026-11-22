// The German Retention page: its words, its numbers, its links and its islands. The planner is the Lab's
// (a stub stands in for it), and the registry of German pages is mocked with the pages this page links to.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/audible', '/work/retention', '/work/pulse', '/lab', '/experiment', '/cv', '/contact'],
}));

import { RETENTION_DE } from '../../../content/de/retention';
import { RETENTION_EN, RETENTION_SECTION_IDS, blocks, slotsFor, type RetentionCopy } from '../../../content/retention';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { RetentionPage } from '@/components/retention/RetentionPage';
import { ReturnsControls } from '@/components/retention/ReturnsFigureClient';
import { CohortControls } from '@/components/retention/CohortFigureClient';
import { cohortResultText } from '@/components/retention/CohortView';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import { fill } from '@/lib/i18n/template';
import { COHORTS, RETAIL } from '@/lib/retention/data';
import { cohortSpan, cohortTableFrom, monthLabel } from '@/lib/retention/cohorts';
import { comparisonPeriod, returnsPlotRows, returnsTableFrom } from '@/lib/retention/returns';
import { holdoutTable, modelsTable } from '@/lib/retention/tables';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';

const STUB = <div data-test-planner="">planner</div>;
const DE = withoutCta(renderToStaticMarkup(<RetentionPage locale="de" planner={STUB} />));
const EN = withoutCta(renderToStaticMarkup(<RetentionPage locale="en" planner={STUB} />));

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(').trim();
const DE_TEXT = text(DE).replace(/­/g, '');
const blocksOf = (markup: string) => [...markup.matchAll(/<(h2|h3|p|li|figcaption|summary)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]!));
const section = (markup: string, id: string) => {
  const start = markup.indexOf(`<section id="${id}"`);
  if (start < 0) throw new Error(`no section ${id}`);
  return markup.slice(start, markup.indexOf('</section>', start));
};

describe('the German page', () => {
  it('has the same outline as the English one, with the English ids and German headings', () => {
    expect([...DE.matchAll(/<section id="([^"]+)" aria-labelledby/g)].map((m) => m[1])).toEqual([...RETENTION_SECTION_IDS]);
    const h1 = /<h1 id="retention-title"[^>]*>([\s\S]*?)<\/h1>/.exec(DE)![1]!;
    expect(text(h1).replace(/­/g, '')).toBe('Wer erneut bestellt, und wie sich ein Rückgewinnungsangebot testen lässt.');
    expect([...DE.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['returns', 'cohorts', 'models', 'rfm']);
    expect(DE).toContain('aria-label="Auf dieser Seite"');
    expect(DE).toContain('aria-label="Weitere Projekte"');
    expect(DE).toContain('aria-label="Auf einen Blick"');
  });

  it('keeps every element id and every anchor the English page has', () => {
    const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
    expect(ids(DE)).toEqual(ids(EN));
  });

  it('leaks no English sentence', () => {
    // Sentences that are the same in both languages: the dataset, the SQL, repository names, code.
    const same = /UCI Online Retail II|ROC AUC|CC BY|DuckDB|scikit-learn|SQL|GitHub|Pulse|Audible|Champions|Dormant|Loyal|Occasional|At risk|New \/ recent/;
    const german = new Set(blocksOf(DE));
    const leaks = blocksOf(EN).filter((b) => b.length > 24 && german.has(b) && !same.test(b));
    expect(leaks).toEqual([]);
    for (const word of ['Show the numbers as a table', 'Reset', 'Public data', 'Simulated', 'On this page', 'What to look at', 'What it means']) {
      expect(DE_TEXT, word).not.toContain(word);
    }
  });

  it('prints every number in German, through a fact or a derived value', () => {
    expect(DE_TEXT).toContain('1.353');
    expect(DE_TEXT).toMatch(/\d+ %/);
    expect(DE_TEXT).not.toMatch(/\d%/);
    expect(auditHtml(`<!doctype html><html lang="de"><head><title>t</title></head><body>${DE}</body></html>`, {
      route: '/de/work/retention',
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS_DE,
      denylist: [],
      pages: ['/work/retention', '/work/audible', '/work/pulse', '/lab'],
    })).toEqual([]);
  });

  it('sends every internal link to its German twin', () => {
    const hrefs = [...DE.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
    const internal = hrefs.filter((h) => h.startsWith('/'));
    expect(internal).toEqual(expect.arrayContaining(['/de/lab#sample-size', '/de/work/audible', '/de/work/pulse']));
    for (const h of internal) expect(h, h).toMatch(/^\/de(\/|$|#)|^\/cv\.pdf|^\/contact|^\/de$/);
  });

  it('badges the Figures in German and names the sizing a dimensioning, never a design or a run', () => {
    for (const id of ['returns', 'cohorts', 'rfm', 'models']) {
      const figure = new RegExp(`<figure [^>]*data-figure="${id}"[\\s\\S]*?</figure>`).exec(DE)![0];
      expect(text(figure), id).toContain('Öffentliche Daten');
    }
    expect(DE_TEXT).toContain('Ich habe einen möglichen Holdout-Test dimensioniert.');
    expect(DE_TEXT).toContain('Öffentlicher Datensatz, 2026 aus meinen Masterprojekten neu aufgebaut.');
    expect(DE_TEXT).not.toMatch(/\bich (habe|hab)\b[^.]*(durchgeführt|entworfen)[^.]*(Test|Holdout|Rückgewinnung)/i);
    expect(DE_TEXT).not.toMatch(/KI-gestützt|KI-basiert|leidenschaftlich|Rockstar|Umsatz|[–—]/);
  });

  it('states each rate with its period and whom it is of', () => {
    expect(text(section(DE, 'cohort-retention'))).toContain('im zwölften Monat nach ihrer ersten Bestellung');
    expect(DE_TEXT).toContain('Von Januar bis November 2011'.replace('Von', 'von'));
    expect(DE_TEXT).toContain('Jan. bis Nov. 2011 gegenüber Jan. bis Nov. 2010');
    expect(DE_TEXT).toContain('Kohorten von Januar bis November 2010');
    expect(DE_TEXT).toContain('Im Zehntel der Kunden mit den niedrigsten Scores');
  });

  it('keeps the quoted SQL, the dataset name and the segment names as they are', () => {
    expect(DE).toContain('CREATE OR REPLACE TABLE reversed_pairs AS');
    expect(DE_TEXT).toContain('UCI Online Retail II');
    expect(DE_TEXT).toContain('At risk (were frequent)');
  });
});

describe('the copy', () => {
  it('has every English key (the type checks it) and as many list entries as the English', () => {
    const lens = (c: RetentionCopy) => [c.methodSteps.steps.length, c.cleaning.length, c.checks.length, c.limits.length];
    expect(lens(RETENTION_DE)).toEqual(lens(RETENTION_EN));
    expect(RETENTION_DE.checks.map(([k]) => k)).toEqual(RETENTION_EN.checks.map(([k]) => k));
    expect(RETENTION_DE.limits.map(([k]) => k)).toEqual(RETENTION_EN.limits.map(([k]) => k));
  });

  it('keeps every template placeholder the English templates have', () => {
    const holes = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(holes(RETENTION_DE.cohortsFigure.annotation)).toEqual(holes(RETENTION_EN.cohortsFigure.annotation));
    expect(holes(RETENTION_DE.cohortsFigure.aria.heat)).toEqual(holes(RETENTION_EN.cohortsFigure.aria.heat));
    expect(holes(RETENTION_DE.cohortsFigure.aria.line)).toEqual(holes(RETENTION_EN.cohortsFigure.aria.line));
    const slots = (s: readonly (string | { slot: string })[]) => s.flatMap((p) => (typeof p === 'string' ? [] : [p.slot])).sort();
    for (const mode of ['raw', 'clean'] as const) {
      expect(slots(RETENTION_DE.returns.lead[mode])).toEqual(slots(RETENTION_EN.returns.lead[mode]));
      expect(slots(RETENTION_DE.returns.reversal[mode])).toEqual(slots(RETENTION_EN.returns.reversal[mode]));
    }
    expect(slots(RETENTION_DE.returns.caption)).toEqual(slots(RETENTION_EN.returns.caption));
    expect(slots(RETENTION_DE.cohortsFigure.result)).toEqual(slots(RETENTION_EN.cohortsFigure.result));
    expect(slots(RETENTION_DE.cohortsFigure.caption)).toEqual(slots(RETENTION_EN.cohortsFigure.caption));
  });

  it('renders the German blocks without throwing', () => {
    const b = blocks(RETENTION_DE, slotsFor('de'));
    for (const part of [b.intro, b.method, b.methodSteps, b.checks, b.limits, b.sources, b.sqlExcerpt, b.winBackReach, b.targeting, b.close]) {
      expect(renderToStaticMarkup(<>{part()}</>).length).toBeGreaterThan(20);
    }
  });
});

describe('the islands take their words as props', () => {
  const returns = RETENTION_DE.returns;
  const cohorts = RETENTION_DE.cohortsFigure;

  it('draws the controls in German', () => {
    const r = renderToStaticMarkup(<ReturnsControls mode="clean" onMode={() => {}} onReset={() => {}} text={returns} />);
    expect(text(r)).toContain('Rückabgewickelte Bestellungen Als Retouren gezählt Entfernt Zurücksetzen');
    const c = renderToStaticMarkup(<CohortControls rows={COHORTS} cohort="2010-01" onCohort={() => {}} onReset={() => {}} text={cohorts} />);
    expect(text(c)).toContain('Kohorte: Jan. 2010');
    expect(text(c)).toContain('Zurück');
    expect(text(c)).toContain('1 von 11');
    expect(text(c)).toContain('Zurücksetzen');
  });

  it('builds the tables, the announcements and the periods in German', () => {
    const t = returnsTableFrom(returnsPlotRows(RETAIL.tables.monthly), 'clean', returns);
    expect(t.columns).toEqual(['Monat', 'Retourenwert (GBP)', 'Unvollständiger Monat']);
    expect(t.rows.at(-1)![2]).toBe('Ja');
    expect(comparisonPeriod(returnsPlotRows(RETAIL.tables.monthly), { locale: 'de', words: returns.period })).toBe(
      'Jan. bis Nov. 2011 gegenüber Jan. bis Nov. 2010',
    );
    expect(cohortTableFrom(COHORTS, cohorts).columns.slice(0, 4)).toEqual(['Kohorte', 'Kunden', 'Monat der ersten Bestellung', 'Monat eins']);
    expect(cohortSpan(COHORTS, { locale: 'de', words: cohorts.span })).toBe('Januar bis November 2010');
    expect(monthLabel('2010-03', 'de')).toBe('März 2010');
    const row = COHORTS[0]!;
    expect(cohortResultText(row, cohorts)).toMatch(/^Im Monat nach ihrer ersten Bestellung haben \d+(,\d+)?\u00A0% der Kohorte Jan\. 2010 \(\d[\d.]* Kunden\) erneut bestellt; im zwölften Monat danach waren es \d+(,\d+)?\u00A0%\.$/);
    expect(fill(cohorts.annotation, { name: 'Jan. 2010' })).toBe('Kohorte Jan. 2010');
  });

  it('gives the kit slice German words and no function', () => {
    expect(returns.kit.locale).toBe('de');
    expect(returns.kit.reset).toBe(KIT_TEXT_DE.reset);
    expect(JSON.stringify(returns)).not.toContain('undefined');
    expect(() => structuredClone(returns)).not.toThrow();
    expect(() => structuredClone(cohorts)).not.toThrow();
  });

  it('labels the sourced tables in German and maps the export keys', () => {
    expect(holdoutTable(RETENTION_DE.tables).rows.map((r) => r[0])).toEqual([
      'Alle abgewanderten Kunden',
      'Alle abgewanderten Kunden',
      'Alle abgewanderten Kunden',
      'Die obersten 20 % der abgewanderten Kunden nach Score',
      'Die obersten 20 % der abgewanderten Kunden nach Score',
      'Die obersten 20 % der abgewanderten Kunden nach Score',
    ].map((s) => s.replace('20 %', '20 %')));
    expect(modelsTable(RETENTION_DE.tables).rows.map((r) => r[0])).toEqual([
      'Ausgangsregel: zuletzt aktive Käufer zuerst',
      'Logistische Regression',
      'Gradient Boosting',
    ]);
  });
});
