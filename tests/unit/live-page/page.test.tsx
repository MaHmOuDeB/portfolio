// The Live test page (/experiment) as a whole: its order, the carried planning copy and its refs,
// the baseline caption, the closure wording, the small-count rule in every place a count can land
// (text, accessible names, tables, the no-JS view, the error fallback and the props a client
// boundary receives), the pre-registration and build lines, the colophon with and without the
// embedded build metadata, and the source rules (no runtime file read, no typed tag).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { LIVE_SECTIONS, LivePage } from '@/components/live-page/LivePage';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { preregHash } from '@/lib/experiment/prereg-hash';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture, type FixtureRow } from '@/lib/home/fixtures';
import type { HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { readBuildMeta } from '@/lib/live-page/build-meta-file';
import { LIVE_PAGE_FIXTURES } from '@/lib/live-page/fixtures';
import { LIGHTHOUSE_LABEL, type BuildMeta } from '@/lib/live-page/build-meta-shape';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';
import { CONTACT } from '@/lib/site';
import { AB_NOW, SHIP_B, mark, read, seed } from './reader';

// Every table a client boundary receives (the Figure's error boundary is the page's only client
// module), so the serialized props can be checked like the HTML.
const boundaryTables = vi.hoisted(() => [] as unknown[]);
vi.mock('@/components/kit/FigureErrorBoundary', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/kit/FigureErrorBoundary')>();
  return {
    ...real,
    FigureErrorBoundary: (p: { table?: unknown; children?: import('react').ReactNode }) => {
      boundaryTables.push(JSON.parse(JSON.stringify({ table: p.table ?? null })));
      return p.children;
    },
  };
});

const ROOT = resolve(import.meta.dirname, '../../..');
const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const configOf = (s: ExperimentSnapshot): ExperimentConfig => (s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION);
const displayOf = (s: ExperimentSnapshot, config: ExperimentConfig = configOf(s), commit: string | null = null) =>
  toLivePageDisplay(toLivePageModel(s, { commit }, config));
type Runtime = 'default' | 'no-js' | 'error';
const page = (d: LivePageDisplay, o: { meta?: BuildMeta | null; host?: string | null; runtime?: Runtime } = {}) =>
  renderToStaticMarkup(<LivePage display={d} meta={o.meta ?? null} host={o.host === undefined ? 'site.example' : o.host} runtime={o.runtime} />);

function elements(node: T.ParentNode, out: T.Element[] = []): T.Element[] {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      out.push(child as T.Element);
      elements(child as T.Element, out);
    }
  }
  return out;
}
function text(node: T.ParentNode): string {
  return node.childNodes.map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? text(c as T.ParentNode) : '')).join('');
}
const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const doc = (h: string) => parse(h);
const all = (h: string) => elements(doc(h));
const byId = (h: string, id: string) => all(h).find((el) => attr(el, 'id') === id);
/** The table a DataTable drew with this id (its caption carries the id). */
const tableById = (h: string, id: string) => all(h).find((el) => el.tagName === 'table' && elements(el).some((c) => attr(c, 'id') === `${id}-caption`));
const sectionText = (h: string, id: string) => {
  const el = byId(h, id);
  if (!el) throw new Error(`no section ${id}`);
  return text(el).replace(/\s+/g, ' ');
};
const LABELS = ['aria-label', 'title', 'aria-description', 'alt', 'aria-valuetext'];
/** Everything a reader or a screen reader gets. */
const everything = (h: string) => [text(doc(h)), ...all(h).flatMap((el) => LABELS.map((n) => attr(el, n) ?? ''))].join(' ').replace(/\s+/g, ' ');
const audit = (h: string) => auditHtml(h, { route: '/experiment', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

const FIXTURES: [string, ExperimentSnapshot][] = [
  ...MODES.map((m) => [m, snapshotFixture(m)] as [string, ExperimentSnapshot]),
  ...NARRATIVE_FIXTURES.map((n) => [n, narrativeFixture(n)] as [string, ExperimentSnapshot]),
];

/** A calibration day with these analysed (and entry) views per group. */
const cal = (a: number, b: number, extra: Partial<FixtureRow> = {}): ExperimentSnapshot =>
  buildFixture({
    config: FIXTURE_CALIBRATION,
    now: '2026-11-20T10:00:00Z',
    rows: [{ day: '2026-11-03', a: { entry: a, inview: a }, b: { entry: b, inview: b }, ...extra }],
  });
/** The same in the A/B. */
const ab = (a: number, b: number): ExperimentSnapshot =>
  buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: a, inview: a }, b: { entry: b, inview: b } }] });
