// The German Audible case study and its ship-rule Figure: the page, its words, its numbers, its links,
// its truth rules and its island. The registry of German pages is mocked with the pages it links to.
import { renderToString } from 'react-dom/server';
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/audible', '/work/retention', '/work/pulse', '/lab', '/lab/peeking', '/experiment', '/cv', '/contact'],
}));

import GermanAudibleRoute, { metadata } from '@/app/de/work/audible/page';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { FrameworkFigure } from '@/components/audible/FrameworkFigure';
import { FrameworkControls } from '@/components/audible/FrameworkFigureClient';
import { FrameworkResult, frameworkAnnouncement, frameworkTable } from '@/components/audible/FrameworkView';
import { FRAMEWORK_DEFAULTS, type FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID } from '@/lib/audible/framework-url';
import { EN_FRAMEWORK } from '@/lib/audible/text';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import { fill } from '@/lib/i18n/template';
import { AUDIBLE_DE } from '../../../content/de/audible';
import { AUDIBLE_EN, AUDIBLE_SECTION_IDS, type AudibleCopy } from '../../../content/audible';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) =>
  decode(markup.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();

const DE = withoutCta(renderToString(<AudiblePage locale="de" />));
const EN = withoutCta(renderToString(<AudiblePage />));
const DE_TEXT = text(DE);
const values: FrameworkValues = { primaryLower: FRAMEWORK_DEFAULTS.primaryLower, primaryUpper: FRAMEWORK_DEFAULTS.primaryUpper, guardrailUpper: FRAMEWORK_DEFAULTS.guardrailUpper };

describe('the German Audible page', () => {
  it('has the English outline and ids, with German headings', () => {
    const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
    expect(ids(DE)).toEqual(ids(EN));
    expect([...DE.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual([...AUDIBLE_SECTION_IDS]);
    expect([...DE.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['framework']);
    const h1 = /<h1 id="audible-title"[^>]*>([\s\S]*?)<\/h1>/.exec(DE)![1]!;
    expect(text(h1)).toBe('25+ A/B-Tests bei Audible (Amazon), vom Plan bis zur Empfehlung.');
    expect(DE).toContain('aria-label="Auf dieser Seite"');
    expect(DE).toContain('aria-label="Auf einen Blick"');
    expect(DE_TEXT).toContain('Worauf Sie achten sollten');
    expect(DE_TEXT).toContain('Was das bedeutet');
    expect(DE_TEXT).toContain('Was das über meine Arbeitsweise zeigt');
    expect(DE).toContain('aria-label="Weitere Projekte"');
    for (const id of AUDIBLE_SECTION_IDS) expect(DE_TEXT, id).toContain(AUDIBLE_DE.sections[id].title);
  });

  it('leaks no English: the frame, the kit, the Figure and every sentence of the page speak German', () => {
    for (const word of [
      'Show the numbers as a table',
      'Controls need JavaScript',
      'On this page',
      'At a glance',
      'Key figures',
      'What to look at',
      'More work',
      'Reset',
      'exact value',
      'Simulated',
      'percentage points',
      'Session completion',
      'Help requests',
      'guardrail',
      'Why so many were adopted',
    ]) {
      expect(DE_TEXT, word).not.toContain(word);
    }
    const blocksOf = (markup: string) => [...markup.matchAll(/<(h2|h3|p|li|figcaption|summary|dt|dd|legend|label)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]!));
    const german = new Set(blocksOf(DE));
    expect(blocksOf(EN).filter((b) => b.length > 24 && german.has(b))).toEqual([]);
  });

  it('prints every number in German, through a fact or a derived value', () => {
    expect(DE_TEXT).toContain('etwa 85 %');
    expect(DE_TEXT).toContain('+1,0 Prozentpunkte');
    expect(DE_TEXT).not.toMatch(/\d%/);
    const audit = auditHtml(`<!doctype html><html lang="de"><head><title>t</title></head><body>${DE}</body></html>`, {
      route: '/de/work/audible',
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS_DE,
      denylist: [],
      pages: ['/work/audible'],
    });
    expect(audit).toEqual([]);
  });

  it('sends every internal link to its German twin', () => {
    const hrefs = [...DE.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(expect.arrayContaining(['/de/work/retention', '/de/lab', '/de/experiment', '#why-so-many']));
    for (const h of hrefs) {
      if (h.startsWith('/')) expect(h, h).toMatch(/^\/de(\/|$|\?|#)|^\/contact|^\/cv\.pdf/);
      else expect(h, h).toMatch(/^(\?|#|https:)/);
    }
  });

  it('keeps the truth rules in German', () => {
    expect(DE_TEXT).toContain('Tampermonkey mit einem Schritt-Rekorder');
    expect(DE_TEXT.replace(/Tampermonkey mit einem Schritt-Rekorder/g, '')).not.toContain('Tampermonkey');
    expect(DE_TEXT).toContain('nacheinander mit 3 Teams gearbeitet');
    expect(DE_TEXT).toContain('Warum so viele?');
    expect(DE).toContain('href="#why-so-many"');
    // The test count and the market count never share a sentence.
    for (const sentence of DE_TEXT.split(/(?<=[.;:])\s/)) expect(/25\+/.test(sentence) && /\b11\b/.test(sentence), sentence).toBe(false);
    // Team verbs only; the metric frameworks were the teams' own; the automation tool was mine.
    expect(JSON.stringify(AUDIBLE_DE)).not.toMatch(/verantwortet|geleitet|definiert|gleichzeitig|[–—]/);
    expect(JSON.stringify([AUDIBLE_DE.teamsFirst, AUDIBLE_DE.teamsRest])).not.toMatch(/festgelegt|aufgestellt|entwickelt/);
    expect(DE_TEXT).toContain('mitgewirkt');
    expect(DE_TEXT).toContain('Werkstudent');
    expect(DE_TEXT).not.toMatch(/KI-gestützt|KI-basiert|leidenschaftlich|Rockstar/);
    // The demo names nothing from the job: the Figure speaks of Chapter Club only.
    const figure = /<figure [^>]*data-figure="framework"[\s\S]*?<\/figure>/.exec(DE)![0];
    expect(text(figure)).not.toMatch(/Umsatz|Hörminuten|Churn|ILTV|Abwanderung|Kündigung/);
    expect(figure).toContain('Simuliert');
    expect(text(figure)).toContain('Zahlen als Tabelle anzeigen');
  });

  it('has German metadata', () => {
    expect(String(metadata.title)).toContain('Audible');
    expect(String(metadata.description)).toContain('Werkstudent');
    expect(isValidElement(GermanAudibleRoute())).toBe(true);
  });
});

describe('the German ship-rule Figure', () => {
  const noop = () => {};

  it('hands the island the German words, and the English one nothing', () => {
    const de = FrameworkFigure({ locale: 'de' }) as ReactElement<{ text?: { kit: { locale: string } } }>;
    expect(de.props.text?.kit.locale).toBe('de');
    expect('text' in (FrameworkFigure() as ReactElement<object>).props).toBe(false);
    const loaderEn = (FrameworkFigure() as ReactElement<{ preview: ReactElement<{ controls: ReactElement<Record<string, unknown>> }> }>).props.preview;
    expect('text' in loaderEn.props.controls.props && loaderEn.props.controls.props.text !== undefined).toBe(false);
  });

  it('keeps the control ids and the URL keys the English Figure has', () => {
    const html = renderToString(<FrameworkControls values={values} onBound={noop} onCommit={noop} onReset={noop} text={AUDIBLE_DE.framework} />);
    for (const key of ['lower', 'upper', 'guardrail']) expect(html, key).toContain(`id="${FRAMEWORK_ID}-${key}`);
    const t = text(html);
    expect(t).toContain('Sitzungsabschluss, unteres Ende');
    expect(t).toContain('+1,0 Prozentpunkte, niedrigste plausible Veränderung');
    expect(t).toContain('Zurücksetzen');
    expect(t).toContain('genauer Wert');
    expect(html).toContain('value="1.0"');
  });

  it('words each of the four decisions in German, so a swap of two fails', () => {
    const cases: [FrameworkValues, string, string][] = [
      [values, 'ship', 'Ausrollen'],
      [{ primaryLower: -1, primaryUpper: 3, guardrailUpper: 1 }, 'ship-neutral', 'Darf ausgerollt werden'],
      [{ primaryLower: -4, primaryUpper: -1, guardrailUpper: 1 }, 'harm', 'Stopp'],
      [{ primaryLower: 1, primaryUpper: 4, guardrailUpper: 5 }, 'hold', 'Zurückhalten'],
    ];
    for (const [v, decision, word] of cases) {
      const html = renderToString(<FrameworkResult values={v} text={AUDIBLE_DE.framework} />);
      expect(html, decision).toContain(`data-framework-decision="${decision}"`);
      expect(text(html), decision).toContain(`${word}: `);
      expect(text(html).startsWith(word), decision).toBe(true);
    }
  });

  it('announces and tabulates in German, and in English by default', () => {
    expect(frameworkAnnouncement(values, AUDIBLE_DE.framework)).toBe(
      'Ausrollen: Die Hauptmetrik ist gestiegen, die Guardrail-Metrik ist intakt. Sitzungsabschluss: +1,0 bis +4,0 Prozentpunkte; Hilfeanfragen: höchstens +1,0 Prozentpunkte, bei einer Grenze von +2.',
    );
    expect(frameworkAnnouncement(values)).toBe(
      'Ship: the main metric rose, guardrail intact. Session completion: +1.0 to +4.0 points; help requests: at most +1.0 points, against a limit of +2.',
    );
    expect(frameworkTable(values, AUDIBLE_DE.framework).columns).toEqual(['Wert', 'Punkte']);
    expect(frameworkTable(values).columns).toEqual(['Bound', 'Points']);
  });
});

describe('the copy', () => {
  const holes = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const slotsOf = (s: readonly (string | { slot: string })[]) => s.flatMap((p) => (typeof p === 'string' ? holes(p).map((h) => `{${h}}`) : [p.slot])).sort();
  const isSentence = (v: unknown): v is readonly (string | { slot: string })[] => Array.isArray(v) && v.some((p) => typeof p === 'object' && p !== null && 'slot' in p);

  /** Every leaf of the copy with its path: a string, or a sentence. */
  function leaves(value: unknown, path = ''): [string, unknown][] {
    if (typeof value === 'string' || isSentence(value)) return [[path, value]];
    if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => leaves(v, `${path}.${k}`));
    return [];
  }
  const german = new Map(leaves(AUDIBLE_DE as AudibleCopy));
  // The frame labels are empty in English (each part's own default applies) and German in German.
  const english = leaves(AUDIBLE_EN).filter(([path]) => !path.startsWith('.frame'));

  it('has every English path, with the same placeholders and slots', () => {
    for (const [path, en] of english) {
      const de = german.get(path);
      expect(de, path).not.toBeUndefined();
      if (typeof en === 'string') expect(holes(de as string), path).toEqual(holes(en));
      else expect(slotsOf(de as never), path).toEqual(slotsOf(en as never));
    }
  });

  it('translates every sentence: none is the English one', () => {
    for (const [path, en] of english) {
      if (typeof en !== 'string' || en.length < 12 || !en.includes(' ')) continue;
      // The made-up product and the team names are names, not sentences.
      expect(german.get(path), path).not.toBe(en);
    }
  });

  it('is plain data for the island: no function, no element', () => {
    expect(() => structuredClone(AUDIBLE_DE.framework)).not.toThrow();
    expect(JSON.stringify(AUDIBLE_DE.framework)).not.toContain('undefined');
  });

  it('fills the templates', () => {
    expect(fill(AUDIBLE_DE.framework.valueText, { value: '+1,0' })).toBe('+1,0 Prozentpunkte');
    expect(fill(AUDIBLE_DE.framework.readout, { value: '+1,0', hint: 'x' })).toBe('+1,0 Prozentpunkte, x');
    expect(fill(AUDIBLE_DE.framework.limit, { value: '+2' })).toBe('Grenze +2');
    expect(fill(EN_FRAMEWORK.limit, { value: '+2' })).toBe('Limit +2');
  });
});
