// The Weather build note at /work/weather: a public dataset rebuilt in 2026, told as a data-quality
// pipeline (the schema, the checks by level and the quarantine policy). Every number is a <Fact> from
// the vendored weather export or a <Derived> that names it; the page shows counts and rules, never a
// row of the data, and it links the dataset but not a repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WEATHER_SECTIONS, WEATHER_TITLE, WeatherPage } from '@/components/weather/WeatherPage';
import { getFact } from '@/lib/facts';
import { LIVE_ROUTES } from '@/lib/site';
import { weather } from '@/lib/sources';
import { WEATHER_DATASET, checkLevels } from '@/lib/weather/checks';
import { WORK_GROUPS } from '../../../content/work.tsx';
import {
  BUILD_NOTE_LINKS,
  BUILD_NOTE_SECTIONS,
  audit,
  decode,
  outline,
  proseWords,
  section,
  sectionLinks,
  text,
} from './helpers';

const repo = join(import.meta.dirname, '../../..');
const ROUTE = '/work/weather';
const PAGE = renderToStaticMarkup(<WeatherPage />);
const PAGE_TEXT = text(PAGE);

describe('the outline', () => {
  it('has one h1, the Work title, and the Work line under it', () => {
    expect([...PAGE.matchAll(/<h1[\s>]/g)]).toHaveLength(1);
    expect(PAGE).toMatch(/<h1 id="weather-title"[^>]*>Weather data quality<\/h1>/);
    expect(WEATHER_TITLE).toBe('Weather data quality');
    const work = WORK_GROUPS.flatMap((g) => g.items).find((i) => i.href === ROUTE)!;
    expect(work.title).toBe(WEATHER_TITLE);
    const intro = /<h1[\s\S]*?<\/h1>\s*<div[^>]*>([\s\S]*?)<\/div>/.exec(PAGE)![1]!;
    expect(text(intro)).toBe(text(renderToStaticMarkup(<>{work.description}</>)));
  });

  it('follows the build-note template: problem, architecture, checks, outcome, limits, links', () => {
    const sections = outline(PAGE);
    expect(sections.map(([id, , , title]) => [id, title])).toEqual(BUILD_NOTE_SECTIONS.map(([id, title]) => [id, title]));
    for (const [id, labelledBy, headingId] of sections) {
      expect(labelledBy).toBe(`${id}-title`);
      expect(headingId).toBe(`${id}-title`);
    }
    expect(WEATHER_SECTIONS.map((s) => s.id)).toEqual(BUILD_NOTE_SECTIONS.map(([id]) => id));
    expect([...PAGE.matchAll(/<h2[\s>]/g)]).toHaveLength(BUILD_NOTE_SECTIONS.length);
  });

  it('has section links to every section, in page order', () => {
    const links = sectionLinks(PAGE);
    expect(links.map(([href]) => href)).toEqual(BUILD_NOTE_SECTIONS.map(([id]) => `#${id}`));
    expect(links.map(([, label]) => label)).toEqual(BUILD_NOTE_LINKS);
    for (const [href] of links) expect(PAGE).toContain(`id="${href.slice(1)}"`);
  });

  it('keeps every element id unique', () => {
    const ids = [...PAGE.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is about 400 words of prose', () => {
    const words = proseWords(PAGE);
    expect(words).toBeGreaterThanOrEqual(330);
    expect(words).toBeLessThanOrEqual(480);
  });

  it('has no motion and no card grid of its own', () => {
    expect(PAGE).not.toMatch(/animate-|transition|fade|slide-in/);
    expect(PAGE).not.toMatch(/grid-cols-[3-9]/);
  });
});

describe('the line on my role', () => {
  it('says what I did, right under the intro, and the page has no Summary section', () => {
    const role = /<p data-note-role=""[^>]*>([\s\S]*?)<\/p>/.exec(PAGE)![1]!;
    expect(text(role)).toBe(
      "A personal project, rebuilt in 2026 from my Master's project. I built the pipeline, the schema, the checks and the tests.",
    );
    expect(PAGE.indexOf('data-note-role')).toBeLessThan(PAGE.indexOf('<nav aria-label="On this page"'));
    expect(PAGE).not.toMatch(/id="summary"|>Summary</);
  });
});

describe('the copy, word for word', () => {
  it.each([
    [
      'problem',
      'The problem The data is one wide file from Kaggle, the Global Weather Repository. A few of its readings cannot be true: one reports wind at 2,963 km/h. Kept, it distorts any summary of wind; deleted quietly, it leaves no trace. I wanted a warehouse that is written only when the data passes its checks, and a place where doubtful readings stay visible.',
    ],
    [
      'outcome',
      'Outcome On the full dataset, 8,725 observations of 236 places in 191 countries, over six weeks, load into the star schema, and all 14 error-level checks pass. The quarantine holds 5 readings, with wind between 172 km/h and 2,963 km/h. A warning flags 43 places observed fewer than 20 times, which limits any comparison between places.',
    ],
    [
      'limits',
      'Limits The quarantine rule is one threshold on wind speed. It catches readings that are plainly impossible, not a sensor that is slightly off. The checks show that the data is complete, consistent and plausible, not that it is right: a wrong reading within its range passes. Kaggle states no licence for this dataset, so this page shows counts and rules, never rows of the data.',
    ],
    ['sources', 'Sources and links The data: Global Weather Repository, on Kaggle Its licence: not stated.'],
  ])('%s', (id, expected) => {
    expect(text(section(PAGE, id))).toBe(expected);
  });

  it('architecture: the three SQL steps, the star schema and the quarantine, then the diagram', () => {
    const s = section(PAGE, 'architecture');
    const prose = text(s.replace(/<figure [\s\S]*?<\/figure>/, ''));
    expect(prose).toBe(
      'Architecture Python loads the file into DuckDB and runs three SQL steps. Staging gives the columns types and plain names, and merges condition spellings that differ only in case or spacing. The model builds a star schema: places, weather conditions and a fact table of observations. A reading with wind above 150 km/h goes to a quarantine table with its reason, never into the fact table. The checks run last.',
    );
    expect(s.indexOf('<p')).toBeLessThan(s.indexOf('data-figure="weather-pipeline"'));
  });

  it('how I checked this: the check rules, the stop rule, the table by level, the tests and CI', () => {
    const t = text(section(PAGE, 'how-i-checked-this').replace(/<table[\s\S]*?<\/table>/, ' '));
    expect(t).toContain(
      'Each check is a SQL query that counts the rows breaking one rule. The 14 error-level checks include keys and timestamps that are present, one row per place and time, no missing measurements, values in a plausible range and valid coordinates; one proves that the staging rows equal the fact rows plus the quarantined rows, so no reading disappears. If any error-level check fails, the pipeline stops and writes no warehouse.',
    );
    expect(t).toContain(
      'Unit tests run the pipeline on small synthetic files: the checks catch an impossible humidity, a repeated place and time and a missing measurement, an impossible wind reading lands in quarantine, and a failing error-level check leaves no warehouse. Lint and the tests run in GitHub Actions on every push.',
    );
  });
});

describe('figures', () => {
  it('prints the counts, the rule and the range through their facts', () => {
    const ids = [
      'weather.checks.count',
      'weather.checks.error_count',
      'weather.checks.sparse_locations',
      'weather.data.observations',
      'weather.data.locations',
      'weather.data.countries',
      'weather.quarantine.rows',
      'weather.quarantine.threshold_kmh',
      'weather.quarantine.min_wind_kmh',
      'weather.quarantine.max_wind_kmh',
    ];
    for (const id of ids) expect(PAGE, id).toContain(`data-fact="${id}"`);
    expect(getFact('weather.checks.count').value).toBe(18);
    expect(getFact('weather.checks.error_count').value).toBe(14);
  });

  it('marks the rebuild year and the sparse-place threshold as coming from the source', () => {
    expect(PAGE).toContain('<time dateTime="2026" data-derived="source:weather">2026</time>');
    expect(PAGE).toContain('<data value="20" data-derived="source:weather">20</data>');
    const sparse = weather.tables.checks.find((c) => c.name === 'locations observed fewer than 20 times');
    expect(sparse?.failing_rows).toBe(getFact('weather.checks.sparse_locations').value);
  });

  it('passes the truth audit', () => {
    expect(audit(PAGE, ROUTE)).toEqual([]);
  });
});

describe('the pipeline diagram', () => {
  const fig = /<figure [^>]*data-figure="weather-pipeline"[\s\S]*?<\/figure>/.exec(PAGE)![0];

  it('is a diagram Figure with a finding title and no badge, table or controls', () => {
    expect(fig).toContain('<h3 id="weather-pipeline-title"');
    expect(text(/<h3[\s\S]*?<\/h3>/.exec(fig)![0])).toBe('The warehouse is written only when every error-level check passes');
    expect(fig).not.toMatch(/<table|data-provenance|<input|<button/);
    expect(text(/<figcaption[\s\S]*?<\/figcaption>/.exec(fig)![0])).toBe(
      'The stages in the order they run. A reading over the wind rule goes to the quarantine table instead of the fact table, and the checks count both.',
    );
  });

  it('is its own text alternative: an ordered list of stages in words, connectors hidden', () => {
    const list = /<ol[\s\S]*<\/ol>/.exec(fig)![0];
    const stages = [...list.matchAll(/<li[^>]*data-stage="([^"]+)"/g)].map((m) => m[1]);
    expect(stages).toEqual(['source', 'staging', 'model', 'checks', 'warehouse']);
    expect(text(list)).toBe(
      'Kaggle file One wide CSV of observations Staging Types, plain names, merged spellings Star schema Places, conditions and observations Quarantine Wind above 150 km/h, with its reason Checks 18 checks; 14 stop the build Warehouse Written only if every error-level check passes',
    );
    expect(fig).not.toMatch(/<svg|<text/);
    // the node labels with a digit carry their facts
    for (const id of ['weather.quarantine.threshold_kmh', 'weather.checks.count', 'weather.checks.error_count']) {
      expect(fig, id).toContain(`data-fact="${id}"`);
    }
    for (const m of fig.matchAll(/<(?:span|div)[^>]*data-connector[^>]*>/g)) expect(m[0]).toContain('aria-hidden="true"');
  });
});

describe('the checks by level', () => {
  it('reads only the levels from the export, and they add up to the facts', () => {
    const levels = checkLevels();
    expect(levels).toEqual([
      { level: 'error', count: 14 },
      { level: 'warn', count: 3 },
      { level: 'info', count: 1 },
    ]);
    for (const l of levels) expect(Object.keys(l).sort()).toEqual(['count', 'level']);
  });

  it('is an open sourced table with its own heading and the public-data badge', () => {
    const s = section(PAGE, 'how-i-checked-this');
    expect(s).toMatch(/<h3 id="check-levels-heading"[^>]*>Checks by level<\/h3>/);
    const table = /<table[\s\S]*?<\/table>/.exec(s)![0];
    expect([...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => decode(m[1]!))).toEqual(['Level', 'Checks', 'When one fails']);
    expect(text(table.replace(/<caption[\s\S]*?<\/caption>/, '').replace(/<thead[\s\S]*?<\/thead>/, ''))).toBe(
      'Error 14 The pipeline stops; no warehouse is written Warning 3 Reported; the build goes on Information 1 Reported; the build goes on',
    );
    expect(table).toContain('data-derived="weather.checks.error_count weather.checks.count source:weather"');
    expect(s).toContain('Public data');
  });
});

describe('truth', () => {
  it('names the work as a public dataset rebuilt in 2026', () => {
    expect(PAGE_TEXT).toContain('public dataset of weather observations, rebuilt in 2026');
    expect(PAGE_TEXT).toContain('rebuilt in 2026 from my Master');
  });

  it('shows no row of the data: the adapter exposes no check names, failing rows or readings', () => {
    expect(PAGE).not.toMatch(/failing_rows|quarantine_observation|stg_weather|wind_kph/);
    for (const c of weather.tables.checks) expect(PAGE_TEXT).not.toContain(c.name);
  });

  it('has exactly one link that leaves the page: the dataset, from the export', () => {
    const hrefs = [...PAGE.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.filter((h) => !h.startsWith('#'))).toEqual([WEATHER_DATASET.url]);
    expect(WEATHER_DATASET.url).toBe(weather._meta.dataset.url);
  });

  it('says the licence is not stated, from the export', () => {
    expect(weather._meta.dataset.licence).toMatch(/^Not stated/);
    expect(WEATHER_DATASET.licenceStated).toBe(false);
  });
});

describe('links', () => {
  it('makes every link a 44 px target and marks the dataset as another site', () => {
    const anchors = [...PAGE.matchAll(/<a [^>]*>/g)].map((m) => m[0]);
    expect(anchors.length).toBe(BUILD_NOTE_LINKS.length + 1);
    for (const a of anchors) expect(a, a).toContain('data-touch-target=""');
    expect(anchors.find((a) => a.includes('kaggle.com'))).toContain('rel="noopener"');
  });
});

describe('the route', () => {
  const route = readFileSync(join(repo, 'src/app/work/weather/page.tsx'), 'utf8');

  it('is a plain static page that renders the composition, and it is live', async () => {
    expect(route).toMatch(/<WeatherPage \/>/);
    expect(route).not.toMatch(/revalidate|dynamic|searchParams|cookies\(|headers\(/);
    const mod = (await import('@/app/work/weather/page')) as {
      default: () => React.ReactNode;
      metadata: { title?: unknown; description?: unknown };
    };
    expect(mod.metadata.title).toBe('Weather data quality');
    expect(mod.metadata.description).toBe(
      'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
    );
    expect(renderToStaticMarkup(<>{mod.default()}</>)).toBe(PAGE);
    expect(LIVE_ROUTES).toContain(ROUTE);
  });
});