/** Exclusions with small cells, as the funnel reads them. */
const withExclusions = (s: ExperimentSnapshot): ExperimentSnapshot => ({
  ...s,
  funnel: { ...s.funnel, excluded: { ...s.funnel.excluded, bot: 3, internal: 7, self: 1, ceiling: 4 } },
});

/** The texts of the elements that carry a live (or the reader's) ref and print a whole number from 1 to 4. */
function smallLiveCounts(h: string, refs: readonly string[]): string[] {
  return all(h)
    .filter((el) => {
      const d = attr(el, 'data-derived');
      return d !== undefined && d.split(' ').some((r) => refs.includes(r) && r !== 'build');
    })
    .map((el) => text(el).trim())
    .filter((t) => /^[1-4]$/.test(t));
}

afterEach(() => {
  vi.unstubAllEnvs();
  boundaryTables.length = 0;
});

describe('the page order', () => {
  it('runs plan and build commit, funnel, split check, detectable effect, results, decision and end, data and script, colophon', () => {
    expect(LIVE_SECTIONS.map((s) => s.id)).toEqual(['plan', 'funnel', 'split-check', 'detectable', 'results', 'decision', 'check-it-yourself', 'colophon']);
    const h = page(displayOf(snapshotFixture('ab')));
    const order = all(h).filter((el) => el.tagName === 'section').map((el) => attr(el, 'id'));
    expect(order).toEqual(['where-it-stands', ...LIVE_SECTIONS.map((s) => s.id)]);
    expect(all(h).filter((el) => el.tagName === 'h1').map(text)).toEqual(['Live test']);
  });
});

describe('the carried planning copy', () => {
  const h = page(displayOf(snapshotFixture('calibration')));
  const plan = byId(h, 'plan-planning')!;

  it('quotes the v1 plan, with the guardrail disclosure and the unit', () => {
    expect(elements(plan).filter((el) => el.tagName === 'p').map((p) => text(p).replace(/\s+/g, ' ')).join(' ')).toBe(
      'I planned the test at 225 views per group. At that size, the smallest lift it would find 8 times in 10 is about 15 percentage points. ' +
        'Even a 5-point lift would be found about 1 time in 20. Inconclusive is the likely, honest outcome. ' +
        'The quick-exit guardrail asks for evidence that B does not hurt. For two identical groups, the planning calculation says ship B needs about 390 to 470 entry views per group. ' +
        'That is a planning figure for identical groups, not a threshold every run must reach. ' +
        'n counts views, not people: one person can count more than once, and in both groups.',
    );
  });

  it('marks every numeral with its unit and the build ref', () => {
    const spans = elements(plan).filter((el) => attr(el, 'data-derived') !== undefined).map((el) => [text(el), attr(el, 'value'), attr(el, 'data-derived')]);
    expect(spans).toEqual([
      ['225', '225', 'build'],
      ['8', '8', 'build'],
      ['10', '10', 'build'],
      ['15', '15', 'build'],
      ['5', '5', 'build'],
      ['1', '1', 'build'],
      ['20', '20', 'build'],
      ['390', '390', 'build'],
      ['470', '470', 'build'],
    ]);
  });

  it('is the same plan in the A/B, where the cap may differ', () => {
    const d = displayOf(snapshotFixture('ab'));
    expect(text(byId(page(d), 'plan-planning')!)).toBe(text(plan));
  });
});

