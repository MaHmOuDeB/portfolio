// The German Pulse case study and its dashboard Figure: the page, its words, its numbers, its links,
// its truth rules and its island. The event names, their properties and the event table's rows are the
// export's own and stay English. The registry of German pages is mocked with the pages it links to.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/audible', '/work/retention', '/work/pulse', '/work/weather', '/lab', '/lab/peeking', '/experiment', '/cv', '/contact'],
}));

import GermanPulseRoute, { metadata } from '@/app/de/work/pulse/page';
import { PulseFigure } from '@/components/pulse/PulseFigure';
import { InertPulseControls, PulseControls } from '@/components/pulse/PulseFigureClient';
import { PulsePage } from '@/components/pulse/PulsePage';
import { PulseFigureView, PulseStream } from '@/components/pulse/PulseView';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import { fill } from '@/lib/i18n/template';
import { messagesFor, pulseMessages } from '@/lib/pulse/announce';
import { PULSE_PRESETS, channelPhrase, dashboardTable } from '@/lib/pulse/dashboard';
import { PULSE_EVENT_NAMES } from '@/lib/pulse/names';
import { pulseEvents } from '@/lib/pulse/session';
import { EN_PULSE } from '@/lib/pulse/text';
import { PULSE_DE } from '../../../content/de/pulse';
import { PULSE_EN, PULSE_SECTION_IDS, type PulseCopy } from '../../../content/pulse';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';

const repo = join(import.meta.dirname, '../../..');
const SOURCE = JSON.parse(readFileSync(join(repo, 'data/sources/pulse.json'), 'utf8')) as {
  tables: { events: { name: string; fires_when: string; question: string; properties: string[] }[] };
};

