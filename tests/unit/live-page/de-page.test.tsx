// The German Live test page: the words, the links, the numbers, the isolation from the experiment and
// the regeneration budget. The registry of German pages is mocked with the pages this page links to.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n/pages', () => ({
  DE_PAGES: ['/', '/work', '/work/retention', '/lab', '/experiment', '/cv', '/contact'],
}));

import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS_DE } from '../../../src/lib/facts/facts.generated.ts';
import { CTA_DE } from '../../../content/de/home';
import { FRAME_DE } from '../../../content/de/frame';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { LIVE_DE } from '../../../content/de/live';
import { LIVE_EN, type LiveCopy } from '../../../content/live';
import { DE_LIVE_REVALIDATE_SECONDS, LivePage } from '@/components/live-page/LivePage';
import { StateExplanation, reasonIn } from '@/components/live-page/StateExplanation';
import { stateWords } from '@/components/live-page/StatusCard';
import { STOP_REASONS_EN, stopReasonKey } from '@/lib/experiment/reasons';
import { LIVE_PAGE_FIXTURES } from '@/lib/live-page/fixtures';
import { FIXTURE_CALIBRATION, snapshotFixture } from '@/lib/home/fixtures';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';

const ROOT = resolve(import.meta.dirname, '../../..');
const RUNTIMES = [undefined, 'no-js', 'error'] as const;

const page = (d: LivePageDisplay, o: { locale?: 'en' | 'de'; runtime?: (typeof RUNTIMES)[number]; host?: string | null } = {}) =>
  renderToStaticMarkup(<LivePage display={d} host={o.host === undefined ? 'site.example' : o.host} runtime={o.runtime} locale={o.locale ?? 'de'} />);
const doc = (markup: string) => `<!doctype html><html lang="de"><head><title>t</title></head><body>${markup}</body></html>`;
const audit = (markup: string) =>
  auditHtml(doc(markup), {
    route: '/de/experiment',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS_DE,
    denylist: [],
    pages: ['/', '/work', '/work/retention', '/lab', '/experiment', '/cv', '/contact'],
  });
const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim();
const hrefs = (html: string) => [...html.matchAll(/<a [^>]*?href="([^"]*)"/g)].map((m) => m[1]!);

/** Every string leaf of a copy value (functions are not walked). */
function leaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) leaves(v, out);
  else if (value !== null && typeof value === 'object') for (const v of Object.values(value)) leaves(v, out);
  return out;
}
/** The shape of a copy value: its keys, with the kind of each leaf. */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return 'fn';
  if (typeof value === 'string') return 'str';
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  return typeof value;
}