describe('pinned copy: hypothesis, read time, decision label and verifier link', () => {
  it('quotes the pre-registration\'s hypothesis exactly', () => {
    const prereg = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8');
    const hypothesis = 'Featured case-study cards that state the finding get more clicks than cards that name the topic.';
    expect(prereg).toContain(hypothesis);
    expect(sectionText(page(displayOf(snapshotFixture('ab'))), 'plan')).toContain(
      `The pre-registration fixes the design, the numbers I plan with, the decision rule and what I will do in each outcome. Its hypothesis: “${hypothesis}”`,
    );
  });

  it('says when the numbers were read and what a failed read does', () => {
    const t = sectionText(page(displayOf(snapshotFixture('ab'))), 'where-it-stands');
    expect(t).toMatch(/These numbers were read on \d{2}\.\d{2} at \d{2}:\d{2}\. The page reads the data again at most every five minutes, when someone opens it\. If a read fails, it keeps showing the numbers it last read, with this time\./);
    expect(t).not.toMatch(/rebuilt/);
  });

  it('a page-drawn decision is "final" only once its stop is confirmed', () => {
    const d = displayOf(snapshotFixture('ship-b'));
    const unsafe = { ...d, kitSafe: false as const, kitSnapshot: null, closedConfirmed: false };
    const t = sectionText(page(unsafe), 'results');
    expect(t).not.toMatch(/final/i);
    expect(t).toContain('The latest interval, while the result is being confirmed');
    expect(sectionText(page({ ...unsafe, closedConfirmed: true }), 'results')).toContain('The final interval');
  });

  it('links the verifier at the build commit, else at the tag', () => {
    const s = snapshotFixture('ab');
    const withCommit = page(displayOf(s, configOf(s), 'abcdef0123456789abcdef0123456789abcdef01'));
    expect(withCommit).toContain(`href="${CONTACT.github}/portfolio/blob/abcdef0123456789abcdef0123456789abcdef01/scripts/verify_experiment.py"`);
    expect(page(displayOf(s))).toContain(`href="${CONTACT.github}/portfolio/blob/${EXPERIMENT.prereg.tag}/scripts/verify_experiment.py"`);
  });
});

describe('pinned copy: funnel, split check, effect, decision and data', () => {
  it('the exclusions caption names the two rows that do not count entries, and the rate limit counts requests', () => {
    const d = displayOf(withExclusions(cal(60, 60)));
    const h = page(d);
    expect(sectionText(h, 'funnel')).toContain(
      'Each row counts entries turned away for one reason, with two exceptions: “Over the rate limit” counts at most one per network address a minute, and “After the daily ceiling” counts one for each day the limit was reached. Once a day is full, entries that would have counted are turned away without being counted under any reason. The rows are not visitors lost and do not add up: one visitor can appear under several reasons, and some visits never reach the server at all.',
    );
    expect(sectionText(h, 'funnel')).not.toContain('later entries are turned away');
    const rows = elements(byId(h, 'live-exclusions')!).filter((el) => el.tagName === 'tr').map((tr) => elements(tr).filter((c) => c.tagName === 'td').map(text));
    expect(rows.find((r) => r[0] === 'Over the rate limit')?.[2]).toBe('Too many requests from one network address in a minute');
    expect(everything(h)).not.toContain('Too many events');
  });

  it('a failed split check makes a non-chance cause likely, and names the false-flag chance', () => {
    const h = page(displayOf(snapshotFixture('ab')));
    const t = sectionText(h, 'split-check');
    expect(t).toContain(
      'The split check (sample ratio mismatch, SRM) asks whether the two groups got the share of views chance would give them. If it fails, the split is further from even than chance would plausibly give, so something may have moved views between the groups, and no result is shown. Because it is checked at every completed day, the chance of a false flag over the whole run is about 1% to 3%.',
    );
    expect(t).not.toContain('something other than chance moved');
    const prereg = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8').replace(/\s+/g, ' ');
    expect(prereg).toContain('the chance of a false flag over the whole run is about 1% to 3%');
  });

  it('the detectable caption no longer says the sequential rule needs a larger lift', () => {
    const t = sectionText(page(displayOf(snapshotFixture('calibration'))), 'detectable');
    expect(t).toContain('It is computed for one look at n under the confidence sequence’s boundary, not the power of the sequential stopping rule.');
    expect(t).not.toMatch(/needs a larger lift/);
  });

  it('the earliest end is the earliest date the A/B time limit can fall, and a decision can end the test sooner', () => {
    const t = sectionText(page(displayOf(snapshotFixture('calibration'))), 'decision');
    expect(t).toMatch(
      /Earliest end: \d{2}\.\d{2}\. During the calibration this is the earliest date the A\/B test’s time limit can fall; a decision can end the test sooner\./,
    );
    expect(t).not.toContain('whole run can end');
    expect(sectionText(page(displayOf(snapshotFixture('ab'))), 'decision')).not.toContain('time limit can fall');
  });

  it('the verifier has three outcomes, and a small-cell check can fail', () => {
    const t = sectionText(page(displayOf(snapshotFixture('ab'))), 'check-it-yourself');
    expect(t).toContain(
      'Each check agrees with the published value to within a hundred-millionth, or the script reports it as failed; a check the published data cannot settle is reported as indeterminate, with its reason.',
    );
    expect(t).toContain(
      'Where a check depends on a count shown as “<5”, the script tries every value the cell may hold. The check passes when all of them give the published result, fails when none does, and is reported as indeterminate otherwise. It never prints those values.',
    );
    expect(t).not.toContain('passes only when');
  });
});

