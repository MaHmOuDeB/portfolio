// The Live test page's state copy (StateExplanation): the exact sentence for every state, read from
// the display shape only. The closure, unreadable and held cases run the real reader over an
// in-memory store, so each sentence is checked against what the reader really returns. A stop is
// said to have happened only when it is confirmed; a stored stop never promises an update, a resume
// or a date that moves; a held test never reads as running, passed or inconclusive.
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { StateExplanation } from '@/components/live-page/StateExplanation';
import { FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import { NO_FLAGS, parseFlags, type ExperimentFlags } from '@/lib/experiment/flags';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { keys } from '@/lib/experiment/keys';
import { plannedEnd } from '@/lib/experiment/time';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import type { HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { toLivePageDisplay, toLivePageModel } from '@/lib/live-page/model';
import { CLOSED_STEP, CONFIRMING_STEP } from '@/lib/live-page/next-step';
import { AB_NOW, BUILD_PRODUCTION, CAL_NOW, INCONSISTENT, SHIP_B, mark, read, seed, type G } from './reader';

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;
const endPlus = (ms: number) => new Date(Date.parse(END) + ms).toISOString();
const configOf = (s: ExperimentSnapshot): ExperimentConfig => (s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION);
const displayOf = (s: ExperimentSnapshot) => toLivePageDisplay(toLivePageModel(s, { commit: null }, configOf(s)));
const html = (s: ExperimentSnapshot) => renderToStaticMarkup(<StateExplanation model={displayOf(s)} />);

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
const paragraphs = (h: string) => elements(parse(h)).filter((el) => el.tagName === 'p').map(text);
/** The state sentence(s): the first paragraph. */
const sentence = (h: string) => paragraphs(h)[0] ?? '';
/** The next-step paragraph, if any. */
const next = (h: string) => elements(parse(h)).filter((el) => attr(el, 'data-next-step') !== undefined).map(text)[0] ?? null;
/** Everything a reader or a screen reader gets: text nodes and labelling attributes. */
const everything = (h: string) =>
  [text(parse(h)), ...elements(parse(h)).flatMap((el) => ['aria-label', 'title', 'aria-description', 'alt'].map((n) => attr(el, n) ?? ''))].join(' ');
const times = (h: string) => elements(parse(h)).filter((el) => el.tagName === 'time').map((el) => ({ dateTime: attr(el, 'datetime'), refs: attr(el, 'data-derived'), text: text(el) }));
const audit = (h: string) => auditHtml(h, { route: '/experiment', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

const ALL: [string, ExperimentSnapshot][] = [
  ...MODES.map((m) => [m, snapshotFixture(m)] as [string, ExperimentSnapshot]),
  ...NARRATIVE_FIXTURES.map((n) => [n, narrativeFixture(n)] as [string, ExperimentSnapshot]),
];

describe('StateExplanation: the exact copy of each state', () => {
  it('not started', () => {
    const h = html(snapshotFixture('not-started'));
    expect(sentence(h)).toBe('The experiment has not started. Nothing is counted yet.');
    expect(next(h)).toBeNull();
    expect(everything(h)).not.toMatch(/paused|could not be loaded|calibrat/i);
  });

  it('unavailable, distinct from paused, and never closed before the end', () => {
    const h = html(snapshotFixture('unavailable'));
    expect(sentence(h)).toBe('The live counts could not be loaded. They will appear at the next update.');
    expect(everything(h)).not.toMatch(/paused|stopped|closed/i);
  });

  it('unavailable before, at and after the planned end (the real reader)', async () => {
    const at = async (now: string) =>
      html(await getExperimentSnapshot({ env: BUILD_PRODUCTION, mode: 'none', read: null, write: null, now: () => new Date(now), config: FIXTURE_AB, log: () => {} }));
    expect(sentence(await at(endPlus(-1)))).toBe('The live counts could not be loaded. They will appear at the next update.');
    for (const now of [END, endPlus(86_400_000)]) {
      const h = await at(now);
      expect(sentence(h)).toBe('The live counts could not be loaded, and counting has closed.');
      expect(everything(h)).not.toMatch(/next update|paused|inconclusive|ship|harm/i);
    }
  });

  it('unavailable with a derived final status and no confirmed stop promises nothing', () => {
    const u = snapshotFixture('unavailable');
    const h = html({ ...u, status: 'ship-b', live: { ...u.live, phase: 'ship-b' } });
    expect(sentence(h)).toBe('The live counts could not be loaded.');
  });

  it('settings that could not be read: the same text on two read dates, no stop date (the real reader)', async () => {
    const out: string[] = [];
    for (const now of [CAL_NOW, '2026-11-25T10:00:00Z']) {
      const redis = createMemoryRedis();
      await seed(redis, FIXTURE_CALIBRATION.namespace, [{ day: '2026-11-03', a: { entry: 70, inview: 60 }, b: { entry: 70, inview: 60 } }]);
      out.push(html(await read(redis, { config: FIXTURE_CALIBRATION, now, flags: parseFlags({ unexpected: true }) })));
    }
    expect(out[0]).toBe(out[1]);
    expect(sentence(out[0]!)).toBe('Counting is stopped because the experiment settings could not be read.');
    expect(out[0]).not.toContain('<time');
    expect(text(parse(out[0]!))).not.toMatch(/\d/);
  });

  it('held on inconsistent counts, before and at the cap (the real reader)', async () => {
    for (const now of [AB_NOW, endPlus(86_400_000)]) {
      const redis = createMemoryRedis();
      await seed(redis, FIXTURE_AB.namespace, INCONSISTENT);
      const h = html(await read(redis, { config: FIXTURE_AB, now }));
      expect(sentence(h)).toBe(
        'The test stopped because the counts failed a consistency check. Results use only the data up to the last check that passed. The check failed on 02.12.',
      );
      expect(next(h)).toBeNull();
    }
  });

  it('held on the interval check names the interval', () => {
    const h = html(snapshotFixture('held', { held: { on: '2026-12-02', reason: 'band-conflict' } }));
    expect(sentence(h)).toBe(
      'The test stopped because the interval failed a consistency check. Results use only the data up to the last check that passed. The check failed on 02.12.',
    );
  });

  it('held with a failed split: base and day only, no counts from the fault on (the real reader)', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, [
      INCONSISTENT[0]!,
      { day: '2026-12-02', a: { entry: 300, inview: 5, engaged: 5, card: 100 }, b: { entry: 20, inview: 5, engaged: 5, card: 1 } },
    ]);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    expect(s.status).toBe('srm-suppressed');
    const h = html(s);
    expect(sentence(h)).toBe(
      'The test stopped because the counts failed a consistency check. Results use only the data up to the last check that passed. The check failed on 02.12. The split check also failed on 02.12, on entry views.',
    );
    expect(h).not.toContain('data-derived="live">300');
  });

  it('a failed split names its base and day, with the published cells', async () => {
    const at = async (a: G, b: G) => {
      const redis = createMemoryRedis();
      await seed(redis, FIXTURE_AB.namespace, [{ day: '2026-12-01', a, b }]);
      return html(await read(redis, { config: FIXTURE_AB, now: AB_NOW }));
    };
    expect(sentence(await at({ entry: 120, inview: 50, engaged: 120 }, { entry: 60, inview: 50, engaged: 60 }))).toBe(
      'The split check failed, so no result is shown. It failed on 01.12, on entry views. Entry views at that check: 120 in group A and 60 in group B.',
    );
    const small = await at({ entry: 60, inview: 3, engaged: 3 }, { entry: 4, inview: 2, engaged: 2 });
    expect(sentence(small)).toBe(
      'The split check failed, so no result is shown. It failed on 01.12, on entry views. Entry views at that check: 60 in group A and <5 in group B.',
    );
  });

  it('a failed calibration: its date and reason, a restart only on a configured date still ahead', () => {
    const rows = [{ day: '2026-11-03', a: { entry: 30, inview: 20 }, b: { entry: 30, inview: 20 } }];
    const flags = (restartsOn?: string): ExperimentFlags => ({
      ...NO_FLAGS,
      aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a script error dropped some views.', ...(restartsOn ? { restartsOn } : {}) },
    });
    const at = (f: ExperimentFlags) => html(buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: f, rows }));
    const plain = at(flags());
    expect(sentence(plain)).toBe('Calibration stopped on 06.11: a script error dropped some views.');
    expect(next(plain)).toBeNull();
    const restarts = at(flags('2026-12-01T00:00:00+01:00'));
    expect(sentence(restarts)).toBe('Calibration stopped on 06.11: a script error dropped some views.');
    expect(next(restarts)).toBe('The calibration restarts on 01.12.');
    expect(times(restarts)).toContainEqual({ dateTime: '2026-12-01T00:00:00+01:00', refs: 'build', text: '01.12' });
    expect(next(at(flags('2026-11-15T00:00:00+01:00')))).toBeNull();
    for (const h of [plain, restarts]) expect(everything(h)).not.toMatch(/calibrating|It is calibrating first/i);
  });

  it('a failed calibration on the split keeps the split warning', () => {
    const s = buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, rows: [{ day: '2026-11-03', a: { entry: 120, inview: 50, engaged: 50 }, b: { entry: 60, inview: 50, engaged: 50 } }] });
    expect(sentence(html(s))).toBe(
      'Calibration stopped on 03.11: the split check failed. It failed on 03.11, on entry views. Entry views at that check: 120 in group A and 60 in group B.',
    );
  });

  it('paused: the flag’s own date and reason', () => {
    const h = html(snapshotFixture('paused'));
    expect(sentence(h)).toBe('Paused on 10.11: I am updating the page.');
    expect(everything(h)).not.toMatch(/once it resumes|resum/i);
  });

  it('calibration: readiness only when the check says ready', () => {
    expect(sentence(html(snapshotFixture('before-data')))).toBe('Calibrating: both groups see the same page.');
    expect(sentence(html(narrativeFixture('calibration-under-50')))).toBe('Calibrating: both groups see the same page.');
    // The calibration fixture's own check is ready (evaluated on its last completed look).
    const cal = snapshotFixture('calibration');
    expect(cal.calibration).toMatchObject({ ready: true, evaluatedOn: '2026-11-15' });
    expect(sentence(html(cal))).toBe('Calibrating: both groups see the same page. The calibration passed its checks on 15.11.');
    const ready = narrativeFixture('calibration-ready');
    expect(sentence(html(ready))).toBe('Calibrating: both groups see the same page. The calibration passed its checks on 16.11.');
    // An interval and an evaluation day without ready never say passed or ready.
    const notReady = { ...ready, calibration: { ...ready.calibration!, ready: false } };
    expect(everything(html(notReady))).not.toMatch(/passed|ready/i);
    // The A/B never starts by itself: a start is announced only on a configured date.
    expect(everything(html(ready))).not.toMatch(/starts|automatic/i);
    const withStart = { ...ready, live: { ...ready.live, abStartedOn: '2026-12-01T00:00:00+01:00' } };
    expect(next(html(withStart))).toBe('The A/B test starts on 01.12.');
  });

  it('a running A/B: its start date, nothing about the reader’s group', () => {
    const h = html(snapshotFixture('ab'));
    expect(sentence(h)).toBe('A/B started 01.12.');
    expect(next(h)).toBeNull();
  });

  it('the planned end reached with no recorded decision: closed, nothing invented', () => {
    const h = html(narrativeFixture('closed-under-50'));
    expect(sentence(h)).toBe('Counting has closed; no decision is recorded in this snapshot.');
    expect(everything(h)).not.toMatch(/inconclusive|ship|harm/i);
  });

  it('final decisions: confirmed by a stored stop or still being confirmed', () => {
    const confirmed = html(narrativeFixture('ship-b-confirmed'));
    expect(sentence(confirmed)).toBe('Ship B.');
    expect(next(confirmed)).toBe(CLOSED_STEP);
    const derived = html(snapshotFixture('ship-b'));
    expect(sentence(derived)).toBe('Ship B.');
    expect(next(derived)).toBe(CONFIRMING_STEP);
    expect(sentence(html(snapshotFixture('stop-for-harm')))).toBe('Stop for harm.');
    expect(sentence(html(snapshotFixture('inconclusive')))).toBe('Inconclusive at the limit; this is not evidence of no effect.');
    expect(next(html(snapshotFixture('inconclusive')))).toBe(CLOSED_STEP);
  });

  it('a final decision with a later failed split keeps the decision and says so', () => {
    expect(sentence(html(narrativeFixture('ship-b-late-srm')))).toBe('Ship B. A later split check failed; the recorded decision is unchanged.');
  });

  it('a derived ship B with no stored marker (the real reader): never stopped, ended or closed', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    const h = html(s);
    expect(displayOf(s).closedConfirmed).toBe(false);
    expect(next(h)).toBe(CONFIRMING_STEP);
    expect(everything(h)).not.toMatch(/counting has stopped|has ended|has closed/i);
  });
});