describe('the regeneration budget', () => {
  const route = readFileSync(join(ROOT, 'src/app/de/experiment/page.tsx'), 'utf8');

  it('writes the literal Next needs, equal to the constant beside the other live-page constants', () => {
    expect(DE_LIVE_REVALIDATE_SECONDS).toBe(600);
    const literal = /export const revalidate = (\d+);/.exec(route);
    expect(literal).not.toBeNull();
    expect(Number(literal![1])).toBe(DE_LIVE_REVALIDATE_SECONDS);
  });

  it('reads one snapshot, projects it, and renders in German with no beacon, query or client code', () => {
    expect(route.match(/getExperimentSnapshot\(/g)).toHaveLength(1);
    expect(route).toContain('toLivePageDisplay(toLivePageModel(await getExperimentSnapshot()');
    expect(route).toContain('locale="de"');
    expect(route).toContain("seoEntryFor('de', '/experiment')");
    expect(route).not.toMatch(/searchParams|cookies\(|headers\(|Beacon|beacon\(|setInterval|'use client'|lib\/home\/model|PhaseLabel|TestNote/);
  });
});

describe('the German copy', () => {
  it('has the same keys as the English copy, and the same function or string at every leaf', () => {
    expect(shape(LIVE_DE)).toEqual(shape(LIVE_EN));
  });

  it('types a Template placeholder once in each next-step sentence, and keeps the reasons keyed as the data keeps them', () => {
    for (const key of ['restart', 'abStart'] as const) {
      expect(LIVE_DE.next[key].split('{date}'), key).toHaveLength(2);
      expect(LIVE_EN.next[key].split('{date}'), key).toHaveLength(2);
    }
    expect(Object.keys(LIVE_DE.reasons).sort()).toEqual(Object.keys(STOP_REASONS_EN).sort());
    expect(LIVE_EN.reasons).toBe(STOP_REASONS_EN);
  });

  it('holds no digit and no English sentence in a German string', () => {
    const german = leaves(LIVE_DE);
    expect(german.filter((s) => /\d/.test(s))).toEqual([]);
    // A single word can be the same in both languages ("Status"); a sentence cannot.
    const english = new Set(leaves(LIVE_EN).filter((s) => /\s/.test(s.trim())));
    expect(german.filter((s) => english.has(s))).toEqual([]);
  });

  it('keeps the words of the German kit where the page sits beside the kit', () => {
    expect(LIVE_DE.results.xLabel).toBe(KIT_TEXT_DE.confidence.xLabel);
    expect(LIVE_DE.results.yLabel).toBe(KIT_TEXT_DE.confidence.yLabel);
    expect(LIVE_DE.state.calibrating).toBe(KIT_TEXT_DE.live.calibrating);
  });
});

describe.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('the German page in %s', (_id, display) => {
  const d = display();
  const en = RUNTIMES.map((r) => plain(page(d, { locale: 'en', runtime: r }))).join(' ');

  it.each(RUNTIMES.map((r) => [r ?? 'default', r] as const))('%s: audits clean on /de/experiment, with no placeholder and no double dot', (_name, runtime) => {
    const h = page(d, { runtime });
    expect(audit(h)).toEqual([]);
    expect(h).not.toContain('{date}');
    expect(h).not.toContain('{group}');
    const text = plain(h);
    expect(text).not.toMatch(/\.\.(?!\.)/);
    expect(text).not.toMatch(/Ihr Aufruf|Sie sind in Gruppe|Diese Seite zeigt Gruppe/);
    expect(h).not.toContain('data-your-view');
    expect(h).not.toContain('data-experiment');
  });

  it('prints no English: no three-word run of the English page appears in the German one', () => {
    const words = (t: string) => t.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    // The owner's own pause or stop note has no German twin and stays as he wrote it (marked as English).
    const notes = [d.paused?.reason, d.aaFailed?.reason].filter((r): r is string => r !== undefined && stopReasonKey(r) === null);
    const withoutNotes = notes.reduce((t, n) => t.replace(n.replace(/[.\s]+$/, ''), ' '), plain(page(d)));
    const german = ` ${words(withoutNotes).join(' ')} `;
    const runs = new Set<string>();
    const e = words(en);
    for (let i = 0; i + 3 < e.length; i += 1) runs.add(e.slice(i, i + 4).join(' '));
    // What the page quotes as written stays: the commands it shows, the hash, the signal's own name.
    const QUOTED = /\b(curl|verify|experiment|prereg|scripts|python|json|silent|fail|tag|hash|https|site|example)\b|deeceff|^[a-f ]+$|do not track|b minus a|a b test/;
    const leaked = [...runs].filter((r) => german.includes(` ${r} `) && !QUOTED.test(r));
    expect(leaked).toEqual([]);
  });

  it('keeps every internal link in German, and only the data file, the repository and LinkedIn outside', () => {
    for (const h of hrefs(page(d))) {
      if (h.startsWith('https://')) expect(h).toMatch(/^https:\/\/(github\.com|www\.linkedin\.com)\//);
      else if (h === '/experiment/data.json' || h.startsWith('#')) continue;
      else expect(h, h).toMatch(/^\/de(\/|#|$)/);
    }
  });

  it('prints every date as a German <time>: dd.mm. with its trailing dot', () => {
    const times = [...page(d).matchAll(/<time [^>]*>([^<]*)<\/time>/g)].map((m) => m[1]!);
    for (const t of times) expect(t).toMatch(/^(Aktualisiert )?\d{2}:\d{2}$|^\d{2}\.\d{2}\.(\d{4})?$/);
  });
});

describe('the German page as a whole', () => {
  const d = LIVE_PAGE_FIXTURES.find((f) => f.id === 'ab')!.display();
  const h = page(d);
  const text = plain(h);

  it('says its title, its chip and its sections in German, once', () => {
    expect(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)![1]!.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')).toBe('Ein echter A/B-Test auf dieser Website, offen durchgeführt.');
    const h2 = [...h.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => plain(m[1]!));
    expect(h2).toEqual([
      'Wo der Test steht',
      'Ergebnis bisher',
      'Der Plan, vor dem Start festgelegt',
      'Ist der Test in Ordnung?',
      'Wie Aufrufe gezählt werden',
      'Selbst nachprüfen',
      FRAME_DE.pageClose,
      `${CTA_DE.title} ${CTA_DE.quiet}`,
    ]);
  });

  it('labels the frame parts and the kit in German', () => {
    for (const label of [FRAME_DE.sectionNav, FRAME_DE.keyPoints, FRAME_DE.leadIn, FRAME_DE.takeaway, FRAME_DE.methodDetails, KIT_TEXT_DE.table.show]) {
      expect(h, label).toContain(label);
    }
    expect(h).toContain('href="/de/lab"');
    expect(text).not.toMatch(/On this page|Key points|What to look at|What it means|The method, for the curious|Show the numbers as a table|Reset/);
  });

  it('states its own refresh interval, not the English page\'s', () => {
    expect(text).toContain('höchstens alle zehn Minuten');
    expect(text).not.toMatch(/fünf Minuten|five minutes/);
    expect(plain(page(d, { locale: 'en' }))).toContain('at most every five minutes');
  });

  it('never names the group the reader is in and has no own-view mark', () => {
    expect(text).not.toMatch(/Ihre Gruppe|Sie sehen Gruppe|Ihr Aufruf/);
    expect(h).not.toContain('data-your-view');
  });

  it('ends with the shared call to action in German', () => {
    expect(text).toContain(CTA_DE.line);
  });

  it('prints a count of a thousand or more with the German thousands separator', () => {
    const big: LivePageDisplay = { ...d, public: { ...d.public, funnel: { ...d.public.funnel, excluded: { ...d.public.funnel.excluded, bot: 1234 } } } };
    expect(page(big)).toMatch(/<td[^>]*data-num[^>]*>1\.234<\/td>/);
    expect(page(big, { locale: 'en' })).toMatch(/<td[^>]*data-num[^>]*>1,234<\/td>/);
  });
});

describe('the stop and pause reasons', () => {
  const paused = LIVE_PAGE_FIXTURES.find((f) => f.id === 'paused')!.display();

  it('keys each English reason the site writes, and nothing else', () => {
    for (const [key, words] of Object.entries(STOP_REASONS_EN)) {
      expect(stopReasonKey(words), key).toBe(key);
      expect(stopReasonKey(`${words}.`), key).toBe(key);
    }
    expect(stopReasonKey('a script error dropped some views')).toBeNull();
  });

  it('prints the English stored words unchanged in English, and their German twin in German', () => {
    expect(reasonIn(STOP_REASONS_EN.malformed, 'en')).toBe(STOP_REASONS_EN.malformed);
    expect(reasonIn(STOP_REASONS_EN.malformed, 'de')).toBe(LIVE_DE.reasons.malformed);
  });

  it('keeps the owner\'s own note as written, marked as English', () => {
    const node = reasonIn('a script error dropped some views.', 'de');
    expect(renderToStaticMarkup(<>{node}</>)).toBe('<span lang="en">a script error dropped some views</span>');
  });

  it('shows no English stored reason anywhere on the German page, the kit chart included', () => {
    for (const f of LIVE_PAGE_FIXTURES) {
      const h = page(f.display());
      for (const words of Object.values(STOP_REASONS_EN)) expect(plain(h), `${f.id}: ${words}`).not.toContain(words);
    }
  });

  it('says a pause in German in the state sentence and the status words', () => {
    const t = plain(renderToStaticMarkup(<StateExplanation model={paused} locale="de" />));
    expect(t).toMatch(/^Pausiert am \d{2}\.\d{2}\.\s?: /);
    expect(stateWords(paused, 'de')).toBe(LIVE_DE.status.stateWords.paused);
    expect(stateWords(paused)).toBe(LIVE_EN.status.stateWords.paused);
  });

  it('maps a next-step sentence to its German twin and prints its date as a <time>', () => {
    const base = toLivePageDisplay(toLivePageModel(snapshotFixture('calibration'), { commit: null }, FIXTURE_CALIBRATION));
    const d: LivePageDisplay = { ...base, nextStep: { text: LIVE_EN.next.abStart, refs: ['build'], date: '2026-12-01T00:00:00+01:00' } };
    const t = renderToStaticMarkup(<StateExplanation model={d} locale="de" />);
    expect(t).toContain('Am <time dateTime="2026-12-01T00:00:00+01:00" data-derived="build">01.12.</time> startet der A/B-Test.');
    const en = renderToStaticMarkup(<StateExplanation model={d} />);
    expect(en).toContain('The A/B test starts on <time dateTime="2026-12-01T00:00:00+01:00" data-derived="build">01.12</time>.');
  });
});

describe('LiveCopy', () => {
  it('is the type both languages share', () => {
    const copies: LiveCopy[] = [LIVE_EN, LIVE_DE];
    expect(copies).toHaveLength(2);
  });
});