describe('the detectable-effect caption', () => {
  it('names the 15% planning rate during the calibration, from the published configuration', () => {
    const d = displayOf(snapshotFixture('calibration'));
    const caption = sectionText(page(d), 'detectable');
    expect(d.public.config.planningBaselines.primary).toBe(0.15);
    expect(caption).toContain(
      'The smallest lift this many views per group would detect 8 times in 10, assuming the planning click rate of 15%, at one look.',
    );
    expect(caption).toContain('one look at n under the confidence sequence’s boundary, not the power of the sequential stopping rule');
  });

  it('in the A/B names the planning rate from the calibration, and it is the plotted baseline', () => {
    const config = { ...FIXTURE_AB, primary: { planningBaseline: 0.22 } } as unknown as ExperimentConfig;
    const s = buildFixture({ config, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: 80, inview: 70 }, b: { entry: 80, inview: 70 } }] });
    const d = displayOf(s, config);
    const h = page(d);
    expect(d.public.config.planningBaselines.primary).toBe(0.22);
    expect(d.public.detectable.baseline).toBe(0.22);
    expect(sectionText(h, 'detectable')).toContain(
      'The smallest lift this many views per group would detect 8 times in 10, assuming the planning click rate from the calibration, 22%, at one look.',
    );
    const baseline = all(h).find((el) => attr(el, 'data-planning-rate') !== undefined)!;
    expect(attr(baseline, 'value')).toBe('0.22');
    expect(attr(baseline, 'data-derived')).toBe('build');
  });

  it('never calls the baseline measured or live, in any state', () => {
    for (const [name, s] of FIXTURES) {
      const t = everything(page(displayOf(s)));
      expect(t, name).not.toMatch(/measured|live (click )?rate|observed (click )?rate|live baseline/i);
    }
  });
});

describe('the detectable effect at the current size', () => {
  it('says why there is no point: no views, a small group, or beyond the range; never Infinity or null', () => {
    const notes = (s: ExperimentSnapshot) => sectionText(page(displayOf(s)), 'detectable');
    expect(notes(cal(0, 0))).toContain('No views are counted yet, so there is no point for the current size.');
    expect(notes(cal(3, 60))).toContain('While a group has fewer than 5 views, the point for the current size is not shown.');
    expect(notes(snapshotFixture('not-started'))).toContain('No data is shown, so there is no point for the current size.');
    const beyond = displayOf(cal(6, 6));
    const forced = { ...beyond, public: { ...beyond.public, detectable: { ...beyond.public.detectable, atCurrent: null, atCurrentNote: 'beyond-range' as const } } };
    expect(sectionText(page(forced), 'detectable')).toContain('At the current size the detectable lift is beyond the range this calculation covers, so no point is shown.');
    for (const [name, s] of FIXTURES) expect(everything(page(displayOf(s))), name).not.toMatch(/Infinity|NaN|\bnull\b|undefined/);
  });

  it('plots every finite point, the current point and zero', () => {
    const d = displayOf(cal(60, 70));
    const h = page(d);
    const chart = all(h).find((el) => attr(el, 'data-domain') !== undefined)!;
    const domain = JSON.parse(attr(chart, 'data-domain')!) as { x: [number, number]; y: [number, number] };
    const pts = d.public.detectable.points;
    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(p.nPerArm).toBeGreaterThanOrEqual(domain.x[0]);
      expect(p.nPerArm).toBeLessThanOrEqual(domain.x[1]);
      expect(p.effect * 100).toBeLessThanOrEqual(domain.y[1]);
    }
    expect(domain.y[0]).toBeLessThanOrEqual(0);
    expect(domain.x[0]).toBeLessThanOrEqual(0);
    expect(d.public.detectable.atCurrent).not.toBeNull();
    expect(d.public.detectable.atCurrent! * 100).toBeLessThanOrEqual(domain.y[1]);
    expect(all(h).some((el) => attr(el, 'data-detectable-current') !== undefined)).toBe(true);
  });
});

