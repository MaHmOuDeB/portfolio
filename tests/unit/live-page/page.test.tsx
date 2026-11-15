// The Live test page (/experiment) as a whole: its first screen in every state (the head, the plain
// opening, the status card with its three-step track, the key points), its order and anchors, the
// heading levels, the method rows, the carried planning copy and its refs,
// the baseline caption, the closure wording, the small-count rule in every place a count can land
// (text, accessible names, tables, the no-JS view, the error fallback and the props a client
// boundary receives), the pre-registration and build lines, and the source rules (no runtime file read, no typed tag).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { detectableX } from '@/components/live-page/DetectableFigure';
import { LIVE_SECTIONS, LivePage } from '@/components/live-page/LivePage';
import { STEPS, currentStep, stateWords } from '@/components/live-page/StatusCard';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.config';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { preregHash } from '@/lib/experiment/prereg-hash';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture, type FixtureRow } from '@/lib/home/fixtures';
import type { HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { LIVE_PAGE_FIXTURES } from '@/lib/live-page/fixtures';
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
const page = (d: LivePageDisplay, o: { host?: string | null; runtime?: Runtime } = {}) =>
  renderToStaticMarkup(<LivePage display={d} host={o.host === undefined ? 'site.example' : o.host} runtime={o.runtime} />);

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
  it('runs the status, the result with the decision, the plan, the health checks, the counting, the data, the close', () => {
    expect(LIVE_SECTIONS.map((s) => s.id)).toEqual(['results', 'plan', 'health', 'funnel', 'check-it-yourself']);
    const h = page(displayOf(snapshotFixture('ab')));
    const sections = all(h).filter((el) => el.tagName === 'section');
    expect(sections.map((el) => attr(el, 'id') ?? attr(el, 'aria-labelledby'))).toEqual([
      'status', 'results', 'plan', 'health', 'funnel', 'check-it-yourself', 'what-this-shows', 'page-cta-title',
    ]);
    const h2 = all(h).filter((el) => el.tagName === 'h2').map((el) => text(el).replace(/\s+/g, ' '));
    expect(h2).toEqual([
      'Where the test stands', 'Result so far', 'The plan, fixed before the start', 'Is the test healthy?', 'How views are counted',
      'Check it yourself', 'What this shows about how I work', 'Find out what I can do for your team.',
    ]);
    expect(all(h).filter((el) => el.tagName === 'h1').map((el) => text(el))).toEqual(['A real A/B test on this site, run in the open.']);
  });

  it('keeps the anchors of the parts that moved into a section', () => {
    const h = page(displayOf(snapshotFixture('ab')));
    for (const id of ['where-it-stands', 'results', 'decision', 'decision-line', 'plan', 'health', 'split-check', 'detectable', 'funnel', 'check-it-yourself']) {
      expect(byId(h, id), id).toBeDefined();
    }
    // The decision and the end sit in the result; the split check and the detectable lift in the health section.
    expect(elements(byId(h, 'results')!).some((el) => attr(el, 'id') === 'decision')).toBe(true);
    for (const id of ['split-check', 'detectable']) expect(elements(byId(h, 'health')!).some((el) => attr(el, 'id') === id), id).toBe(true);
  });

  it('the in-page links point at visible section headings, never into a closed row', () => {
    const h = page(displayOf(snapshotFixture('ab')));
    const nav = all(h).find((el) => attr(el, 'data-section-nav') !== undefined)!;
    const links = elements(nav).filter((el) => el.tagName === 'a').map((a) => [attr(a, 'href'), text(a)]);
    expect(links).toEqual([
      ['#results', 'Result so far'],
      ['#plan', 'The plan'],
      ['#health', 'Is the test healthy?'],
      ['#funnel', 'How views are counted'],
      ['#check-it-yourself', 'Check it yourself'],
    ]);
    const inDetails = new Set(all(h).filter((el) => el.tagName === 'details').flatMap((el) => elements(el).map((c) => attr(c, 'id'))));
    for (const [href] of links) expect(inDetails.has(href!.slice(1)), href).toBe(false);
  });

  it.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('%s: one h1, and no heading skips a level', (_id, display) => {
    const levels = all(page(display())).filter((el) => /^h[1-6]$/.test(el.tagName)).map((el) => Number(el.tagName[1]));
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    levels.forEach((l, i) => {
      if (i > 0) expect(l - levels[i - 1]!, `heading ${i}`).toBeLessThanOrEqual(1);
    });
  });

  it('the result is "so far" until a decision is recorded', () => {
    const title = (h: string) => text(byId(h, 'results-title')!);
    expect(title(page(displayOf(snapshotFixture('calibration'))))).toBe('Result so far');
    expect(title(page(displayOf(snapshotFixture('held'))))).toBe('Result so far');
    for (const mode of ['ship-b', 'stop-for-harm', 'inconclusive'] as const) expect(title(page(displayOf(snapshotFixture(mode)))), mode).toBe('Result');
  });
});

