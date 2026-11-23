// The four German build notes (Weather, n8n, MarketingWS, Docproof): the English outline and ids, German
// words everywhere the frame and the pages print any, the Facts and their numbers, the links, the
// recorded run and the check names that stay as captured, and the truth words. The registry of German
// pages is mocked with the pages these notes link to.
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/pulse', '/work/weather', '/work/docproof', '/work/n8n', '/work/marketingws', '/experiment', '/cv', '/contact'],
}));

import { BUILD_NOTE_TEXT_DE } from '../../../content/de/build-notes';
import { DOCPROOF_DE } from '../../../content/de/docproof';
import { MARKETINGWS_DE } from '../../../content/de/marketingws';
import { N8N_DE } from '../../../content/de/n8n';
import { WEATHER_DE } from '../../../content/de/weather';
import { VERIFY_RUN } from '../../../content/docproof';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { N8nPage } from '@/components/n8n/N8nPage';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { NOTE_SHOTS } from '@/components/build-notes/note-shots';
import { FACTS, FACT_DISPLAYS_DE } from '@/lib/facts';
import weatherJson from '../../../data/sources/weather.json';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { withoutCta } from '../page-cta';
import { decode, section, text } from './helpers';

const PAGES = {
  weather: { route: '/work/weather', en: withoutCta(renderToString(<WeatherPage />)), de: withoutCta(renderToString(<WeatherPage locale="de" />)) },
  n8n: { route: '/work/n8n', en: withoutCta(renderToString(<N8nPage />)), de: withoutCta(renderToString(<N8nPage locale="de" />)) },
  marketingws: {
    route: '/work/marketingws',
    en: withoutCta(renderToString(<MarketingwsPage />)),
    de: withoutCta(renderToString(<MarketingwsPage locale="de" />)),
  },
  docproof: { route: '/work/docproof', en: withoutCta(renderToString(<DocproofPage />)), de: withoutCta(renderToString(<DocproofPage locale="de" />)) },
} as const;
const NAMES = Object.keys(PAGES) as (keyof typeof PAGES)[];

const ids = (m: string) => [...m.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]).sort();
const facts = (m: string) => [...m.matchAll(/data-fact="([^"]+)"/g)].map((x) => x[1]);
/** The page's visible text, without the recorded blocks that stay as captured. */
const prose = (m: string) => text(m.replace(/<pre[\s\S]*?<\/pre>/g, ' '));

describe('every German build note', () => {
  it.each(NAMES)('%s: has the English ids, sections and Facts, with German headings', (name) => {
    const { en, de } = PAGES[name];
    expect(ids(de)).toEqual(ids(en));
    expect([...de.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1])).toEqual([...en.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]));
    expect(facts(de)).toEqual(facts(en));
    expect(de).toContain('aria-label="Auf dieser Seite"');
    expect(de).toContain('aria-label="Weitere Projekte"');
    expect(de).toContain('aria-label="Auf einen Blick"');
    expect(prose(de)).toContain('Projektnotiz');
    expect(prose(de)).toContain('Was das über meine Arbeitsweise zeigt');
    expect([...de.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => decode(m[1]!))).toContain('Quellen und Links');
  });

  it.each(NAMES)('%s: leaks no English from the frame, the kit or the page', (name) => {
    const words = prose(PAGES[name].de);
    for (const w of [
      'Build note',
      'On this page',
      'More work',
      'At a glance',
      'Key figures',
      'What to look at',
      'What it means',
      'See the code on GitHub',
      'How I checked this',
      'Sources and links',
      'What this shows about how I work',
      'The problem',
      'Previous',
      'Screenshot of',
      'Show the numbers as a table',
      'Find out what I can do',
      'Read my CV',
      'Write to me',
    ]) {
      expect(words, w).not.toContain(w);
    }
    expect(PAGES[name].de).not.toContain('>Next<');
  });

  it.each(NAMES)('%s: every internal link stays in German, or is on the pass-through list', (name) => {
    const hrefs = [...PAGES[name].de.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => decode(m[1]!));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) {
      if (!h.startsWith('/') || h.startsWith('/#')) continue;
      expect(h.startsWith('/de') || h.startsWith('/cv.pdf') || h.startsWith('/images/') || h.startsWith('#'), h).toBe(true);
    }
  });

  it.each(NAMES)('%s: passes the truth audit with German displays', (name) => {
    const html = `<!doctype html><html lang="de"><head><title>t</title></head><body>${PAGES[name].de}</body></html>`;
    const result = auditHtml(html, {
      route: PAGES[name].route,
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS_DE,
      denylist: [],
      pages: ['/work', '/work/pulse', '/work/weather', '/work/docproof', '/work/n8n', '/work/marketingws', '/experiment'],
    });
    expect(result).toEqual([]);
  });

  it.each(NAMES)('%s: uses none of the truth-rule words', (name) => {
    const words = prose(PAGES[name].de);
    for (const bad of ['KI-gestützt', 'KI-basiert', 'leidenschaftlich', 'Rockstar', 'Bewerbung', 'Lebenslauf', 'Jobsuche', 'im Einsatz', 'produktiv', 'eingesetzt', 'Kunde', 'Rechnungsvolumen', 'definiert']) {
      expect(words, bad).not.toContain(bad);
    }
  });

  it('links the neighbouring notes in German with their German names', () => {
    expect(PAGES.weather.de).toContain('href="/de/work/pulse"');
    expect(PAGES.weather.de).toContain('href="/de/work/docproof"');
    expect(PAGES.marketingws.de).toContain('href="/de/experiment"');
    expect(prose(PAGES.marketingws.de)).toContain('Der Live-Test');
    expect(PAGES.docproof.de).toContain('href="/de/work"');
  });
});