const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) =>
  decode(markup.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)])/g, '$1')
    .replace(/\( /g, '(')
    .trim();

const DE = withoutCta(renderToString(<PulsePage locale="de" />));
const EN = withoutCta(renderToString(<PulsePage />));
const DE_TEXT = text(DE);
const view = PULSE_PRESETS.default;

describe('the German Pulse page', () => {
  it('has the English outline and ids, with German headings', () => {
    const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
    expect(ids(DE)).toEqual(ids(EN));
    expect([...DE.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual([...PULSE_SECTION_IDS]);
    expect([...DE.matchAll(/data-figure="([^"]+)"/g)].map((m) => m[1])).toEqual(['pulse']);
    const h1 = /<h1 id="pulse-page-title"[^>]*>([\s\S]*?)<\/h1>/.exec(DE)![1]!;
    expect(text(h1)).toBe('7 Ereignisse, jedes entworfen, um eine Produktfrage zu beantworten');
    expect(DE).toContain('aria-label="Auf dieser Seite"');
    expect(DE).toContain('aria-label="Weitere Projekte"');
    for (const id of PULSE_SECTION_IDS) expect(DE_TEXT, id).toContain(PULSE_DE.sections[id].title);
    expect(DE_TEXT).toContain('Worauf Sie achten sollten');
    expect(DE_TEXT).toContain('Was das bedeutet');
  });

  it('leaks no English outside the export: the frame, the kit, the Figure and every sentence speak German', () => {
    for (const word of [
      'Show the numbers as a table',
      'Controls need JavaScript',
      'On this page',
      'At a glance',
      'What to look at',
      'More work',
      'Reset',
      'Simulated',
      'Date range',
      'All channels',
      'Save view',
      'Events sent',
      'Day of the range',
      'No events yet',
      'Showing',
    ]) {
      expect(DE_TEXT, word).not.toContain(word);
    }
    const blocksOf = (markup: string) => [...markup.matchAll(/<(h2|h3|p|li|figcaption|summary|dt|dd|legend|label)\b[^>]*>([\s\S]*?)<\/\1>/g)].map((m) => text(m[2]!));
    const german = new Set(blocksOf(DE));
    // Tool names are the same in both languages.
    expect(blocksOf(EN).filter((b) => b.length > 24 && b !== PULSE_EN.glance.tools && german.has(b))).toEqual([]);
  });

  it('marks every cell of the event table as English, since the export words are English, and no header', () => {
    const table = /<table id="pulse-events"[\s\S]*?<\/table>/.exec(DE)![0];
    const cells = table.match(/<td[^>]*>/g)!;
    expect(cells).toHaveLength(SOURCE.tables.events.length * 4);
    for (const cell of cells) expect(cell).toContain('lang="en"');
    expect(table).not.toMatch(/<th[^>]*lang=/);
    expect(/<table id="pulse-events"[\s\S]*?<\/table>/.exec(EN)![0]).not.toContain('lang=');
  });

  it('keeps the event table word for word from the export, with German column names', () => {
    const table = /<table id="pulse-events"[\s\S]*?<\/table>/.exec(DE)![0];
    const t = text(table);
    for (const e of SOURCE.tables.events) {
      expect(t, e.name).toContain(e.name);
      expect(t, e.name).toContain(e.fires_when);
      for (const p of e.properties) expect(t, p).toContain(p);
    }
    expect(t).toContain('Ereignis');
    expect(t).toContain('Wird ausgelöst, wenn');
    expect(t).not.toContain('Fires when');
  });

  it('prints every number in German, through a fact or a derived value', () => {
    expect(DE_TEXT).toContain('Angezeigt: alle Kanäle, Zeitraum 30d');
    const audit = auditHtml(`<!doctype html><html lang="de"><head><title>t</title></head><body>${DE}</body></html>`, {
      route: '/de/work/pulse',
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS_DE,
      denylist: [],
      pages: ['/work/pulse'],
    });
    expect(audit).toEqual([]);
  });

  it('sends every internal link to its German twin', () => {
    const hrefs = [...DE.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);
    expect(hrefs).toEqual(expect.arrayContaining(['/de/work/retention', '/de/work/weather', '/de/lab']));
    for (const h of hrefs) {
      if (h.startsWith('/')) expect(h, h).toMatch(/^\/de(\/|$|\?|#)|^\/contact|^\/cv\.pdf/);
      else expect(h, h).toMatch(/^(\?|#|https:)/);
    }
  });

  it('keeps the truth rules in German', () => {
    expect(DE_TEXT).toContain('entworfen und gebaut');
    expect(DE_TEXT).toContain('Keine echten Anwender');
    expect(DE_TEXT).toContain('nicht das Amplitude-Tracking');
    expect(JSON.stringify(PULSE_DE)).not.toMatch(/Nutzer|im Einsatz|Ergebnis-Kennzahl|[–—]/);
    expect(DE_TEXT).not.toMatch(/KI-gestützt|KI-basiert|leidenschaftlich|Rockstar/);
  });

  it('has German metadata', () => {
    expect(String(metadata.title)).toContain('Pulse');
    expect(isValidElement(GermanPulseRoute())).toBe(true);
  });
});

describe('the German dashboard Figure', () => {
  const noop = () => {};

  it('hands the island the German words, and the English one nothing', () => {
    const de = PulseFigure({ locale: 'de' }) as ReactElement<{ text?: { kit: { locale: string } } }>;
    expect(de.props.text?.kit.locale).toBe('de');
    expect('text' in (PulseFigure() as ReactElement<object>).props).toBe(false);
  });

  it('draws the control row in German and keeps the ids and the source labels', () => {
    const html = renderToString(<PulseControls view={view} onChannel={noop} onRange={noop} onReset={noop} text={PULSE_DE.figure} />);
    const t = text(html);
    expect(t).toContain('Kanal');
    expect(t).toContain('Alle Kanäle E-Mail Suche Social Media');
    expect(t).toContain('Zeitraum');
    expect(t).toContain('7d 30d 90d');
    expect(t).toContain('Zurücksetzen');
    expect(html).toContain('id="pulse-reset"');
    expect(html).toContain('value="all"');
    expect(html).toContain('value="search"');
  });

  it('draws the stream with English event names and German words around them', () => {
    const stream = [
      { seq: 2, event: pulseEvents.appliedFilter('email') },
      { seq: 1, event: pulseEvents.viewedDashboard() },
    ];
    const html = renderToString(<PulseStream stream={stream} text={PULSE_DE.figure} />);
    const t = text(html);
    expect(t).toContain('Gesendete Ereignisse');
    expect(t).toContain('Applied Filter');
    expect(t).toContain('filter_type: channel');
    expect(t).toContain('value: email');
    expect(t).toContain('prompt_version: demo-v1');
    expect(t).not.toContain('Events sent');
    expect(t).toContain('Die letzten 20 Ereignisse');
    const empty = text(renderToString(<PulseStream text={PULSE_DE.figure} />));
    expect(empty).toContain('Noch keine Ereignisse. Viewed Dashboard kommt an');
  });

  it('draws the open dashboard in German with the detail, the saved view and the table', () => {
    const handlers = { onDetail: noop, onExport: noop, onSave: noop, onLoad: noop };
    const html = renderToString(
      <PulseFigureView
        view={{ channel: 'social', range: '7d' }}
        saved={view}
        detail="sign_ups"
        handlers={handlers}
        text={PULSE_DE.figure}
        controls={<InertPulseControls view={view} text={PULSE_DE.figure} />}
      />,
    );
    const t = text(html);
    expect(t).toContain('Angezeigt: Social Media, Zeitraum 7d.');
    expect(t).toContain('Details');
    expect(t).toContain('CSV exportieren Ansicht speichern Gespeicherte Ansicht laden');
    expect(t).toContain('Gespeicherte Ansicht: Alle Kanäle, Zeitraum 30d.');
    expect(t).toMatch(/Im Zeitraum: [\d.]+ insgesamt und [\d.]+ am aktivsten Tag, Tag \d+\./);
    expect(html).toContain('aria-label="Details: Anmeldungen"');
    expect(html).toContain('Erfundene Anmeldungen pro Tag für Social Media, im gewählten Zeitraum');
    expect(t).toContain('Simuliert');
    expect(t).toContain('Zahlen als Tabelle anzeigen');
    expect(dashboardTable(view, PULSE_DE.figure).columns).toEqual(['Tag', 'Anmeldungen', 'Gestartete Testphasen']);
    expect(dashboardTable(view).columns).toEqual(['Day', 'Sign-ups', 'Trials started']);
  });

  it('announces in German with the event names in English, and in English by default', () => {
    const m = messagesFor(PULSE_DE.figure);
    expect(m.filter('all')).toBe('Applied Filter gesendet. Angezeigt: alle Kanäle.');
    expect(m.range('7d')).toBe('Changed Date Range gesendet. Angezeigt: Zeitraum 7d.');
    expect(m.detail('trials_started')).toBe('Viewed Chart Detail gesendet. Details geöffnet: Gestartete Testphasen.');
    expect(m.saved(view)).toBe('Saved View gesendet. Die gespeicherte Ansicht zeigt alle Kanäle, Zeitraum 30d.');
    expect(m.loaded({ channel: 'search', range: '90d' })).toBe('Loaded Saved View gesendet. Angezeigt: Suche, Zeitraum 90d.');
    expect(m.reset()).toBe('Dashboard zurückgesetzt. Viewed Dashboard gesendet.');
    expect(pulseMessages.filter('social')).toBe('Applied Filter sent. Showing Social.');
    expect(pulseMessages.saved(view)).toBe('Saved View sent. The saved view is all channels over the last 30d.');
    expect(channelPhrase('email')).toBe('Email');
    expect(PULSE_EVENT_NAMES).toContain('Viewed Dashboard');
    expect(PULSE_DE.figure.messages.reset).toContain('Viewed Dashboard');
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
  const german = new Map(leaves(PULSE_DE as PulseCopy));
  // The frame labels are empty in English (each part's own default applies) and German in German.
  const english = leaves(PULSE_EN).filter(([path]) => !path.startsWith('.frame'));
  // Names and labels that are the same in both languages.
  const SAME = new Set(['.sections.dashboard.link', '.figure.dashboard.title', '.glance.tools', '.taxonomy.table.columns[0]']);

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
      if (typeof en !== 'string' || en.length < 12 || !en.includes(' ') || SAME.has(path)) continue;
      expect(german.get(path), path).not.toBe(en);
    }
  });

  it('is plain data for the island: no function, no element', () => {
    expect(() => structuredClone(PULSE_DE.figure)).not.toThrow();
    expect(JSON.stringify(PULSE_DE.figure)).not.toContain('undefined');
  });

  it('fills the templates', () => {
    expect(fill(PULSE_DE.figure.axis.y, { chart: 'Anmeldungen' })).toBe('Anmeldungen pro Tag');
    expect(fill(PULSE_DE.figure.chartName, { chart: 'Anmeldungen', channel: 'alle Kanäle' })).toContain('Erfundene Anmeldungen pro Tag für alle Kanäle');
    expect(fill(EN_PULSE.chartName, { chart: 'sign-ups', channel: 'all channels' })).toBe('Made-up sign-ups per day for all channels, over the chosen range');
  });
});