describe('the first screen', () => {
  const firstScreen = (h: string) => {
    const els = all(h);
    const nav = els.findIndex((el) => attr(el, 'data-section-nav') !== undefined);
    return els.slice(0, nav);
  };

  it('opens with the chip, the two-tone h1 and the plain opening, with no method word', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    const head = all(h).find((el) => attr(el, 'data-case-head') !== undefined)!;
    expect(text(elements(head).find((el) => attr(el, 'data-chip') !== undefined)!)).toBe('Live test');
    const h1 = elements(head).find((el) => el.tagName === 'h1')!;
    expect(text(elements(h1).find((el) => attr(el, 'data-quiet') !== undefined)!)).toBe('run in the open.');
    const opening = text(elements(head).find((el) => el.tagName === 'p')!).replace(/\s+/g, ' ');
    expect(opening).toBe(
      'The test is about the three featured cards on the home page. In group A their headlines name the topic; in group B they state the finding. ' +
        'The question is whether the finding headlines get more clicks. I published the plan before any data came in, and this page shows every step, ' +
        'including a result that may well be: not enough data to say.',
    );
    expect(opening).not.toMatch(/beacon|guardrail|SRM|confidence|interval|calibrat|entry view|hash/i);
  });

  it('the opening repeats the pre-registration: three featured cards, topic against finding', () => {
    const prereg = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8').replace(/\s+/g, ' ');
    expect(prereg).toContain('the headline of the three featured cards on the home page');
    expect(prereg).toContain('Group A names the topic.');
    expect(prereg).toContain('Group B states the finding.');
    expect(prereg).toContain('committed before data collection');
  });

  it('then the status card, then four key points, then the in-page links', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    const marks = all(h).flatMap((el) =>
      attr(el, 'data-case-head') !== undefined ? ['head'] : attr(el, 'data-live-status') !== undefined ? ['status'] : attr(el, 'data-key-points') !== undefined ? ['points'] : attr(el, 'data-section-nav') !== undefined ? ['nav'] : el.tagName === 'section' && attr(el, 'id') === 'results' ? ['results'] : [],
    );
    expect(marks).toEqual(['head', 'status', 'points', 'nav', 'results']);
    const titles = all(h).filter((el) => attr(el, 'data-key-title') !== undefined).map((el) => text(el));
    expect(titles).toEqual(['What is tested', 'Where it stands', 'What I expect', 'Why run it then']);
  });

  it.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('%s: the track has three steps, at most one current, marked by more than colour', (_id, display) => {
    const d = display();
    const h = page(d);
    const track = all(h).find((el) => attr(el, 'data-live-track') !== undefined)!;
    const steps = elements(track).filter((el) => el.tagName === 'li');
    expect(steps.map((li) => attr(li, 'data-step'))).toEqual(STEPS.map((s) => s.id));
    const current = steps.filter((li) => attr(li, 'aria-current') === 'step');
    const at = currentStep(d);
    expect(current.map((li) => attr(li, 'data-step'))).toEqual(at === null ? [] : [at]);
    for (const li of current) {
      // A word in a chip and a heavier name, not only a colour.
      const chip = elements(li).find((el) => attr(el, 'data-chip') !== undefined)!;
      expect(text(chip)).toMatch(/^(Now|Paused|Stopped|Closed|Reached)$/);
      // "Now" only while nothing has stopped the test for good; "Closed" only for a confirmed stop.
      if (text(chip) === 'Closed') expect(d.closedConfirmed).toBe(true);
      if (['held', 'aa-failed', 'settings-unreadable', 'paused'].includes(d.mode) || d.outcome !== null) expect(text(chip)).not.toBe('Now');
      expect(elements(li).some((el) => /\bfont-semibold\b/.test(attr(el, 'class') ?? ''))).toBe(true);
    }
    // A step before the current one is done, and says so in a word; a step is never done when none is current.
    const states = steps.map((li) => attr(li, 'data-step-state'));
    const i = states.indexOf('current');
    expect(states).toEqual(STEPS.map((_s, k) => (i === -1 ? 'upcoming' : k < i ? 'done' : k === i ? 'current' : 'upcoming')));
    steps.forEach((li, k) => expect(/Done/.test(text(li)), `step ${k}`).toBe(states[k] === 'done'));
    // No decision reached unless one is recorded; no step marked when the page has no data to say so.
    if (d.outcome === null) expect(at).not.toBe('decision');
    if (d.public.source === 'unavailable' && d.outcome === null) expect(at).toBeNull();
  });

  it.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('%s: every status cell has a label and a value, and none promises what the state does not hold', (_id, display) => {
    const d = display();
    const h = page(d);
    const card = all(h).find((el) => attr(el, 'data-live-status') !== undefined)!;
    const cells = elements(card).filter((el) => attr(el, 'data-status-cell') !== undefined);
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(attr(elements(card).find((el) => attr(el, 'data-status-cells') !== undefined)!, 'data-count')).toBe(String(cells.length));
    for (const cell of cells) {
      const dt = elements(cell).filter((el) => el.tagName === 'dt');
      const dd = elements(cell).filter((el) => el.tagName === 'dd');
      expect(dt).toHaveLength(1);
      expect(text(dt[0]!).trim().length).toBeGreaterThan(0);
      expect(dd.length).toBeGreaterThanOrEqual(1);
      for (const v of dd) expect(text(v).trim().length, attr(cell, 'data-status-cell')).toBeGreaterThan(0);
    }
    const kinds = cells.map((c) => attr(c, 'data-status-cell'));
    expect(kinds[0]).toBe('state');
    expect(text(elements(card).find((el) => attr(el, 'data-status-words') !== undefined)!)).toBe(stateWords(d));
    // The state's own sentences are in the card, once on the page.
    expect(all(h).filter((el) => attr(el, 'data-live-state') !== undefined)).toHaveLength(1);
    expect(elements(card).some((el) => attr(el, 'data-live-state') === d.mode)).toBe(true);
    // Progress only while the test is collecting or running on data the page has.
    const collecting = ['before-data', 'calibration', 'ab'].includes(d.mode) && !d.countingClosed && d.outcome === null && d.public.source !== 'unavailable';
    expect(kinds.includes('progress')).toBe(collecting);
    // A date only where the page has one: the decision's day, or the planned or earliest end.
    const date = cells.find((c) => attr(c, 'data-status-cell') === 'date');
    if (date) {
      expect(elements(date).filter((el) => el.tagName === 'time')).toHaveLength(1);
      expect(text(elements(date).find((el) => el.tagName === 'dt')!)).toBe(d.outcome !== null ? 'Decided on' : d.plannedEndKind === 'earliest' ? 'Time limit' : 'Planned end');
    }
    if (d.public.source === 'unavailable') expect(kinds).toEqual(['state']);
    // "A decision can end the test sooner" only while the test is collecting.
    if (!collecting) expect(text(card)).not.toContain('A decision can end the test sooner.');
    // Every number in the card is marked with where it comes from.
    for (const el of elements(card).filter((e) => e.tagName === 'data' || e.tagName === 'time')) expect(attr(el, 'data-derived')).toBeTruthy();
    expect(audit(h)).toEqual([]);
  });

  it('a collecting calibration: progress toward the first estimate, the earliest end, and a comparison that has not started', () => {
    const d = displayOf(cal(0, 0));
    const h = page(d);
    const card = all(h).find((el) => attr(el, 'data-live-status') !== undefined)!;
    const cell = (kind: string) => text(elements(card).find((el) => attr(el, 'data-status-cell') === kind)!).replace(/\s+/g, ' ');
    expect(cell('state')).toContain('StatusCalibrating');
    expect(cell('progress')).toBe('Progress0 of 50views in the smaller group. Estimates appear at 50 views per group.');
    expect(cell('date')).toMatch(/^Time limit\d{2}\.\d{2}\.\d{4}A decision can end the test sooner\.$/);
    const points = all(h).filter((el) => attr(el, 'data-key-body') !== undefined).map((el) => text(el).replace(/\s+/g, ' '));
    expect(points[0]).toBe(
      'The three featured cards on the home page. Group A: headlines that name the topic. Group B: headlines that state the finding. Nothing else differs. ' +
        'The comparison starts after the calibration; during it both groups see group A’s headlines.',
    );
    expect(points[1]).toBe(
      'Calibrating. Calibration is a dry run: both groups see the same headlines, so the counting and the split can be checked before the real comparison starts.',
    );
    expect(points[2]).toBe(
      'Probably no clear answer. At the planned 225 views per group, only a lift of about 15 percentage points would be found 8 times in 10, and I said so before the test started.',
    );
    expect(points[3]).toBe(
      'Because how a test is planned, checked and reported matters more than whether it wins. The results here can be recomputed from the published data.',
    );
    // The small-count rule holds in the card too.
    const tiny = page(displayOf(cal(1, 4)));
    expect(text(all(tiny).find((el) => attr(el, 'data-status-cell') === 'progress')!)).toContain('<5 of 50');
  });

  it('the first screen never says the two groups see different headlines while the configuration is in the calibration', () => {
    for (const f of LIVE_PAGE_FIXTURES) {
      const d = f.display();
      const said = firstScreen(page(d)).filter((el) => el.tagName === 'p' || el.tagName === 'dd' || el.tagName === 'li').map((el) => text(el)).join(' ');
      if (d.configPhase === 'calibration' && d.outcome === null) {
        expect(said, f.id).toContain('The comparison starts after the calibration');
        expect(said, f.id).not.toMatch(/groups see different headlines|half of the visits/i);
      } else {
        expect(said, f.id).not.toContain('The comparison starts after the calibration');
      }
      // The dry-run gloss only while a calibration is collecting; "expect" turns to "expected" once decided.
      expect(/Calibration is a dry run/.test(said), f.id).toBe(d.configPhase === 'calibration' && ['before-data', 'calibration'].includes(d.mode) && !d.countingClosed);
      expect(/What I expected/.test(firstScreen(page(d)).map((el) => (attr(el, 'data-key-title') !== undefined ? text(el) : '')).join(' ')), f.id).toBe(d.outcome !== null);
    }
  });

  it('the calibration gloss and the plan card repeat the pre-registration', () => {
    const prereg = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8').replace(/\s+/g, ' ');
    expect(prereg).toContain('Both groups see group A.');
    expect(prereg).toContain('About 15 percentage points at 225 views per group.');
    expect(prereg).toContain('first decision is final');
    expect(prereg).toContain('its interval and verdict change once a day');
    expect(prereg).toContain('never "no effect"');
  });
});