describe('closure wording', () => {
  it('a derived ship B with no stored stop: reached its decision, being confirmed, nowhere stopped or closed', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    const d = displayOf(s);
    expect(d.mode).toBe('ship-b');
    expect(d.closedConfirmed).toBe(false);
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      const t = everything(page(d, { runtime }));
      expect(t).toContain('has reached its decision; the result is being confirmed');
      expect(t, runtime).not.toMatch(/counting (has )?(stopped|ended|closed)|has ended|has closed|counting stopped/i);
    }
  });

  it('a stored stop may say counting has stopped', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-01');
    const d = displayOf(await read(redis, { config: FIXTURE_AB, now: AB_NOW }));
    expect(d.mode).toBe('ship-b');
    expect(d.closedConfirmed).toBe(true);
    expect(everything(page(d))).toContain('Counting has stopped; later looks change nothing.');
  });

  it('no fixture says counting stopped unless the stop is confirmed', () => {
    for (const [name, s] of FIXTURES) {
      const d = displayOf(s);
      if (d.closedConfirmed || d.mode === 'closure-check') continue;
      for (const runtime of ['default', 'no-js', 'error'] as const) {
        expect(everything(page(d, { runtime })), `${name} ${runtime}`).not.toMatch(/counting (has )?(stopped|ended|closed)|counting stopped|has ended|has closed/i);
      }
    }
  });
});

describe('small counts', () => {
  const cases: [string, ExperimentSnapshot, string[]][] = [
    ['1 and 4 (calibration)', cal(1, 4), ['<5', '<5']],
    ['1 and 4 (A/B)', ab(1, 4), ['<5', '<5']],
    ['0 and 5', cal(0, 5), ['0', '5']],
    ['49 and 50', cal(49, 50), ['49', '50']],
    ['small exclusions', withExclusions(cal(60, 60)), ['60', '60']],
    ['srm-suppressed', snapshotFixture('srm-suppressed'), []],
    ['ab-tiny', narrativeFixture('ab-tiny'), []],
    ['calibration-tiny', narrativeFixture('calibration-tiny'), []],
  ];

  it.each(cases)('%s: no exact count from 1 to 4 in any runtime, label or table', (_name, s, expected) => {
    const d = displayOf(s);
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      boundaryTables.length = 0;
      const h = page(d, { runtime });
      expect(smallLiveCounts(h, d.refs), runtime).toEqual([]);
      for (const el of all(h)) for (const n of LABELS) expect(attr(el, n) ?? '', `${runtime} ${n}`).not.toMatch(/\b[1-4]\b/);
      // The props a client boundary receives: a count cell is "<5", 0 or at least 5.
      const counts = (boundaryTables as { table: { columns: string[]; rows: unknown[][] } | null }[]).flatMap(({ table }) =>
        table === null ? [] : table.columns.flatMap((c, i) => (/views|group|entries/i.test(c) ? table.rows.map((r) => r[i]) : [])),
      );
      expect(counts.filter((v) => typeof v === 'number' && v >= 1 && v <= 4), runtime).toEqual([]);
      expect(audit(h), runtime).toEqual([]);
    }
    if (expected.length > 0) {
      const funnel = tableById(page(d, { runtime: 'no-js' }), 'live-funnel-table')!;
      const cells = elements(funnel).filter((el) => el.tagName === 'td').map((el) => text(el));
      expect(cells).toEqual(expect.arrayContaining(expected));
    }
  });

  it('prints "<5" for an exclusion from 1 to 4 and never a total of the exclusions', () => {
    const d = displayOf(withExclusions(cal(60, 60)));
    const t = sectionText(page(d), 'funnel');
    const table = byId(page(d), 'live-exclusions')!;
    const rows = elements(table).filter((el) => el.tagName === 'tr').map((tr) => elements(tr).filter((c) => c.tagName === 'td').map(text));
    expect(rows).toContainEqual(['Known bots', '<5', expect.any(String)]);
    expect(rows).toContainEqual(['Automated test and Lighthouse runs', '7', expect.any(String)]);
    expect(rows).toContainEqual(['My own devices', '<5', expect.any(String)]);
    expect(rows.map((r) => r[0])).not.toContainEqual(expect.stringMatching(/total|all reasons|altogether/i));
    expect(t).not.toMatch(/in all|altogether|excluded in total/i);
  });
});