describe('StateExplanation: the stored-stop check (closure mismatch)', () => {
  const CHECKING = 'Counting has stopped for this run. I am checking the stored result before showing it. Counting stopped on 02.12.';
  const NO_PROMISE = /next update|resum|will appear|paused/i;

  async function abWithMarker(o: { kind: 'decision' | 'held' | 'aa-failed'; rows: boolean; flags?: ExperimentFlags; now?: string }) {
    const redis = createMemoryRedis();
    if (o.rows) await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, o.kind, '2026-12-02');
    return read(redis, { config: FIXTURE_AB, now: o.now ?? AB_NOW, flags: o.flags });
  }
  const retained: ExperimentFlags = { ...NO_FLAGS, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' } };

  it.each([
    ['a mismatching decision, a failure note retained', { kind: 'decision', rows: true, flags: retained }],
    ['a mismatching decision, the note cleared', { kind: 'decision', rows: true, flags: NO_FLAGS }],
    ['a stored decision and no counts', { kind: 'decision', rows: false }],
    ['a stored hold and no counts', { kind: 'held', rows: false }],
    ['a stored calibration failure in the A/B', { kind: 'aa-failed', rows: false }],
  ] as const)('%s: the check sentence with the stored day, no promise, no moving date', async (_name, o) => {
    const first = await abWithMarker(o);
    const later = await abWithMarker({ ...o, now: '2026-12-05T12:00:00+01:00' });
    for (const s of [first, later]) {
      const d = displayOf(s);
      expect(d.mode).toBe('closure-check');
      const h = html(s);
      expect(sentence(h)).toBe(CHECKING);
      expect(next(h)).toBeNull();
      expect(everything(h)).not.toMatch(NO_PROMISE);
      expect(times(h)).toEqual([{ dateTime: '2026-12-02T00:00:00+01:00', refs: 'live', text: '02.12' }]);
    }
    expect(html(first)).toBe(html(later));
  });

  it('a calibration failure stored in the calibration keeps its own sentence, flag retained or cleared', async () => {
    const at = async (flags: ExperimentFlags) => {
      const redis = createMemoryRedis();
      await mark(redis, FIXTURE_CALIBRATION.namespace, 'aa-failed', '2026-11-06');
      return html(await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW, flags }));
    };
    const disagrees = await at({ ...NO_FLAGS, aaFailed: { on: '2026-11-07T09:00:00+01:00', reason: 'later text' } });
    expect(sentence(disagrees)).toBe('Calibration stopped on 06.11: the day I stored for this stop does not match what I see now, so I am checking it.');
    const cleared = await at(NO_FLAGS);
    expect(sentence(cleared)).toBe('Calibration stopped on 06.11: I no longer have the note explaining why.');
    for (const h of [disagrees, cleared]) expect(everything(h)).not.toMatch(NO_PROMISE);
  });

  it('a malformed stored marker at build time is an unreadable read, not a stored-stop check', async () => {
    const redis = createMemoryRedis();
    await redis.command(['SET', keys.closed(FIXTURE_AB.namespace), 'not-json']);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW, env: BUILD_PRODUCTION });
    expect(displayOf(s)).toMatchObject({ mode: 'unavailable', closedOn: null });
    const h = html(s);
    expect(sentence(h)).toBe('The live counts could not be loaded. They will appear at the next update.');
    expect(h).not.toContain('<time');
  });
});