describe('the result so far', () => {
  const inResults = (h: string, name: string) => elements(byId(h, 'results')!).filter((el) => attr(el, name) !== undefined);
  const lead = (h: string) => inResults(h, 'data-lead-in').map((el) => text(el).replace(/\s+/g, ' '));
  const takeaway = (h: string) => inResults(h, 'data-takeaway').map((el) => text(el).replace(/\s+/g, ' '));

  it('collecting: the hollow mark is named, the threshold is the takeaway, and no decision yet', () => {
    const h = page(displayOf(cal(10, 12)));
    expect(lead(h)).toEqual(['What to look atThe hollow mark stands in for the bar: the range of differences between the groups that the data are compatible with.']);
    expect(takeaway(h)).toEqual(['What it meansNo estimate is drawn until each group has 50 views. That threshold was fixed before the start.']);
    expect(text(byId(h, 'decision-line')!)).toBe('No decision yet.');
    const sheet = inResults(h, 'data-figure-sheet')[0]!;
    expect(elements(sheet).some((el) => el.tagName === 'figure')).toBe(true);
  });

  it('a calibration with an interval says the bar should include zero, never that B is ahead', () => {
    const h = page(displayOf(narrativeFixture('calibration-ready')));
    expect(lead(h).join(' ')).toContain('In the calibration both groups see the same page, so the bar should include zero.');
    expect(lead(h).join(' ')).not.toMatch(/B is ahead/);
    expect(takeaway(h)).toEqual([]);
  });

  it('an A/B with an interval reads the bar against zero; "yet" only while the test is open', () => {
    expect(lead(page(displayOf(snapshotFixture('ab')))).join(' ')).toContain('Wholly on the side marked B higher, B is ahead; across zero, there is no clear answer yet.');
    const decided = lead(page(displayOf(snapshotFixture('inconclusive')))).join(' ');
    if (decided !== '') expect(decided).not.toMatch(/\byet\b/);
  });

  it.each(LIVE_PAGE_FIXTURES.map((f) => [f.id, f.display] as const))('%s: no lead-in or sheet around a sentence, and "yet" only where a decision can still come', (_id, display) => {
    const d = display();
    const h = page(d);
    const hasFigure = elements(byId(h, 'results')!).some((el) => el.tagName === 'figure');
    expect(lead(h).length, 'lead-in').toBe(hasFigure ? 1 : 0);
    expect(elements(byId(h, 'results')!).some((el) => attr(el, 'data-figure-sheet') !== undefined)).toBe(hasFigure);
    const line = text(byId(h, 'decision-line')!);
    if (d.outcome !== null) expect(line).toMatch(/^Decision: /);
    else if (['not-started', 'before-data', 'calibration', 'ab', 'paused'].includes(d.mode) && !(d.countingClosed && d.closedConfirmed)) expect(line).toBe('No decision yet.');
    else expect(line).toBe('No decision is shown.');
    // The hollow mark is promised only where the Figure draws no interval.
    if (lead(h).join(' ').includes('hollow mark')) expect(d.series).toHaveLength(0);
  });
});