describe('the funnel', () => {
  it('names beacons, not visitors; withholds the totals; keeps the preview row structural', () => {
    const d = displayOf(cal(60, 60));
    const h = page(d);
    const t = sectionText(h, 'funnel');
    expect(t).toContain('These are beacons received, not visitors');
    expect(t).toContain('Global Privacy Control or Do Not Track');
    expect(t).toContain('bots that never run JavaScript');
    expect(t).toContain('not visitors lost and do not add up');
    expect(t.match(/Not published/g)?.length).toBeGreaterThanOrEqual(2);
    const preview = byId(h, 'live-preview-row')!;
    expect(text(preview).replace(/\s+/g, ' ')).toBe('Preview deployments: 0. A preview never writes to the store, so this is always 0.');
    expect(elements(preview).filter((el) => attr(el, 'data-derived') !== undefined).map((el) => attr(el, 'data-derived'))).toEqual(['build', 'build']);
  });

  it('shows no observed zero on a placeholder', () => {
    for (const mode of ['not-started', 'unavailable', 'closure-check'] as const) {
      const h = page(displayOf(snapshotFixture(mode)));
      const cells = elements(byId(h, 'funnel')!).filter((el) => el.tagName === 'td').map((el) => text(el));
      expect(cells.filter((c) => /\d/.test(c)), mode).toEqual([]);
      expect(sectionText(h, 'funnel'), mode).toContain('No counts are shown: this page has no data.');
    }
  });
});

describe('the data section', () => {
  it('says aggregated daily counts with no identifiers, never anonymous, and gives the commands', () => {
    const h = page(displayOf(snapshotFixture('ab')));
    const t = sectionText(h, 'check-it-yourself');
    expect(t).toContain('The data are aggregated daily counts, no identifiers.');
    expect(t).toContain('They are not anonymous');
    expect(everything(h)).not.toMatch(/\bare anonymous|\bis anonymous|anonymi[sz]ed/i);
    const code = all(h).filter((el) => el.tagName === 'pre').map(text).join('\n');
    expect(code).toBe(
      'curl --fail --silent --show-error https://site.example/experiment/data.json -o data.json\npython3 scripts/verify_experiment.py data.json',
    );
    const link = all(h).find((el) => el.tagName === 'a' && attr(el, 'href') === '/experiment/data.json')!;
    expect(text(link)).toBe('Download the data (data.json)');
  });

  it('without a production host names the address of this page instead', () => {
    const h = page(displayOf(snapshotFixture('ab')), { host: null });
    expect(sectionText(h, 'check-it-yourself')).toContain('the address of this page');
    expect(all(h).filter((el) => el.tagName === 'pre').map(text).join('\n')).toBe('python3 scripts/verify_experiment.py data.json');
  });

  it('says honestly when the numbers are a stand-in', () => {
    const s = snapshotFixture('calibration');
    const fixture = displayOf({ ...s, source: 'fixture' });
    expect(sectionText(page(fixture), 'check-it-yourself')).toContain('This build has no store, so the numbers on this page are a stand-in, not visitors.');
    expect(sectionText(page(displayOf(s)), 'check-it-yourself')).not.toContain('stand-in');
  });
});