describe('StateExplanation: false copy never appears', () => {
  it.each(ALL)('%s: no group note for the reader, no internal word, and the truth audit is clean', (_name, s) => {
    const h = html(s);
    expect(everything(h)).not.toMatch(/you are in group|This view|headlines|\barm\b|namespace|marker|closure|flag/i);
    expect(audit(h)).toEqual([]);
    expect(h).not.toMatch(/[←-⇿·]/);
  });

  it.each(ALL)('%s: says counting stopped, ended or closed only when the stop is confirmed', (_name, s) => {
    const d = displayOf(s);
    if (!d.closedConfirmed) {
      expect(everything(html(s))).not.toMatch(/counting has stopped|counting stopped|has ended|has closed/i);
    }
  });

  it.each(ALL)('%s: no next step while counting is open', (_name, s) => {
    const d = displayOf(s);
    if (!d.countingClosed) {
      const n = next(html(s));
      expect(n === null || /^The (calibration restarts|A\/B test starts) on \d\d\.\d\d\.$/.test(n), String(n)).toBe(true);
      expect(everything(html(s))).not.toMatch(/later looks change nothing|has reached its decision/i);
    }
  });

  it.each(ALL.filter(([, s]) => displayOf(s).mode === 'held'))('%s: held never reads as running, passed, inconclusive or resuming', (_name, s) => {
    const all = everything(html(s));
    expect(all).not.toMatch(/still running|SRM passed|Inconclusive at the six-month limit|resum|running/i);
    expect(all.replace('the last check that passed', '')).not.toMatch(/passed/i);
  });

  it.each(ALL.filter(([, s]) => displayOf(s).mode === 'aa-failed'))('%s: a failed calibration never reads as calibrating', (_name, s) => {
    expect(everything(html(s))).not.toMatch(/calibrating/i);
  });
});

describe('the dev host fixtures', () => {
  it('render every state with simulated refs only, and the truth audit is clean', async () => {
    const { LIVE_PAGE_FIXTURES } = await import('@/lib/live-page/fixtures');
    expect(LIVE_PAGE_FIXTURES.map((f) => f.id)).toEqual(expect.arrayContaining([...MODES, ...NARRATIVE_FIXTURES, 'held-interval', 'calibration-ready-ab-start', 'aa-failed-restart']));
    for (const f of LIVE_PAGE_FIXTURES) {
      const h = renderToStaticMarkup(<StateExplanation model={f.display()} />);
      const refs = elements(parse(h)).map((el) => attr(el, 'data-derived')).filter((r) => r !== undefined);
      expect(refs.every((r) => r === 'simulated'), `${f.id}: ${refs.join(', ')}`).toBe(true);
      expect(audit(h), f.id).toEqual([]);
    }
  });
});