describe('the method, one click deeper', () => {
  const rows = (h: string) =>
    all(h)
      .filter((el) => el.tagName === 'details' && attr(el, 'data-method') !== undefined)
      .map((el) => ({ summary: text(elements(el).find((c) => c.tagName === 'summary')!).trim(), body: text(elements(el).find((c) => attr(c, 'data-method-body') !== undefined)!).replace(/\s+/g, ' '), open: attr(el, 'open') !== undefined }));

  it('has the five rows, all closed, in page order', () => {
    const r = rows(page(displayOf(withExclusions(cal(60, 60)))));
    expect(r.map((x) => x.summary)).toEqual([
      'Pre-registration record', 'How the line is computed', 'The method, for the curious', 'Why views were not counted', 'How the script treats small counts',
    ]);
    expect(r.every((x) => !x.open)).toBe(true);
    expect(r[1]!.body).toBe('It is computed for one look at n under the confidence sequence’s boundary, not the power of the sequential stopping rule.');
    expect(r[2]!.body).toMatch(/^The beacon on the home page \(a small signal the page sends when it loads\) sends events, and the server decides which of them count\./);
    expect(r[3]!.body).toContain('Entries turned away, by reason');
    expect(r[3]!.body).toContain('Preview deployments: 0.');
    expect(r[4]!.body).toMatch(/^The script uses the Python standard library only/);
  });

  it('the figures sit on sheets, each with its badge and its table', () => {
    const h = page(displayOf(cal(60, 60)), { runtime: 'no-js' });
    const sheets = all(h).filter((el) => attr(el, 'data-figure-sheet') !== undefined);
    expect(sheets).toHaveLength(3);
    for (const sheet of sheets) {
      expect(elements(sheet).filter((el) => el.tagName === 'figure')).toHaveLength(1);
      expect(elements(sheet).some((el) => el.tagName === 'table')).toBe(true);
      expect(text(sheet)).toMatch(/Simulated|Live from this site/);
    }
    // The four counting stages are one list of joined cells: a row from md, a column on a phone.
    const funnel = all(h).find((el) => attr(el, 'data-funnel') !== undefined)!;
    expect(elements(funnel).filter((el) => el.tagName === 'li')).toHaveLength(4);
    expect(attr(funnel, 'class')).toMatch(/\bmd:grid-cols-4\b/);
    expect(attr(funnel, 'class')).toMatch(/\bdivide-y\b.*\bmd:divide-x\b/);
  });
});

