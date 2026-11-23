// The German Lab and its Figures: the page, the peeking page, the Retention page's planner pair, their
// words, their numbers, their links and their islands. The registry of German pages is mocked with the
// pages these pages link to.
import { renderToString } from 'react-dom/server';
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/audible', '/work/retention', '/work/pulse', '/lab', '/lab/peeking', '/experiment', '/cv', '/contact'],
}));

import { LAB_DE } from '../../../content/de/lab';
import { LAB_EN, type LabCopy } from '../../../content/lab';
import { CurseFigure } from '@/components/lab/CurseFigure';
import { CurseControls } from '@/components/lab/CurseFigureClient';
import { FullPlanner } from '@/components/lab/FullPlanner';
import { DurationControls, LabPlannerControls, SizingControls } from '@/components/lab/FullPlannerControls';
import { LabPage, LabPeekingPage } from '@/components/lab/LabPage';
import { SrmFigure } from '@/components/lab/SrmFigure';
import { SrmControls } from '@/components/lab/SrmFigureClient';
import { PeekingFigure } from '@/components/figures/PeekingFigure';
import { PeekingControls } from '@/components/figures/PeekingFigureClient';
import { PeekingFigureView, peekAnnouncement } from '@/components/figures/PeekingView';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import { fill } from '@/lib/i18n/template';
import { curseResultText, srmResultText } from '@/lib/lab/diagnostics';
import { durationSentence, labPlanSentence, pairedSentence } from '@/lib/lab/full-planner';
import { computePeek } from '@/lib/lab/peeking';
import { looksReadout, looksValueText } from '@/lib/lab/peeking-values';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) =>
  decode(markup.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();

const LAB = withoutCta(renderToString(<LabPage locale="de" />));
const LAB_EN_HTML = withoutCta(renderToString(<LabPage />));
const PEEKING = renderToString(<LabPeekingPage locale="de" />);
const RETENTION_PLANNER = renderToString(<FullPlanner id="winback" durationId="winback-duration" context="retention" locale="de" />);
const LAB_TEXT = text(LAB);

const audit = (html: string, route: string) =>
  auditHtml(`<!doctype html><html lang="de"><head><title>t</title></head><body>${html}</body></html>`, {
    route,
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS_DE,
    denylist: [],
    pages: ['/lab', '/lab/peeking', '/experiment', '/work/audible'],
  });

describe('the German Lab page', () => {
  it('has the English outline and ids, with German headings', () => {
    const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
    expect(ids(LAB)).toEqual(ids(LAB_EN_HTML));
    expect([...LAB.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual([
      'sample-size',
      'split-check',
      'peeking-at-results',
      'exaggeration',
      'limits',
      'lab-close',
    ].filter((id) => id !== 'lab-close'));
    expect([...LAB.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['planner', 'srm', 'peeking', 'curse']);
    const h1 = /<h1 id="lab-title"[^>]*>([\s\S]*?)<\/h1>/.exec(LAB)![1]!;
    expect(text(h1)).toBe('Vier Wege, wie ein A/B-Test in die Irre führen kann, und wie ich jeden erkenne.');
    expect(LAB).toContain('aria-label="Auf dieser Seite"');
    expect(LAB_TEXT).toContain('Die vier Prüfungen');
    expect(LAB_TEXT).toContain('Die Falle');
    expect(LAB_TEXT).toContain('Ausprobieren');
    expect(LAB_TEXT).toContain('Was ich daraus mache');
  });

  it('leaks no English: the kit, the frame, the Figures and the sketches speak German', () => {
    for (const word of [
      'Show the numbers as a table',
      'Reset',
      'Simulated',
      'Public data',
      'On this page',
      'Try it',
      'What I do about it',
      'The trap',
      'Group A',
      'Visitors',
      'Controls need JavaScript',
      'Smaller rises',
      'false winners',
      'Dotted line',
      'Flagged',
      'The four checks',
    ]) {
      expect(LAB_TEXT, word).not.toContain(word);
    }
    for (const word of ['Zahlen als Tabelle anzeigen', 'Zurücksetzen', 'Simuliert', 'Gruppe A', 'Besucher']) expect(LAB_TEXT, word).toContain(word);
    const german = new Set([...LAB.matchAll(/<(h2|h3|p|li|figcaption|summary|dt|dd|legend|label)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]!)));
    const english = [...LAB_EN_HTML.matchAll(/<(h2|h3|p|li|figcaption|summary|dt|dd|legend|label)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]!));
    expect(english.filter((b) => b.length > 24 && german.has(b))).toEqual([]);
  });

  it('prints every number in German, through a fact or a derived value', () => {
    expect(LAB_TEXT).toContain('1.353');
    expect(LAB_TEXT).toMatch(/\d+ %/);
    expect(LAB_TEXT).not.toMatch(/\d%/);
    expect(LAB_TEXT).toMatch(/\d,\d %/);
    expect(audit(LAB, '/de/lab')).toEqual([]);
    expect(audit(PEEKING, '/de/lab/peeking')).toEqual([]);
    expect(audit(RETENTION_PLANNER, '/de/work/retention')).toEqual([]);
  });

  it('sends every internal link to its German twin and keeps the Figures keys on the page', () => {
    const hrefs = [...LAB.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(expect.arrayContaining(['/de/experiment', '/de/work/audible', '/de/lab?srm.preset=even#split-check']));
    for (const h of hrefs) {
      if (h.startsWith('/')) expect(h, h).toMatch(/^\/de(\/|$|\?|#)|^\/contact|^\/cv\.pdf/);
      else expect(h, h).toMatch(/^(\?|#|https:)/);
    }
    expect(hrefs).toEqual(expect.arrayContaining(['?planner.risePoints=2#sample-size', '?peeking.fix=obf#peeking-at-results', '?curse.power=0.8#exaggeration']));
    const peekingHrefs = [...PEEKING.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
    expect(peekingHrefs).toContain('/de/lab');
  });

  it('keeps the Simulated words true: every Figure has the German badge and its table open', () => {
    for (const m of LAB.matchAll(/<figure [^>]*data-figure="([^"]+)"[\s\S]*?<\/figure>/g)) {
      expect(text(m[0]), m[1]).toContain('Simuliert');
      expect(text(m[0]), m[1]).toContain('Zahlen als Tabelle anzeigen');
    }
  });

  it('says nothing the truth rules forbid', () => {
    expect(LAB_TEXT).not.toMatch(/KI-gestützt|KI-basiert|leidenschaftlich|Rockstar|Umsatz|Hörminuten|Abwanderung|Kündigungsrate|[–—]/);
    expect(JSON.stringify(LAB_DE)).not.toMatch(/durchgeführt|entworfen|verantwortet|geleitet|definiert|gleichzeitig/);
  });
});

describe('the German peeking page', () => {
  it('has its own head, the German exhibit and a link back to the Lab', () => {
    const t = text(PEEKING);
    expect(t).toContain('Peeking bei Ergebnissen, warum frühes Prüfen falsche Gewinner findet.');
    expect(t).toContain('Alle Beispiele im Lab');
    expect(t).toContain('Mehr Prüfungen, mehr falsche Gewinner');
    expect(t).not.toContain('All the examples');
    expect([...PEEKING.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['peeking']);
  });
});

describe('the German Retention planner pair', () => {
  const t = text(RETENTION_PLANNER);

  it('draws both Figures in German with customers as the groups and the sourced baseline as a fact', () => {
    expect([...RETENTION_PLANNER.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['winback', 'winback-duration']);
    expect(t).toContain('Kleinere Anstiege brauchen mehr Kunden je Gruppe');
    expect(t).toContain('Je weniger Kunden pro Tag, desto mehr Wochen dauert es, beide Gruppen zu füllen');
    expect(t).toContain('Hypothetischer Anstieg');
    expect(t).toContain('es lief kein Test');
    expect(t).toContain('Kunden je Gruppe');
    expect(t).toContain('Wochen, aufgerundet');
    expect(t).not.toMatch(/Hypothetical|customers|Baseline conversion|weeks/);
    expect(RETENTION_PLANNER).toContain('data-fact="retention.winback.baseline_rate"');
    expect(RETENTION_PLANNER).toContain('data-fact="retention.winback.uplift_pp"');
  });

  it('keeps the control ids the English pair has, so focus hands over', () => {
    for (const id of ['winback-baseline', 'winback-rise', 'winback-mode-absolute', 'winback-mode-relative', 'winback-reset', 'winback-duration-traffic', 'winback-duration-reset']) {
      expect(RETENTION_PLANNER, id).toContain(`id="${id}`);
    }
  });
});

/** The element a server composition hands the client loader, and the island inside it. */
function island(element: unknown): ReactElement<Record<string, unknown>> {
  const loader = element as ReactElement<{ children: ReactElement<Record<string, unknown>> }>;
  return loader.props.children;
}

describe('the islands take their words as props', () => {
  it('hands each island the German words, and the English one nothing', () => {
    const srm = SrmFigure({ locale: 'de' }) as ReactElement<{ text?: { kit: { locale: string } } }>;
    expect(srm.props.text?.kit.locale).toBe('de');
    expect('text' in (SrmFigure() as ReactElement<object>).props).toBe(false);
    const curse = CurseFigure({ locale: 'de' }) as ReactElement<{ text?: { kit: { locale: string } } }>;
    expect(curse.props.text?.kit.locale).toBe('de');
    expect('text' in (CurseFigure() as ReactElement<object>).props).toBe(false);
    const peek = PeekingFigure({ locale: 'de' }) as ReactElement<{ text?: { kit: { locale: string } } }>;
    expect(peek.props.text?.kit.locale).toBe('de');
    expect('text' in (PeekingFigure({}) as ReactElement<object>).props).toBe(false);
    const lab = island(FullPlanner({ locale: 'de' }));
    expect((lab.props.text as { kit: { locale: string } }).kit.locale).toBe('de');
    expect('text' in island(FullPlanner({})).props).toBe(false);
    const pair = island(FullPlanner({ id: 'winback', durationId: 'winback-duration', context: 'retention', locale: 'de' }));
    expect((pair.props.text as { kit: { locale: string } }).kit.locale).toBe('de');
    expect('text' in island(FullPlanner({ id: 'winback', durationId: 'winback-duration', context: 'retention' })).props).toBe(false);
  });

  it('hands the English previews no words either, so the English payload is what it was', () => {
    const preview = (SrmFigure() as ReactElement<{ preview: ReactElement<{ props: Record<string, unknown> }> }>).props.preview;
    expect(isValidElement(preview)).toBe(true);
    const controls = (preview.props as unknown as { controls: ReactElement<Record<string, unknown>> }).controls;
    expect('text' in controls.props).toBe(false);
  });

  it('draws the control rows in German', () => {
    const noop = () => {};
    const srm = text(renderToString(<SrmControls values={{ nA: 5170, nB: 4830 }} onChange={noop} onCommit={noop} onReset={noop} text={LAB_DE.srm} />));
    expect(srm).toContain('Besucher in Gruppe A');
    expect(srm).toContain('Zurücksetzen');
    const curse = text(renderToString(<CurseControls values={{ power: 0.17 }} onChange={noop} onCommit={noop} onReset={noop} text={LAB_DE.curse} />));
    expect(curse).toContain('Wie oft der Test die Schwelle überschreitet');
    expect(curse).toContain('17 % der Fälle');
    const peek = text(renderToString(<PeekingControls id="peeking" values={{ looks: 20, fix: 'naive' }} onLooks={noop} onLooksCommit={noop} onFix={noop} onReset={noop} text={LAB_DE.peek} />));
    expect(peek).toContain('Geprüfte Tage');
    expect(peek).toContain('20 Tage');
    expect(peek).toContain('Keine Korrektur Strengere frühe Prüfungen Immer gültige Prüfung');
    const values = { baseline: 0.29, risePoints: 5, mode: 'relative' as const };
    const sizing = text(
      renderToString(
        <SizingControls id="winback" context="retention" values={values} onBaseline={noop} onBaselineCommit={noop} onRise={noop} onRiseCommit={noop} onMode={noop} onReset={noop} text={LAB_DE.planner} />,
      ),
    );
    expect(sizing).toContain('Ausgangsrate der Konversion');
    expect(sizing).toContain('% des Ausgangswerts');
    expect(sizing).toContain('Prozentpunkten');
    const duration = text(renderToString(<DurationControls id="winback-duration" context="retention" label="Kunden pro Tag insgesamt" traffic={100} onTraffic={noop} onTrafficCommit={noop} onReset={noop} text={LAB_DE.planner} />));
    expect(duration).toContain('100 pro Tag');
    const lab = text(renderToString(<LabPlannerControls id="planner" values={{ baseline: 0.29, risePoints: 5, traffic: 100 }} onBaseline={noop} onBaselineCommit={noop} onRise={noop} onRiseCommit={noop} onTraffic={noop} onTrafficCommit={noop} onReset={noop} text={LAB_DE.planner} />));
    expect(lab).toContain('Plus 5 Prozentpunkte, auf 34 %');
    expect(lab).toContain('Besucher pro Tag');
  });

  it('announces in German', () => {
    const lab = labPlanSentence({ baseline: 0.29, risePoints: 5, traffic: 100 }, LAB_DE.planner);
    expect(lab).toMatch(/^Um einen echten Anstieg von 29\u00a0% auf 34\u00a0% in 8 von 10 Tests zu erkennen, brauchen Sie: 1\.353 Besucher je Gruppe und/);
    expect(lab).toMatch(/je Gruppe und \d+ Wochen?$/);
    const values = { baseline: 0.29, risePoints: 5, mode: 'absolute' as const };
    expect(pairedSentence(values, 100, 'customers', LAB_DE.planner)).toMatch(/^[\d.]+ Kunden je Gruppe, um einen Anstieg um 5 Prozentpunkte nachzuweisen, von 29 % auf 34 %; beide Gruppen sind in \d+ Wochen? gefüllt, bei 100 Kunden pro Tag$/);
    expect(durationSentence(1353, 100, 'visitors', LAB_DE.planner)).toMatch(/^\d+ Wochen? bei 100 Besuchern pro Tag, um 1\.353 Besucher je Gruppe zu erreichen$/);
    // One visitor a day takes the singular in German; English keeps its existing words.
    expect(durationSentence(1353, 1, 'visitors', LAB_DE.planner)).toContain('bei 1 Besucher pro Tag');
    expect(pairedSentence(values, 1, 'visitors', LAB_DE.planner)).toContain('bei 1 Besucher pro Tag');
    expect(durationSentence(1353, 1)).toContain('at 1 visitors a day');
    expect(srmResultText({ nA: 5170, nB: 4830 }, undefined, LAB_DE.srm)).toBe(
      'Markiert: Eine faire Münze erzeugt einen so großen oder größeren Abstand in weniger als 1 von 1.000 Fällen.',
    );
    expect(srmResultText({ nA: 0, nB: 0 }, undefined, LAB_DE.srm)).toBe('Noch keine Besucher, also gibt es nichts zu prüfen.');
    expect(srmResultText({ nA: 3, nB: 1 }, undefined, LAB_DE.srm)).toContain('Bei so wenigen Besuchern ist diese Prüfung nur grob.');
    expect(curseResultText({ power: 0.17 }, undefined, LAB_DE.curse)).toMatch(/^Bei dieser Einstellung liegen Ergebnisse, die die Schwelle überschreiten, im Schnitt beim \d,\d-Fachen des echten Effekts\. Davon zeigen [\d,]+ % in die falsche Richtung\.$/);
    expect(curseResultText({ power: 0.99 }, undefined, LAB_DE.curse)).toContain('unter 0,1 %');
    const view = computePeek({ looks: 20, mode: 'daily', fix: 'naive' }, LAB_DE.peek.table);
    expect(peekAnnouncement(view, LAB_DE.peek)).toMatch(/^Bei täglicher Auswertung über 20 Tage hinweg fanden \d+,\d % von [\d.]+ Tests einen falschen Gewinner\. Einmal am Ende geprüft, wären es etwa 5 %\.$/);
    expect(looksValueText(1, LAB_DE.peek)).toBe('1 Tag, 100 Besucher je Gruppe');
    expect(looksValueText(20, LAB_DE.peek)).toBe('20 Tage, 2.000 Besucher je Gruppe bis zum letzten Tag');
    expect(looksReadout(1, LAB_DE.peek)).toBe('1 Tag');
  });

  it('renders every peeking case in German with no placeholder left and no English', () => {
    const noop = () => {};
    for (const looks of [1, 2, 20, 50]) {
      for (const fix of ['naive', 'obf', 'cs'] as const) {
        for (const mode of ['daily', 'once'] as const) {
          const view = computePeek({ looks, mode, fix }, LAB_DE.peek.table);
          const html = renderToString(
            <PeekingFigureView id="peeking" view={view} text={LAB_DE.peek} controls={<PeekingControls id="peeking" values={{ looks, fix }} onLooks={noop} onLooksCommit={noop} onFix={noop} onReset={noop} text={LAB_DE.peek} />} />,
          );
          const t = text(html);
          const label = `${looks} ${fix} ${mode}`;
          expect(t, label).not.toMatch(/[{}]/);
          expect(t, label).not.toMatch(/false winner|checks?\b|visitors per group|Dotted|daily/);
          expect(peekAnnouncement(view, LAB_DE.peek), label).not.toMatch(/[{}]/);
        }
      }
    }
  });
});

describe('the copy', () => {
  const holes = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const slotsOf = (s: readonly (string | { slot: string })[]) => s.flatMap((p) => (typeof p === 'string' ? holes(p).map((h) => `{${h}}`) : [p.slot])).sort();
  const isSentence = (v: unknown): v is readonly (string | { slot: string })[] => Array.isArray(v) && v.some((p) => typeof p === 'object' && p !== null && 'slot' in p);

  /** Every leaf of the copy with its path: a string, a sentence or a list of strings. */
  function leaves(value: unknown, path = ''): [string, unknown][] {
    if (typeof value === 'string' || isSentence(value)) return [[path, value]];
    if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
    return value === null ? [[path, null]] : [];
  }
  const german = new Map(leaves(LAB_DE as LabCopy));

  it('has every English path, with the same placeholders and slots', () => {
    for (const [path, en] of leaves(LAB_EN)) {
      const de = german.get(path);
      expect(de, path).not.toBeUndefined();
      if (en === null) expect(de, path).toBeNull();
      else if (typeof en === 'string') expect(holes(de as string), path).toEqual(holes(en));
      else expect(slotsOf(de as never), path).toEqual(slotsOf(en as never));
    }
    expect(german.size).toBe(leaves(LAB_EN).length);
  });

  it('translates every sentence: none is the English one', () => {
    for (const [path, en] of leaves(LAB_EN)) {
      if (typeof en !== 'string' || en.length < 12 || !en.includes(' ') || en.replace(/\{\w+\}/g, '').trim().length < 3) continue;
      expect(german.get(path), path).not.toBe(en);
    }
  });

  it('is plain data the server can hand to a client: no function, no element', () => {
    for (const part of [LAB_DE.planner, LAB_DE.srm, LAB_DE.curse, LAB_DE.peek]) {
      expect(JSON.stringify(part)).not.toContain('undefined');
      expect(() => structuredClone(part)).not.toThrow();
    }
  });

  it('fills the templates', () => {
    expect(fill(LAB_DE.planner.points.other, { n: '5' })).toBe('5 Prozentpunkte');
    expect(fill(LAB_DE.planner.perGroup, { noun: 'Kunden' })).toBe('Kunden je Gruppe');
    expect(fill(LAB_DE.peek.chart.name.fixOne, { method: LAB_DE.peek.chart.name.methods.cs })).toContain('mit der immer gültigen Prüfung');
  });
});