describe('the pre-registration and build lines', () => {
  const v11 = { ...EXPERIMENT, prereg: { version: 'v1.1', tag: 'prereg-v1.1' } } as unknown as ExperimentConfig;

  it.each([
    ['v1', EXPERIMENT as ExperimentConfig],
    ['v1.1', v11],
  ])('names version, tag and design hash from the data (%s), and links the tag', (_name, config) => {
    const s = snapshotFixture('calibration');
    const d = displayOf(s, { ...configOf(s), prereg: config.prereg } as ExperimentConfig, 'abcdef0123456789abcdef0123456789abcdef01');
    const h = page(d);
    const line = byId(h, 'plan-prereg')!;
    expect(text(line).replace(/\s+/g, ' ')).toBe(`Pre-registration ${config.prereg.version}, tag ${config.prereg.tag}, design hash ${preregHash()}.`);
    expect(elements(line).filter((el) => attr(el, 'data-derived') === 'build').map(text)).toEqual([config.prereg.version, config.prereg.tag, preregHash()]);
    const link = all(h).find((el) => el.tagName === 'a' && attr(el, 'href') === `${CONTACT.github}/portfolio/tree/${config.prereg.tag}`);
    expect(link).toBeDefined();
    expect(text(byId(h, 'plan-build')!).replace(/\s+/g, ' ')).toBe('This page was built from commit abcdef0.');
  });

  it('says "Not recorded" when the build commit is null, never "unknown"', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    expect(text(byId(h, 'plan-build')!).replace(/\s+/g, ' ')).toBe('Build commit: Not recorded.');
    expect(everything(h)).not.toMatch(/unknown/i);
  });

  it('no file of the page types the version or the tag', () => {
    const files = [...readdirSync(join(ROOT, 'src/components/live-page')).map((f) => join(ROOT, 'src/components/live-page', f)), join(ROOT, 'src/app/experiment/page.tsx')];
    for (const f of files) expect(readFileSync(f, 'utf8'), relative(ROOT, f)).not.toMatch(/['"`]v1|prereg-v1/);
  });
});

const META: BuildMeta = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  builtAt: '2026-11-12T08:00:00.000Z',
  unitTests: { passed: 4409, total: 4409, skipped: 40 },
  e2eTests: { passed: 312, total: 312, skipped: 3, flaky: 2 },
  axeViolations: 0,
  lighthouse: { performance: 98, accessibility: 100, bestPractices: 100, seo: 100 },
  lighthouseLabel: LIGHTHOUSE_LABEL,
};

describe('the colophon', () => {
  it('without build metadata: the deploy-time sentence, no digit, never 0, and the stack line', () => {
    const h = page(displayOf(snapshotFixture('ab')), { meta: null });
    const results = byId(h, 'colophon-results')!;
    expect(text(results)).toBe('Test and audit results are added when the site is deployed.');
    expect(attr(results, 'data-derived')).toBe('build');
    expect(text(results)).not.toMatch(/\d|Not recorded/);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(text(byId(h, 'colophon-stack')!).replace(/\s+/g, ' ')).toBe(
      `Built with Next.js ${pkg.dependencies.next}, React ${pkg.dependencies.react}, Tailwind CSS ${pkg.devDependencies.tailwindcss} and TypeScript ${pkg.devDependencies.typescript}.`,
    );
  });

  it('with build metadata: its values, the lab label and its commit', () => {
    const h = page(displayOf(snapshotFixture('ab')), { meta: META });
    expect(text(byId(h, 'colophon-results')!).replace(/\s+/g, ' ')).toBe(
      'Unit tests: 4,409 of 4,409 that ran passed; 40 skipped. Browser tests: 312 of 312 that ran passed, 2 of them after a retry; 3 skipped. ' +
        'Accessibility checks (axe): 0 violations. ' +
        'Lighthouse, CI lab run on the home page, group A (mobile, throttled in the browser): performance 98, accessibility 100, best practices 100, SEO 100. ' +
        'These results are for commit 0123456.',
    );
    expect(audit(h)).toEqual([]);
  });

  it('a green run reads as green: no skip or retry clause when there is none, and a failure is counted as one', () => {
    const clean = { ...META, unitTests: { passed: 12, total: 12, skipped: 0 }, e2eTests: { passed: 4, total: 4, skipped: 0, flaky: 0 } };
    expect(text(byId(page(displayOf(snapshotFixture('ab')), { meta: clean }), 'colophon-results')!).replace(/\s+/g, ' ')).toMatch(
      /^Unit tests: 12 of 12 that ran passed\. Browser tests: 4 of 4 that ran passed\. Accessibility/,
    );
    const failed = { ...clean, unitTests: { passed: 11, total: 12, skipped: 0 } };
    expect(text(byId(page(displayOf(snapshotFixture('ab')), { meta: failed }), 'colophon-results')!)).toContain('Unit tests: 11 of 12 that ran passed.');
  });
});