describe('the carried planning copy', () => {
  const h = page(displayOf(snapshotFixture('calibration')));
  const plan = byId(h, 'plan-planning')!;

  it('quotes the v1 plan, with the guardrail disclosure and the unit', () => {
    expect(elements(plan).filter((el) => el.tagName === 'p').map((p) => text(p).replace(/\s+/g, ' ')).join(' ')).toBe(
      'I planned the test at 225 views per group. At that size, the smallest lift it would find 8 times in 10 is about 15 percentage points. ' +
        'Even a 5-point lift would be found about 1 time in 20. Inconclusive is the likely, honest outcome. ' +
        'There is also a guardrail, a second measure that must not get worse: quick exits. A quick exit is a view whose visitor leaves within 5 seconds without interacting. ' +
        'To ship B, the data must rule out a rise in quick exits of 10 percentage points or more. ' +
        'To show that, even two identical groups would need about 390 to 470 entry views (fresh arrivals on the home page) each. ' +
        'That is a planning figure, not a target. ' +
        'The test counts views, not people: one person can count more than once, and in both groups.',
    );
  });

  it('the guardrail gloss repeats the pre-registration: 5 seconds, +10 points, 390 to 470 entry views for identical groups', () => {
    const prereg = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8').replace(/\s+/g, ' ');
    expect(prereg).toContain('Quick exit: the visitor leaves within 5 seconds without interacting. Denominator: entry views. Margin: +10 percentage points.');
    expect(prereg).toContain('the quick-exit interval\'s upper bound is below +10 percentage points');
    expect(prereg).toContain('ship B needs about 390 to 470 entry views per group even when the two groups are identical');
    expect(prereg).toContain('n counts views, not people; one person can count more than once and in both groups');
  });

  it('explains "pre-registered" once, where the plan starts', () => {
    const t = sectionText(h, 'plan');
    const gloss = 'Pre-registered means the design, the numbers I plan with and the decision rule were fixed and published before any visitor was counted, so they cannot be changed quietly after seeing results.';
    expect(t).toContain(`The plan, fixed before the start ${gloss}`.replace('start ', 'start'));
    expect(everything(h).split('Pre-registered means')).toHaveLength(2);
  });

  it('starts no sentence with a lowercase letter', () => {
    for (const p of elements(plan).filter((el) => el.tagName === 'p')) expect(text(p).trim()).toMatch(/^[A-Z]/);
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
      ['5', '5', 'build'],
      ['10', '10', 'build'],
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
      'The split check asks whether the two groups got the share of views chance would give them (sample ratio mismatch, SRM). If it fails, the split is further from even than chance would plausibly give, so something may have moved views between the groups, and no result is shown. Because it is checked at every completed day, the chance of a false flag over the whole run is about 1% to 3%.',
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
    // The x axis starts where the curve starts (or at the current point, if that is smaller), not at 0.
    const current = typeof d.counts.smaller === 'number' ? d.counts.smaller : Infinity;
    expect(domain.x[0]).toBe(Math.min(...pts.map((p) => p.nPerArm), current));
    expect(domain.x[0]).toBeGreaterThan(0);
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
  it('draws the exclusion reasons as a wrapping text table, never a sideways-scrolling one', () => {
    const h = page(displayOf(withExclusions(cal(60, 60))));
    const box = byId(h, 'live-exclusions')!;
    const table = elements(box).find((el) => el.tagName === 'table')!;
    expect(attr(table, 'data-stacked-table')).toBe('');
    expect(attr(table, 'role')).toBe('table');
    expect(elements(box).some((el) => /\boverflow-x-auto\b/.test(attr(el, 'class') ?? ''))).toBe(false);
    for (const td of elements(table).filter((el) => el.tagName === 'td')) {
      expect(attr(td, 'data-derived')).toBeTruthy();
      // The meanings (every cell after the reason) are sentences: they wrap.
      if (attr(td, 'data-label') !== undefined) expect(attr(td, 'class') ?? '').not.toMatch(/whitespace-nowrap/);
    }
    const counts = elements(table).filter((el) => el.tagName === 'td' && attr(el, 'data-label') === 'Entries');
    expect(counts.length).toBe(7);
    for (const c of counts) expect(attr(c, 'data-num')).toBe('');
  });

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

describe('the detectable-lift x axis', () => {
  const pts = [{ n: 50 }, { n: 100 }, { n: 400 }, { n: 1000 }];

  it('starts at the curve\'s first x and labels that start', () => {
    const { domain, ticks } = detectableX(pts, null);
    expect(domain[0]).toBe(50);
    expect(domain[1]).toBeGreaterThanOrEqual(1000);
    for (const t of [ticks.narrow, ticks.wide]) {
      expect(t[0]).toBe(50);
      expect(t.every((v, i) => i === 0 || v > t[i - 1]!)).toBe(true);
      expect(t.every((v) => v >= domain[0] && v <= domain[1])).toBe(true);
      // No nice tick crowds the start: the gap to the next is at least half a step.
      if (t.length > 2) expect(t[1]! - t[0]!).toBeGreaterThanOrEqual((t[2]! - t[1]!) / 2);
    }
  });

  it('reaches back to a current point left of the curve', () => {
    expect(detectableX(pts, 30).domain[0]).toBe(30);
    expect(detectableX(pts, 300).domain[0]).toBe(50);
  });

  it('falls back to 0 with no points', () => {
    expect(detectableX([], null).domain).toEqual([0, 1]);
  });
});

describe('the split-check status words', () => {
  it('are plain semibold words, not outlined pills', () => {
    for (const [name, s] of FIXTURES) {
      for (const el of all(page(displayOf(s))).filter((e) => attr(e, 'data-status') !== undefined)) {
        const cls = attr(el, 'class') ?? '';
        expect(cls, name).toMatch(/\bfont-semibold\b/);
        expect(cls, name).not.toMatch(/\b(border|rounded)/);
      }
    }
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
    const link = all(h).find((el) => el.tagName === 'a' && attr(el, 'href') === `${CONTACT.github}/portfolio/blob/${config.prereg.tag}/docs/experiment/prereg.md`);
    expect(link).toBeDefined();
    expect(text(byId(h, 'plan-build')!).replace(/\s+/g, ' ')).toBe('This page was built from commit abcdef0.');
  });

  it('breaks the design hash anywhere but keeps its last 8 characters together', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    const hash = elements(byId(h, 'plan-prereg')!).find((el) => el.tagName === 'data' && attr(el, 'value') === preregHash())!;
    expect(attr(hash, 'class') ?? '').toMatch(/\bbreak-all\b/);
    expect(text(hash)).toBe(preregHash());
    const tail = elements(hash).find((el) => el.tagName === 'span')!;
    expect(attr(tail, 'class') ?? '').toMatch(/\bwhitespace-nowrap\b/);
    expect(text(tail)).toBe(preregHash().slice(-8));
  });

  it('shows no build line when the build commit is null: never "Not recorded", never "unknown"', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    expect(byId(h, 'plan-build')).toBeUndefined();
    expect(everything(h)).not.toMatch(/unknown|Not recorded|Build commit/i);
  });

  it('shows the hash\'s first 12 characters in a code chip, and keeps the full value in the record row', () => {
    const h = page(displayOf(snapshotFixture('calibration')));
    const line = byId(h, 'plan-prereg-short')!;
    expect(text(line).replace(/\s+/g, ' ')).toBe(`Pre-registration ${EXPERIMENT.prereg.version}, design hash ${preregHash().slice(0, 12)}.`);
    const chip = elements(line).find((el) => el.tagName === 'code')!;
    const data = elements(chip).find((el) => el.tagName === 'data')!;
    expect(attr(data, 'value')).toBe(preregHash());
    expect(attr(data, 'data-derived')).toBe('build');
    expect(attr(chip, 'class') ?? '').toMatch(/\bwhitespace-nowrap\b/);
    // The full value, the tag and the build commit are in the "Pre-registration record" row.
    const record = all(h).find((el) => el.tagName === 'details' && elements(el).some((c) => attr(c, 'id') === 'plan-prereg'))!;
    expect(text(elements(record).find((el) => el.tagName === 'summary')!).trim()).toBe('Pre-registration record');
    expect(text(record)).toContain(preregHash());
    expect(all(h).filter((el) => el.tagName === 'details' && elements(el).some((c) => attr(c, 'id') === 'plan-prereg-short'))).toHaveLength(0);
  });

  it('no file of the page types the version or the tag', () => {
    const files = [...readdirSync(join(ROOT, 'src/components/live-page')).map((f) => join(ROOT, 'src/components/live-page', f)), join(ROOT, 'src/app/experiment/page.tsx')];
    for (const f of files) expect(readFileSync(f, 'utf8'), relative(ROOT, f)).not.toMatch(/['"`]v1|prereg-v1/);
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