describe('the screenshots', () => {
  it('translate their alt text and captions and keep their files and sizes', () => {
    for (const key of Object.keys(NOTE_SHOTS) as (keyof typeof NOTE_SHOTS)[]) {
      const de = BUILD_NOTE_TEXT_DE.shots[key];
      expect(de.alt).not.toBe(NOTE_SHOTS[key].alt);
      expect(de.caption).not.toBe(NOTE_SHOTS[key].caption);
      expect(Boolean(de.label)).toBe(Boolean(NOTE_SHOTS[key].fullSize));
    }
    const m = PAGES.marketingws.de;
    expect(m).toContain('src="/images/notes/marketingws-brief-light.png"');
    expect(decode(m)).toContain(BUILD_NOTE_TEXT_DE.shots.marketingwsBrief.alt);
    expect(prose(m)).toContain('Bild in voller Größe: der erste Entwurf');
    expect(prose(PAGES.n8n.de)).toContain('Bild in voller Größe: die Workflow-Fläche');
    expect(PAGES.weather.de).toContain('<figure data-note-shot="weatherChecks"');
  });
});

describe('what stays English', () => {
  it('Docproof: the recorded run is printed as captured, marked as English, with German labels around it', () => {
    const run = section(PAGES.docproof.de, 'how-i-checked-this');
    const blocks = [...run.matchAll(/<pre[^>]*lang="en"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => decode(m[1]!.replace(/<[^>]+>/g, '')));
    expect(blocks).toEqual([VERIFY_RUN!.factBase, VERIFY_RUN!.document.join('\n'), `$ ${VERIFY_RUN!.command}\n${VERIFY_RUN!.output}`]);
    expect(prose(run)).toContain('Die Faktenbasis');
    expect(prose(run)).toContain('Aufgezeichnet am 12.11.2026 mit Docproof am Commit b817cb1');
    expect(PAGES.docproof.en).not.toContain('lang="en"');
    // The two numbers of the run are the run's own, marked as build values.
    expect(run).toMatch(/nennt <span data-derived="build">4<\/span> Abende/);
  });

  it('Weather: the check levels are German words and no check name or row is printed', () => {
    const table = text(/<table[\s\S]*?<\/table>/.exec(PAGES.weather.de)![0]);
    expect(table).toContain('Stufe Prüfungen Wenn eine fehlschlägt');
    expect(table).toContain('Fehler');
    expect(table).toContain('Warnung');
    for (const c of weatherJson.tables.checks) expect(prose(PAGES.weather.de)).not.toContain(c.name);
    expect(prose(PAGES.weather.de)).toContain('Öffentliche Daten');
  });

  it('MarketingWS: copy variants are "Textvarianten", never experiments, and the Groq note stands beside the demo', () => {
    const words = prose(PAGES.marketingws.de);
    expect(words).toContain('Textvarianten');
    expect(words).not.toMatch(/Experiment|A\/B/);
    expect(PAGES.marketingws.de).toContain('<p data-demo-note="">Die Live-Demo hängt vom kostenlosen Kontingent von Groq ab.</p>');
  });

  it('n8n: the h1 carries its soft hyphen for narrow screens', () => {
    expect(PAGES.n8n.de).toContain('Fehler\u00ADbenachrichtigungen');
  });

  it('n8n: the test count is a Fact and the project is no client work', () => {
    const words = prose(PAGES.n8n.de);
    expect(PAGES.n8n.de).toContain('data-fact="profile.n8n.automated_tests"');
    expect(words).toContain('Kein Auftraggeber und kein Echtbetrieb');
    expect(words).toContain('Eingang von E-Rechnungen');
  });
});

describe('the German copy types', () => {
  it('are complete: every copy object has the English object’s keys', async () => {
    const { WEATHER_EN } = await import('../../../content/weather');
    const { N8N_EN } = await import('../../../content/n8n');
    const { MARKETINGWS_EN } = await import('../../../content/marketingws');
    const { DOCPROOF_EN } = await import('../../../content/docproof');
    expect(Object.keys(WEATHER_DE).sort()).toEqual(Object.keys(WEATHER_EN).sort());
    expect(Object.keys(N8N_DE).sort()).toEqual(Object.keys(N8N_EN).sort());
    expect(Object.keys(MARKETINGWS_DE).sort()).toEqual(Object.keys(MARKETINGWS_EN).sort());
    expect(Object.keys(DOCPROOF_DE).sort()).toEqual(Object.keys(DOCPROOF_EN).sort());
    expect(DOCPROOF_DE.run.labels).not.toEqual(DOCPROOF_EN.run.labels);
  });
});