describe('readBuildMeta (the build-time embedded metadata)', () => {
  it('is null when nothing was embedded', () => {
    vi.stubEnv('BUILD_META_JSON', 'null');
    expect(readBuildMeta()).toBeNull();
    vi.stubEnv('BUILD_META_JSON', '');
    expect(readBuildMeta()).toBeNull();
  });

  it('parses the embedded value', () => {
    vi.stubEnv('BUILD_META_JSON', JSON.stringify(META));
    expect(readBuildMeta()).toEqual(META);
  });

  it('throws on a value that is not build metadata', () => {
    vi.stubEnv('BUILD_META_JSON', '{"commit":"x"}');
    expect(() => readBuildMeta()).toThrow();
    vi.stubEnv('BUILD_META_JSON', '{not json');
    expect(() => readBuildMeta()).toThrow();
  });
});

describe('the source', () => {
  const SRC = join(ROOT, 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });

  it('nothing under src reads the build-metadata file at run time', () => {
    for (const f of files(SRC)) {
      const source = readFileSync(f, 'utf8');
      expect(source, relative(ROOT, f)).not.toContain('build-meta.json');
      if (/build-meta/.test(relative(SRC, f))) expect(source, relative(ROOT, f)).not.toMatch(/from ['"](node:)?fs['"]/);
    }
  });

  it('next.config.ts embeds the metadata through env', () => {
    const config = readFileSync(join(ROOT, 'next.config.ts'), 'utf8');
    expect(config).toMatch(/env:\s*\{\s*BUILD_META_JSON:\s*embeddedBuildMeta\(process\.env, readFileSync\)/);
  });

  it('the route reads one snapshot, projects it, and regenerates every 5 minutes', () => {
    const route = readFileSync(join(ROOT, 'src/app/experiment/page.tsx'), 'utf8');
    expect(route).toContain('export const revalidate = 300;');
    expect(route.match(/getExperimentSnapshot\(/g)).toHaveLength(1);
    expect(route).toContain('toLivePageDisplay(toLivePageModel(await getExperimentSnapshot()');
    expect(route).not.toMatch(/searchParams|cookies\(|headers\(|ExperimentBeacon|setInterval|'use client'/);
  });
});

describe('every state, every runtime', () => {
  it.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('dev-host fixture %s: audits clean, dates as <time>, never "{date}"', (_id, display) => {
    const d = display();
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      const h = page(d, { runtime });
      expect(h).not.toContain('{date}');
      expect(audit(h)).toEqual([]);
    }
  });

  it.each(FIXTURES)('%s: audits clean, no quota claim, no group note, no own-view mark, no p-value', (name, s) => {
    const d = displayOf(s);
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      const h = page(d, { runtime });
      expect(audit(h), `${name} ${runtime}`).toEqual([]);
      const t = everything(h);
      expect(t, name).not.toMatch(/under half|quota|command allowance|free monthly/i);
      expect(t, name).not.toMatch(/you are in group|your view|this view/i);
      expect(t, name).not.toMatch(/p-value|p =|chi-square|χ²/i);
      expect(h, name).not.toContain('data-your-view');
      // A next step's date is printed as a <time>, never as its placeholder.
      expect(h, name).not.toContain('{date}');
    }
  });

  it.each(MODES.filter((m) => m === 'held' || m === 'unavailable' || m === 'not-started' || m === 'aa-failed' || m === 'closure-check'))(
    '%s: never paused, running, resumed, passed or calibrating where that would be false',
    (mode) => {
      const t = everything(page(displayOf(snapshotFixture(mode))));
      if (mode !== 'aa-failed') expect(t).not.toMatch(/\bpaused\b/i);
      expect(t).not.toMatch(/still running|is running|resum|split check: passed|SRM passed|Inconclusive at the six-month limit/i);
      if (mode === 'aa-failed' || mode === 'not-started') expect(t).not.toMatch(/calibrating/i);
    },
  );

  it('a held test names only its last clean interval in the table, the no-JS view and the error fallback', () => {
    const d = displayOf(snapshotFixture('held'));
    const last = d.series[d.series.length - 1];
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      const t = sectionText(page(d, { runtime }), 'results');
      if (last) expect(t, runtime).toMatch(/last/i);
      expect(t, runtime).not.toMatch(/now:|current interval/i);
    }
  });
});
