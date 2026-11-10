// The Home scroll moment's five steps (homeSteps), the slicing of the live chart (chartSnapshot,
// homeChartTable, chartAriaLabel) and the server visuals the steps draw: CollectingFrame,
// GuardrailChart and the four diagrams. Every mode of the Home model and the states beyond one per
// mode (low and enough data, small counts, stopped tests with little data, closures) are rendered
// and read as a visitor and a screen reader would get them, through the truth audit.
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { HEADLINES, HOME_HERO, headlineText } from '../../../content/home.ts';
import { CollectingFrame } from '@/components/home/CollectingFrame';
import { GuardrailChart, printedInterval } from '@/components/home/GuardrailChart';
import { DecisionZonesDiagram, GroupOutlinesDiagram, HypothesisDiagram } from '@/components/home/StepDiagrams';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { Figure } from '@/components/kit/Figure';
import { FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import type { Arm } from '@/experiment.values';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES } from '@/lib/experiment/events';
import { NO_FLAGS } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import { HELD_REASON, getExperimentSnapshot, type SnapshotDeps } from '@/lib/experiment/live';
import { createMemoryRedis, type MemoryRedis } from '@/lib/experiment/memory-redis';
import type { GroupCounts } from '@/lib/experiment/store';
import { plannedEnd } from '@/lib/experiment/time';
import { confidenceTable, liveFigureState, shownSeries, type LiveSnapshot } from '@/lib/figure/cs-band';
import { resolveFigureBody } from '@/lib/figure/states';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture, type NarrativeFixture } from '@/lib/home/narrative-fixtures';
import { chartAriaLabel, chartSnapshot, homeChartTable, homeSteps, type HomeStep } from '@/lib/home/scroll';

// ---------------------------------------------------------------------------------------------
// Helpers

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const ARMS: readonly Arm[] = ['a', 'b'];
const HEADINGS = ['Hypothesis', 'Split', 'Evidence', 'Guardrails', 'Decision'];

const mode = (m: HomeMode, arm: Arm = 'b') => toHomeModel(snapshotFixture(m), arm);
const named = (n: NarrativeFixture, arm: Arm = 'b') => toHomeModel(narrativeFixture(n), arm);

type El = T.Element;
const doc = (h: string) => parse(`<body>${h}</body>`);
function all(node: T.ParentNode, test: (el: El) => boolean = () => true, out: El[] = []): El[] {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      const el = child as El;
      if (test(el)) out.push(el);
      all(el, test, out);
    }
  }
  return out;
}
const attr = (el: El, name: string) => el.attrs.find((a) => a.name === name)?.value;
const hasAttr = (name: string, value?: string) => (el: El) => value === undefined ? attr(el, name) !== undefined : attr(el, name) === value;
function text(node: T.ParentNode): string {
  return node.childNodes.map((c) => (c.nodeName === '#text' ? (c as T.TextNode).value : 'childNodes' in c ? text(c as T.ParentNode) : '')).join('');
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
/** Everything a reader or a screen reader gets: text nodes and labelling attributes. */
const everything = (h: string) =>
  squash([text(doc(h)), ...all(doc(h)).flatMap((el) => ['aria-label', 'title', 'aria-description'].map((n) => attr(el, n) ?? ''))].join(' '));
const paragraphs = (h: string) => all(doc(h), (el) => el.tagName === 'p').map((p) => squash(text(p)));

const stepHtml = (m: HomeModel, n: HomeStep) => renderToStaticMarkup(<>{homeSteps(m).find((s) => s.step === n)!.body}</>);
const stepsHtml = (m: HomeModel) =>
  renderToStaticMarkup(
    <>
      {homeSteps(m).map((s) => (
        <section key={s.step} data-step={s.step}>
          <h3>{s.heading}</h3>
          {s.body}
        </section>
      ))}
    </>,
  );

/** The live chart as the page draws it (in the Figure, with the caller's table and the chart's label override). */
function chartHtml(m: HomeModel): string {
  const snap = chartSnapshot(m, 3);
  if (snap === null) return '';
  const state = liveFigureState(snap);
  return renderToStaticMarkup(
    <Figure id="home-chart" title="The difference between the groups" caption="Live" provenance="live" table={homeChartTable(snap, m.refs)} state={state}>
      <ConfidenceChart id="home-chart" snapshot={snap} body={resolveFigureBody(state)} refs={m.refs} ariaLabel={chartAriaLabel(m, 3)} />
    </Figure>
  );
}
const pageHtml = (m: HomeModel) => stepsHtml(m) + chartHtml(m);

const audit = (h: string) => auditHtml(h, { route: '/v/a', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

/** Exact counts from 1 to 4 in the count-bearing nodes: live-derived elements, progress bars and table cells. */
function exactSmallCounts(h: string): string[] {
  const hits: string[] = [];
  for (const el of all(doc(h))) {
    const live = (attr(el, 'data-derived') ?? '').split(' ').includes('live');
    if (!live && el.tagName !== 'progress' && el.tagName !== 'td') continue;
    const values = [text(el), attr(el, 'value') ?? '', attr(el, 'max') ?? ''];
    for (const v of values) for (const token of v.match(/\d+(?:[.,:]\d+)*/g) ?? []) if (/^[1-4]$/.test(token)) hits.push(token);
  }
  return hits;
}
/** The counts the chart would serialise to its client island. */
function serialisedCounts(snap: LiveSnapshot | null): number[] {
  if (snap === null) return [];
  return [snap.nA, snap.nB, ...snap.series.flatMap((p) => [p.n, p.nA, p.nB])];
}

const dm = (iso: string) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' }).formatToParts(Date.parse(iso));
  return `${p.find((x) => x.type === 'day')!.value}.${p.find((x) => x.type === 'month')!.value}`;
};

const STOPPED_PROMISES = /next look|first estimate|estimates appear|next daily look|next update|will appear|\bgrow:/i;

// ---------------------------------------------------------------------------------------------

describe('chartSnapshot: what the live chart may draw', () => {
  it('draws nothing before the start', () => {
    expect(chartSnapshot(toHomeModel(snapshotFixture('not-started'), 'a'), 3)).toBeNull();
  });

  it('draws only in the Evidence step', () => {
    const m = mode('ab');
    for (const n of [1, 2, 4, 5] as const) expect(chartSnapshot(m, n)).toBeNull();
    expect(chartSnapshot(m, 3)).not.toBeNull();
  });

  it.each(['not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'srm-suppressed', 'aa-failed'] as const)(
    'draws nothing for %s: no observed marks for a placeholder, an unreadable or a failed test',
    (m) => {
      for (const arm of ARMS) expect(chartSnapshot(mode(m, arm), 3)).toBeNull();
    },
  );

  it('draws nothing when the split check failed after a data fault', () => {
    expect(named('held-srm').live.phase).toBe('srm-suppressed');
    expect(chartSnapshot(named('held-srm'), 3)).toBeNull();
  });

  it('draws nothing while a group count prints as "<5", whatever the exact counts say', () => {
    for (const n of ['calibration-tiny', 'ab-tiny', 'paused-tiny', 'srm-one-sided-small'] as const) expect(chartSnapshot(named(n), 3)).toBeNull();
    // Keyed off the published counts, never the exact ones.
    const m = mode('ab');
    expect(chartSnapshot({ ...m, counts: { ...m.counts, a: '<5' } }, 3)).toBeNull();
    expect(chartSnapshot({ ...m, counts: { ...m.counts, b: '<5' } }, 3)).toBeNull();
  });

  it('hands a running test to the kit as it is, collecting or not', () => {
    for (const n of ['calibration-under-50', 'calibration-asymmetric', 'ab-under-50', 'ab-asymmetric', 'ab-zero-sixty', 'ab-due', 'stale'] as const) {
      const m = named(n);
      expect(chartSnapshot(m, 3)).toEqual(m.live);
    }
    for (const m of [mode('before-data'), mode('calibration'), mode('ab')]) expect(chartSnapshot(m, 3)).toEqual(m.live);
  });

  it.each(['held-under-50', 'held-enough-no-look', 'paused-under-50', 'closed-under-50', 'final-low'] as const)(
    'draws nothing for a stopped test with no look to draw (%s)',
    (n) => {
      expect(chartSnapshot(named(n), 3)).toBeNull();
    },
  );

  it('gives a stopped test with a look the paused contract: the last look, no projection', () => {
    const cases: [HomeModel, string][] = [
      [mode('held'), HELD_REASON['inconsistent-counts']],
      [mode('ship-b'), 'the result is being confirmed'],
      [named('ship-b-confirmed'), 'counting has closed'],
      [mode('inconclusive'), 'counting has closed'],
      [mode('paused'), 'I am updating the page'],
    ];
    for (const [m, reason] of cases) {
      const snap = chartSnapshot(m, 3)!;
      expect(snap.freshness).toMatchObject({ kind: 'paused', reason });
      expect(resolveFigureBody(liveFigureState(snap))).toBe('paused');
      const h = chartHtml(m);
      expect(h).not.toContain('data-cs="projection"');
      expect(h).toContain('data-now-row="interval"');
      expect(squash(text(doc(h)))).toContain('last:');
      expect(everything(h)).not.toMatch(/\bnow:|final:/);
    }
  });

  it('dates the stop by the fault, the decision, the stored day or the planned end', () => {
    expect(chartSnapshot(mode('held'), 3)!.freshness).toMatchObject({ pausedOn: '2026-12-02T00:00:00+01:00' });
    expect(chartSnapshot(mode('ship-b'), 3)!.freshness).toMatchObject({ pausedOn: '2026-12-01T00:00:00+01:00' });
    const end = mode('inconclusive');
    expect(chartSnapshot(end, 3)!.freshness).toMatchObject({ pausedOn: end.live.plannedEnd });
  });

  it('keeps a running chart running: projection and "now"', () => {
    const h = chartHtml(mode('ab'));
    expect(h).toContain('data-cs="projection"');
    expect(squash(text(doc(h)))).toContain('now:');
  });
});

describe('homeChartTable: the chart table by the small-count rule', () => {
  it('prints every count through publishedCount', () => {
    const live = { ...mode('ab').live, nA: 3, nB: 0, series: [] };
    expect(homeChartTable(live, ['live']).rows).toEqual([['<5', 0, 'Not shown yet']]);
    expect(homeChartTable({ ...live, nA: 7, nB: 9 }, ['live']).rows).toEqual([[7, 9, 'Not shown yet']]);
  });

  it('keeps the kit table for the looks, which all have 50 views a group or more', () => {
    const snap = chartSnapshot(mode('ab'), 3)!;
    expect(homeChartTable(snap, ['live'])).toEqual(confidenceTable(snap, ['live']));
    expect(homeChartTable(snap, ['live']).rows.length).toBe(shownSeries(snap).length);
  });
});

describe('chartAriaLabel: the accessible name of a stopped chart', () => {
  it('leaves a running or paused chart to the kit', () => {
    expect(chartAriaLabel(mode('ab'), 3)).toBeUndefined();
    expect(chartAriaLabel(mode('calibration'), 3)).toBeUndefined();
    expect(chartAriaLabel(mode('paused'), 3)).toBeUndefined();
    expect(chartAriaLabel(mode('held'), 2)).toBeUndefined();
  });

  it('says counting stopped for a held test and a confirmed closure, in the A/B', () => {
    expect(chartAriaLabel(mode('held'), 3)).toBe(
      'The difference between the groups, B minus A, as views per group grew until counting stopped: the last interval includes zero',
    );
    expect(chartAriaLabel(named('ship-b-confirmed'), 3)).toBe(
      'The difference between the groups, B minus A, as views per group grew until counting stopped: the last interval lies above zero',
    );
    expect(chartAriaLabel(toHomeModel(snapshotFixture('stop-for-harm', { closed: { kind: 'decision', day: '2026-12-01' } }), 'a'), 3)).toBe(
      'The difference between the groups, B minus A, as views per group grew until counting stopped: the last interval lies below zero',
    );
  });

  it('stays neutral while a derived decision is not confirmed', () => {
    expect(chartAriaLabel(mode('ship-b'), 3)).toBe('The difference between the groups, B minus A, as views per group grew: the last interval lies above zero');
    expect(chartAriaLabel(named('paused-ship-b'), 3)).toBe(
      'The difference between the groups, B minus A, as views per group grew: the last interval lies above zero',
    );
  });

  it('names the two identical groups for a stopped calibration chart', () => {
    const confirmed = toHomeModel(snapshotFixture('calibration', { closed: { kind: 'decision', day: '2026-11-03' } }), 'a');
    expect(confirmed).toMatchObject({ countingClosed: true, closedConfirmed: true });
    expect(chartAriaLabel(confirmed, 3)).toBe(
      'The difference between the two identical groups as views per group grew until counting stopped: the last interval includes zero',
    );
    const unconfirmed = toHomeModel(snapshotFixture('calibration', { status: 'inconclusive' }), 'a');
    expect(unconfirmed).toMatchObject({ countingClosed: true, closedConfirmed: false });
    expect(chartAriaLabel(unconfirmed, 3)).toBe(
      'The difference between the two identical groups as views per group grew: the last interval includes zero',
    );
    for (const m of [confirmed, unconfirmed]) {
      const label = attr(all(doc(chartHtml(m)), hasAttr('role', 'img'))[0]!, 'aria-label')!;
      expect(label).toBe(chartAriaLabel(m, 3));
      expect(label).not.toMatch(/pause/i);
    }
  });

  it('puts the label on the drawn chart, with no pause and no unconfirmed stop', () => {
    const cases: [HomeModel, boolean][] = [
      [mode('held'), true],
      [named('ship-b-confirmed'), true],
      [mode('inconclusive'), true],
      [mode('ship-b'), false],
      [mode('stop-for-harm'), false],
      [named('paused-ship-b'), false],
    ];
    for (const [m, stopped] of cases) {
      const labels = all(doc(chartHtml(m)), hasAttr('role', 'img')).map((el) => attr(el, 'aria-label')!);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).not.toMatch(/pause/i);
        if (stopped) expect(label).toMatch(/until counting stopped/);
        else expect(label).not.toMatch(/counting stopped/i);
      }
    }
  });
});

describe('homeSteps: five steps in every state', () => {
  const every: [string, HomeModel][] = [
    ...MODES.flatMap((m) => ARMS.map((arm): [string, HomeModel] => [`${m} (${arm})`, mode(m, arm)])),
    ...NARRATIVE_FIXTURES.flatMap((n) => ARMS.map((arm): [string, HomeModel] => [`${n} (${arm})`, named(n, arm)])),
  ];

  it.each(every)('%s: the five headings in order, each with a body, and a clean truth audit', (_, m) => {
    const steps = homeSteps(m);
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
    expect(steps.map((s) => s.heading)).toEqual(HEADINGS);
    for (const s of steps) expect(squash(text(doc(stepHtml(m, s.step)))).length).toBeGreaterThan(0);
    expect(audit(pageHtml(m))).toEqual([]);
  });

  it.each(every)('%s: no p-value, no interval in steps 1 and 2, and the full chart frame', (_, m) => {
    const h = pageHtml(m);
    expect(everything(h)).not.toMatch(/p-value|p = 0|chi-square/i);
    for (const n of [1, 2] as const) {
      const step = stepHtml(m, n);
      expect(step).not.toContain('data-chart-frame');
      expect(everything(step)).not.toMatch(/interval/i);
    }
    // Every frame drawn keeps its zero line.
    for (const frame of all(doc(h), hasAttr('data-chart-frame'))) expect(all(frame, hasAttr('data-zero-line')).length).toBe(1);
  });

  it.each(every)('%s: the closing proof line with its context link', (_, m) => {
    const h = stepHtml(m, 5);
    expect(everything(h)).toContain(`${headlineText(HOME_HERO.proof)} ${HOME_HERO.whySoMany}`);
    expect(all(doc(h), (el) => el.tagName === 'a' && attr(el, 'href') === '/work/audible#why-so-many').length).toBe(1);
  });

  it.each(every)('%s: a stopped, paused or closed test promises nothing', (_, m) => {
    const stopped = m.held !== null || m.countingClosed || m.mode === 'paused' || m.mode === 'closure-check' || m.mode === 'settings-unreadable';
    if (!stopped) return;
    expect(everything(pageHtml(m))).not.toMatch(STOPPED_PROMISES);
    expect(pageHtml(m)).not.toContain('data-cs="projection"');
  });

  it.each(every)('%s: "counting has closed" and "counting stopped" only for a held test or a confirmed closure', (_, m) => {
    const h = everything(pageHtml(m));
    if (!m.closedConfirmed) expect(h).not.toMatch(/counting has closed|counting has ended/i);
    if (!m.closedConfirmed && m.held === null) expect(h).not.toMatch(/counting stopped/i);
  });
});

describe('Hypothesis', () => {
  const CAL = 'The case-study cards above are what I will test, after a calibration run in which everyone sees the same page.';
  const AB = 'The case-study cards above are the test.';

  it('opens the calibration with the test to come, and shows identical headlines', () => {
    for (const m of [mode('before-data'), mode('calibration'), named('calibration-under-50'), mode('paused')]) {
      const h = stepHtml(m, 1);
      expect(paragraphs(h)).toContain(CAL);
      expect(all(doc(h), hasAttr('data-diagram', 'identical-headlines')).length).toBe(1);
    }
  });

  it('leaves the opener out before the start', () => {
    const h = stepHtml(mode('not-started'), 1);
    expect(everything(h)).not.toContain('The case-study cards above');
    expect(all(doc(h), hasAttr('data-diagram', 'identical-headlines')).length).toBe(1);
  });

  it('names the A/B as the test, in the past once it has stopped, with topic versus finding', () => {
    for (const m of [mode('ab'), named('ab-under-50')]) {
      expect(paragraphs(stepHtml(m, 1))).toContain(AB);
      expect(all(doc(stepHtml(m, 1)), hasAttr('data-diagram', 'topic-finding')).length).toBe(1);
    }
    for (const m of [mode('ship-b'), mode('held'), named('closed-under-50')]) {
      expect(paragraphs(stepHtml(m, 1))).toContain('The case-study cards above were the test.');
    }
  });

  it('states the hypothesis in every state', () => {
    for (const m of [mode('not-started'), mode('ab'), mode('inconclusive')]) {
      expect(paragraphs(stepHtml(m, 1))).toContain(
        'The hypothesis: case-study cards that state the finding get more clicks than cards that name the topic.',
      );
    }
  });
});

describe('Split', () => {
  const ASSIGNED = 'Each counted visit to the home page is assigned to group A or B at random, on the server.';
  const THRESHOLD = 'At least one group has fewer than 50 views so far. The Live test page shows the counts that are safe to publish.';

  it('says at least one group is under 50, with two equal outlines and no count', () => {
    for (const n of ['calibration-under-50', 'calibration-asymmetric', 'ab-under-50', 'ab-asymmetric', 'ab-tiny', 'ab-zero-sixty', 'paused-under-50'] as const) {
      const m = named(n);
      const h = stepHtml(m, 2);
      expect(paragraphs(h)).toContain(THRESHOLD);
      expect(paragraphs(h)[0]).toBe(ASSIGNED);
      expect(all(doc(h), hasAttr('data-group-outline')).length).toBe(2);
      // No count at all: neither group's number appears.
      expect(all(doc(h), (el) => (attr(el, 'data-derived') ?? '').includes('live'))).toEqual([]);
      expect(everything(h)).not.toMatch(/passed/);
    }
    expect(paragraphs(stepHtml(mode('before-data'), 2))).toContain(THRESHOLD);
    const link = all(doc(stepHtml(named('ab-under-50'), 2)), (el) => el.tagName === 'a')[0]!;
    expect([attr(link, 'href'), squash(text(link))]).toEqual(['/experiment', 'Live test page']);
  });

  it('names the group in the A/B and the identical groups in the calibration', () => {
    expect(paragraphs(stepHtml(named('ab-under-50', 'a'), 2))).toContain('This view: group A.');
    expect(paragraphs(stepHtml(mode('ab', 'b'), 2))).toContain('This view: group B.');
    expect(paragraphs(stepHtml(mode('calibration', 'b'), 2))).toContain('This view: one of the two identical groups.');
  });

  it('prints safe counts and the actual split status from 50 views a group', () => {
    const h = stepHtml(mode('ab'), 2);
    expect(paragraphs(h)).toContain('Analysed views so far: 60 in group A and 70 in group B.');
    expect(paragraphs(h)).toContain('Split check: passed.');
    // Counted, not evaluated yet: no passed claim.
    const due = stepHtml(named('ab-due'), 2);
    expect(paragraphs(due)).toContain('Analysed views so far: 60 in group A and 60 in group B.');
    expect(paragraphs(due)).toContain('Split check: not evaluated in this snapshot.');
    expect(everything(due)).not.toMatch(/passed/);
  });

  it('speaks in the past once counting stopped', () => {
    expect(paragraphs(stepHtml(mode('ship-b'), 2))).toContain('Analysed views counted: 300 in group A and 300 in group B.');
    expect(paragraphs(stepHtml(named('closed-under-50'), 2))).toContain(
      'At least one group had fewer than 50 views when counting stopped. The Live test page shows the counts that are safe to publish.',
    );
    expect(paragraphs(stepHtml(named('closed-under-50'), 2))[0]).toBe(
      'Each counted visit to the home page was assigned to group A or B at random, on the server.',
    );
  });

  it('names a failed split by its base and day, with counts only where both groups have 50', () => {
    const h = everything(stepHtml(mode('srm-suppressed'), 2));
    expect(h).toContain('The split check failed, so no result is shown.');
    expect(h).toContain('on entry views');
    expect(everything(stepHtml(named('srm-one-sided-small'), 2))).not.toMatch(/Entry views at that check/);
  });

  it('shows the placeholders their explanation, never a zero count', () => {
    expect(paragraphs(stepHtml(mode('not-started'), 2))).toContain('The experiment has not started yet, so nothing is counted.');
    expect(paragraphs(stepHtml(mode('unavailable'), 2))).toContain('The live counts could not be loaded. They will appear at the next update.');
    expect(paragraphs(stepHtml(mode('closure-check'), 2))).toContain(
      'Counting has stopped for this run. I am checking the stored result before showing it.',
    );
    for (const m of ['not-started', 'unavailable', 'closure-check', 'settings-unreadable'] as const) {
      const h = stepHtml(mode(m), 2);
      expect(all(doc(h), hasAttr('data-derived'))).toEqual([]);
      expect(everything(h)).not.toMatch(/views so far|views counted|fewer than/i);
    }
  });
});

describe('Evidence', () => {
  it('collects with the kit in a running test, with the daily look explained', () => {
    for (const m of [mode('before-data'), named('calibration-under-50')]) {
      expect(paragraphs(stepHtml(m, 3))).toContain('Views from today join the analysis at the next daily look.');
      expect(stepHtml(m, 3)).not.toContain('data-collecting-frame');
    }
    const ab = named('ab-under-50');
    expect(everything(stepHtml(ab, 3))).toMatch(/Views from today join the analysis at the next daily look\. The test ends on \d\d\.\d\d at the latest, when its six-month cap is reached\./);
  });

  it('explains a drawn interval: neutral in the calibration, valid at every look in the A/B', () => {
    expect(paragraphs(stepHtml(mode('calibration'), 3))).toContain(
      'Both groups see the same page, so the interval is expected to include zero. A new look is added once a day, after the day’s views are complete.',
    );
    expect(paragraphs(stepHtml(mode('ab'), 3))).toContain(
      'The interval stays valid however often anyone looks. The lighter band after the last look shows how far it is projected to narrow by the planned number of views.',
    );
  });

  it('draws its own collecting frame for a "<5" count, never the kit row', () => {
    for (const n of ['ab-tiny', 'calibration-tiny'] as const) {
      const m = named(n);
      const h = pageHtml(m);
      expect(h).toContain('data-collecting-frame');
      expect(h).not.toContain('data-now-row');
      expect(h).not.toContain('<progress');
      expect(h).not.toContain('Views in A');
      const end = `${m.live.plannedEndKind === 'earliest' ? 'Earliest end' : 'Planned end'}: ${dm(m.live.plannedEnd)}`;
      expect(paragraphs(stepHtml(m, 3))).toContain(`Progress: <5 of 50 in the smaller group. ${end}.`);
      expect(paragraphs(stepHtml(m, 3))).toContain('Estimates appear at 50 views per group, as the pre-registration says.');
    }
  });

  it.each([
    ['held-enough-no-look', 'Counting stopped after both groups reached 50 views, and no estimate is shown.'],
    ['held-under-50', 'Counting stopped at 20 of 50 in the smaller group, so no estimate is shown.'],
    ['paused-under-50', 'Counting is paused at 20 of 50 in the smaller group, so no estimate is shown.'],
    ['closed-under-50', 'Counting stopped at 20 of 50 in the smaller group, so no estimate is shown.'],
    ['final-low', 'Counting stopped at 20 of 50 in the smaller group, so no estimate is shown.'],
    ['paused-tiny', 'Counting is paused at <5 of 50 in the smaller group, so no estimate is shown.'],
  ] as const)('stops %s in its own frame with stopped wording', (n, sentence) => {
    const m = named(n);
    expect(chartSnapshot(m, 3)).toBeNull();
    const h = pageHtml(m);
    expect(paragraphs(stepHtml(m, 3))).toContain(sentence);
    expect(h).toContain('data-collecting-frame');
    expect(everything(h)).not.toMatch(STOPPED_PROMISES);
    expect(everything(h)).not.toMatch(/\b(?:[5-9]\d|\d{3,}) of 50\b/);
    expect(everything(h)).not.toMatch(/Planned end|Earliest end/);
  });

  it('says only that the result is being confirmed for an unconfirmed closure without a look', () => {
    const m = { ...named('closed-under-50'), closedConfirmed: false };
    const h = stepHtml(m, 3);
    expect(paragraphs(h)).toContain('The result is being confirmed, so no estimate is shown.');
    expect(everything(h)).not.toMatch(/counting stopped|counting has closed|of 50/i);
  });

  it('labels a drawn stop by what stopped it', () => {
    expect(paragraphs(stepHtml(mode('held'), 3))).toContain(
      'The test stopped, so the chart shows the last interval that passed its checks, with nothing projected.',
    );
    expect(paragraphs(stepHtml(named('ship-b-confirmed'), 3))).toContain(
      'Counting has closed, so the chart shows the last interval, with nothing projected.',
    );
    expect(paragraphs(stepHtml(mode('paused'), 3))).toContain(
      'Counting is paused, so the chart shows the last interval before the pause, with nothing projected.',
    );
    expect(paragraphs(stepHtml(mode('ship-b'), 3))).toContain(
      'The result is being confirmed, so the chart shows the last interval, with nothing projected.',
    );
  });

  it('hides the chart of a failed split or calibration and gives the reason', () => {
    expect(everything(stepHtml(mode('srm-suppressed'), 3))).toContain('The split check failed, so no result is shown.');
    expect(everything(stepHtml(mode('aa-failed'), 3))).toMatch(/Calibration stopped on \d\d\.\d\d: a script error dropped some views\./);
    // The Evidence step and the live chart; the Guardrails step keeps its rule-only axis.
    for (const m of [mode('srm-suppressed'), mode('aa-failed'), named('held-srm')]) {
      expect(stepHtml(m, 3) + chartHtml(m)).not.toContain('data-chart-frame');
      expect(pageHtml(m)).not.toContain('data-collecting-frame');
      expect(stepHtml(m, 4)).toContain('data-guardrail="empty"');
    }
  });

  it('shows the placeholders and unreadable settings their explanation, never a mark', () => {
    for (const m of ['not-started', 'unavailable', 'closure-check', 'settings-unreadable'] as const) {
      expect(stepHtml(mode(m), 3) + chartHtml(mode(m))).not.toContain('data-chart-frame');
      expect(pageHtml(mode(m))).not.toContain('data-collecting-frame');
      expect(stepHtml(mode(m), 4)).toContain('data-guardrail="empty"');
    }
    expect(paragraphs(stepHtml(mode('settings-unreadable'), 3))).toContain('Counting is stopped because the experiment settings could not be read.');
  });
});

describe('Guardrails', () => {
  const RULE =
    'Quick exits are entry views that leave within 5 seconds without interacting. The guardrail compares them, B minus A, with a 95% confidence sequence, against a limit of +10 points.';
  const FROM = 'Checked from 50 views per group. The look waits for 50 analysed views in each group; the quick-exit rate is computed on entry views.';

  it('states the rule, the analysed and entry bases and the speed check in every state', () => {
    for (const m of [mode('not-started'), mode('before-data'), mode('calibration'), mode('ab'), mode('ship-b'), mode('closure-check')]) {
      const p = paragraphs(stepHtml(m, 4));
      expect(p).toContain(RULE);
      expect(p).toContain(FROM);
      expect(p).toContain('Page speed parity is checked in lab runs.');
    }
  });

  it('never shows a guardrail interval in the calibration', () => {
    for (const m of [mode('calibration'), named('calibration-ready'), named('calibration-under-50')]) {
      const h = stepHtml(m, 4);
      expect(paragraphs(h)).toContain('The calibration publishes no guardrail interval.');
      expect(h).toContain('data-guardrail="empty"');
    }
  });

  it('shows the real interval in the A/B with enough data', () => {
    const m = mode('ab');
    const g = m.live.guardrail!;
    const h = stepHtml(m, 4);
    expect(h).toContain('data-guardrail="interval"');
    expect(everything(h)).toMatch(/Quick exits, B minus A: [−+]?[\d.]+ to [−+]?[\d.]+ points\. /);
    expect(everything(h)).toContain(
      g.upper < g.limit ? 'The upper end is below the limit.' : g.lower >= g.limit ? 'The whole interval lies above the limit.' : 'The interval still reaches the limit.',
    );
  });

  it('hides the interval when the split check failed', () => {
    for (const m of [mode('srm-suppressed'), named('paused-srm'), named('held-srm')]) expect(stepHtml(m, 4)).toContain('data-guardrail="empty"');
  });
});

describe('Decision', () => {
  const RULE =
    'Ship B only when the primary interval is above zero and the quick-exit guardrail passes and the split check passes; stop for harm when the interval is below zero; otherwise report inconclusive at the limit.';

  it('waits for the calibration checks, and calls them passed only when they have', () => {
    const s = snapshotFixture('calibration');
    const notReady = toHomeModel({ ...s, calibration: { ...s.calibration!, ready: false, evaluatedOn: null } }, 'a');
    for (const m of [mode('before-data'), notReady, named('calibration-under-50')]) {
      expect(paragraphs(stepHtml(m, 5))).toContain('No decision before the calibration checks pass.');
      expect(everything(stepHtml(m, 5))).not.toMatch(/checks have passed/);
    }
    for (const m of [mode('calibration'), named('calibration-ready')]) {
      expect(m.calibration?.ready).toBe(true);
      expect(paragraphs(stepHtml(m, 5))).toContain('The calibration checks have passed.');
    }
    // The split words come from the model's checks: passed only where both were evaluated and passed.
    for (const m of [mode('calibration'), notReady]) expect(paragraphs(stepHtml(m, 5))).toContain('Split check: passed.');
    const unchecked = { ...notReady, splitStatus: { entry: 'not-evaluated', analysed: 'not-evaluated' } } as const;
    expect(paragraphs(stepHtml(unchecked, 5))).toContain('Split check: not evaluated in this snapshot.');
    expect(paragraphs(stepHtml(named('calibration-under-50'), 5)).join(' ')).not.toMatch(/Split check/);
  });

  it('states the rule in the A/B, and no result before enough data', () => {
    expect(paragraphs(stepHtml(named('ab-under-50'), 5))).toContain('No result is shown before enough data arrives.');
    expect(paragraphs(stepHtml(mode('ab'), 5))).toContain(RULE);
  });

  it('draws the three zones in every state', () => {
    for (const m of [mode('not-started'), mode('calibration'), mode('ab'), mode('inconclusive'), mode('held')]) {
      expect(all(doc(stepHtml(m, 5)), hasAttr('data-decision-zone')).length).toBe(3);
    }
  });

  it('gives a final result with its interval, and says whether counting has closed', () => {
    const ship = paragraphs(stepHtml(named('ship-b-confirmed'), 5));
    expect(ship.find((p) => p.startsWith('Ship B.'))).toMatch(/^Ship B\. The final interval runs from \+[\d.]+ to \+[\d.]+ points\. Counting has closed\.$/);
    const derived = paragraphs(stepHtml(mode('ship-b'), 5));
    expect(derived.find((p) => p.startsWith('Ship B.'))).toMatch(/^Ship B\. The final interval runs from .+ points\. The result is being confirmed\.$/);
    expect(paragraphs(stepHtml(mode('stop-for-harm'), 5)).find((p) => p.startsWith('Stop for harm.'))).toMatch(/The result is being confirmed\.$/);
    expect(paragraphs(stepHtml(mode('inconclusive'), 5))).toContainEqual(
      expect.stringMatching(/^Inconclusive at the limit; this is not evidence of no effect\. The final interval runs from .+ points\. Counting has closed\.$/),
    );
    expect(paragraphs(stepHtml(named('final-low'), 5))).toContain(
      'Inconclusive at the limit; this is not evidence of no effect. Too few views to report an interval. Counting has closed.',
    );
  });

  it('keeps a final result with a later split warning', () => {
    expect(everything(stepHtml(named('ship-b-late-srm'), 5))).toContain('A later split check failed; the recorded decision is unchanged.');
    expect(everything(stepHtml(named('ship-b-confirmed'), 5))).not.toContain('A later split check failed');
  });

  it('records no decision at a closed planned end before the last look', () => {
    const p = paragraphs(stepHtml(named('closed-under-50'), 5));
    // The first paragraph is the step's own sentence; the zone names of the rule diagram follow it.
    expect(p[0]).toBe('Counting has closed; no decision is recorded in this snapshot.');
    expect(p.join(' ')).not.toMatch(/Inconclusive at the limit|Ship B\.|Stop for harm\./);
  });

  it('never reads a held test as inconclusive, running or resumed', () => {
    for (const m of [mode('held'), named('held-under-50'), named('held-srm')]) {
      const h = everything(stepHtml(m, 5));
      expect(h).toMatch(/^.*The test stopped because the counts failed a consistency check\./);
      expect(h).not.toMatch(/Inconclusive at the limit|Ship B\.|Stop for harm\.|resum|running/);
    }
  });

  it('shows no verdict while paused', () => {
    for (const m of [mode('paused'), named('paused-ship-b'), named('paused-under-50')]) {
      expect(paragraphs(stepHtml(m, 5))).toContain('The experiment on this site is paused, so no verdict is shown here.');
      expect(everything(stepHtml(m, 5))).not.toMatch(/Ship B\.|Stop for harm\.|Inconclusive at the limit/);
    }
  });

  it('gives the failure, unreadable and placeholder explanations', () => {
    expect(everything(stepHtml(mode('srm-suppressed'), 5))).toContain('The split check failed, so no result is shown.');
    expect(everything(stepHtml(mode('aa-failed'), 5))).toMatch(/Calibration stopped on \d\d\.\d\d/);
    expect(everything(stepHtml(mode('closure-check'), 5))).toContain('I am checking the stored result before showing it.');
    expect(everything(stepHtml(mode('closure-check'), 5))).not.toMatch(/Ship B\.|Stop for harm\.|Inconclusive at the limit|next update/);
  });
});

describe('the small-count rule across the steps and the chart', () => {
  const SMALL = ['ab-tiny', 'calibration-tiny', 'ab-zero-sixty', 'srm-zero-sixty', 'ab-asymmetric', 'calibration-asymmetric', 'srm-one-sided-small', 'paused-tiny'] as const;

  it.each(SMALL)('%s: no exact 1 to 4 in any count-bearing node, the chart props or its table', (n) => {
    for (const arm of ARMS) {
      const m = named(n, arm);
      const h = pageHtml(m);
      expect(exactSmallCounts(h)).toEqual([]);
      const snap = chartSnapshot(m, 3);
      for (const c of serialisedCounts(snap)) expect(c === 0 || c >= 5).toBe(true);
      if (snap) for (const row of homeChartTable(snap, m.refs).rows) for (const cell of row.slice(0, 2)) expect(typeof cell === 'number' ? cell === 0 || cell >= 5 : cell !== '').toBe(true);
    }
  });

  it('prints "<5" for the small groups', () => {
    const h = pageHtml(named('ab-tiny'));
    expect(everything(h)).toContain('<5 of 50');
    expect(everything(stepHtml(named('ab-tiny'), 3))).toMatch(/A\s*<5\s*B\s*<5/);
  });

  it('never presents a placeholder zero as an observation', () => {
    for (const m of ['not-started', 'unavailable', 'closure-check'] as const) {
      const h = pageHtml(mode(m));
      expect(all(doc(h), (el) => (attr(el, 'data-derived') ?? '').split(' ').includes('build') && squash(text(el)) === '0' && el.tagName !== 'text')).toEqual([]);
      expect(everything(h)).not.toMatch(/\b0 of 50|views so far|views counted/i);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The visuals on their own

const frameHtml = (props: Partial<Parameters<typeof CollectingFrame>[0]> = {}) =>
  renderToStaticMarkup(
    <CollectingFrame
      counts={{ a: 20, b: 30, smaller: 20 }}
      plannedEnd="2027-06-01T00:00:00+02:00"
      plannedEndKind="fixed"
      stopped={false}
      refs={['live']}
      {...props}
    />,
  );

describe('CollectingFrame', () => {
  it('draws the difference axis with only the zero tick, views per group to 50, and the hollow glyph on zero', () => {
    const h = frameHtml();
    const frames = all(doc(h), hasAttr('data-chart-frame'));
    expect(frames.length).toBe(2);
    for (const f of frames) {
      expect(attr(f, 'aria-label')).toBe('No estimate yet');
      const y = all(f, hasAttr('data-tick', 'y')).map((t) => squash(text(t)));
      expect(y).toEqual(['0']);
      const x = all(f, hasAttr('data-tick', 'x'));
      expect(x.map((t) => squash(text(t)))).toEqual(['0', '50']);
      for (const t of [...x, ...all(f, hasAttr('data-tick', 'y'))]) expect(attr(t, 'data-derived')).toBe('build');
      expect(squash(text(f))).toContain('Views per group');
      expect(squash(text(f))).toContain('no difference');
      expect(squash(text(f))).toContain('B higher');
      expect(squash(text(f))).toContain('B lower');
      expect(all(f, hasAttr('data-mark'))).toEqual([]);
      // The glyph sits inside the frame, on the zero line, centred.
      const glyph = all(f, hasAttr('data-collecting-glyph'))[0]!;
      expect(attr(glyph, 'x')).toBe('50%');
      const zeroY = Number(attr(all(f, hasAttr('data-zero-line'))[0]!, 'y1'));
      expect(Number(attr(glyph, 'y')) + Number(attr(glyph, 'height')) / 2).toBeCloseTo(zeroY, 0);
      expect(all(glyph, (el) => el.tagName === 'circle' && attr(el, 'fill') === 'none').length).toBe(1);
    }
    expect(h).not.toContain('<progress');
    expect(h).not.toContain('data-now-row');
  });

  it('uses the given heights', () => {
    const h = frameHtml();
    const [narrow, wide] = all(doc(h), hasAttr('data-mark-layer')).map((el) => Number(attr(el, 'height')));
    expect([narrow, wide]).toEqual([80, 120]);
  });

  it('prints the running progress and the rule', () => {
    expect(paragraphs(frameHtml())).toContain('Progress: 20 of 50 in the smaller group. Planned end: 01.06.');
    expect(paragraphs(frameHtml())).toContain('Estimates appear at 50 views per group, as the pre-registration says.');
    expect(paragraphs(frameHtml({ plannedEndKind: 'earliest' }))).toContain('Progress: 20 of 50 in the smaller group. Earliest end: 01.06.');
    expect(paragraphs(frameHtml({ counts: { a: '<5', b: 0, smaller: 0 } }))).toContain('Progress: 0 of 50 in the smaller group. Planned end: 01.06.');
  });

  it('prints the stopped forms, never above its target', () => {
    const p = (stopped: 'paused' | 'stopped' | 'confirming', smaller: number | '<5') =>
      paragraphs(frameHtml({ stopped, counts: { a: smaller, b: 60, smaller } }));
    expect(p('paused', '<5')).toContain('Counting is paused at <5 of 50 in the smaller group, so no estimate is shown.');
    expect(p('stopped', 49)).toContain('Counting stopped at 49 of 50 in the smaller group, so no estimate is shown.');
    expect(p('paused', 60)).toContain('Counting is paused after both groups reached 50 views, and no estimate is shown.');
    expect(p('stopped', 60)).toContain('Counting stopped after both groups reached 50 views, and no estimate is shown.');
    expect(p('confirming', 20)).toContain('The result is being confirmed, so no estimate is shown.');
    for (const stopped of ['paused', 'stopped', 'confirming'] as const) {
      for (const smaller of [0, 20, 60, '<5'] as const) {
        const h = everything(frameHtml({ stopped, counts: { a: smaller, b: 60, smaller } }));
        expect(h).not.toMatch(STOPPED_PROMISES);
        expect(h).not.toMatch(/Planned end|Earliest end|Progress/);
        expect(h).not.toMatch(/\b(?:[5-9]\d|\d{3,}) of 50\b/);
        if (stopped === 'confirming') expect(h).not.toMatch(/counting stopped|of 50/i);
      }
    }
  });

  it('has a masked Group / Views table, a live badge and a clean audit', () => {
    const h = frameHtml({ counts: { a: '<5', b: 60, smaller: '<5' } });
    const table = all(doc(h), (el) => el.tagName === 'table')[0]!;
    expect(all(table, (el) => el.tagName === 'th').map((th) => squash(text(th)))).toEqual(['Group', 'Views']);
    expect(all(table, (el) => el.tagName === 'td').map((td) => squash(text(td)))).toEqual(['A', '<5', 'B', '60']);
    expect(everything(h)).toContain('Live from this site');
    expect(exactSmallCounts(h)).toEqual([]);
    expect(audit(h)).toEqual([]);
  });
});

describe('GuardrailChart', () => {
  const g = (guardrail: LiveSnapshot['guardrail']) => {
    const m = mode('ab');
    const live = { ...m.live };
    if (guardrail === undefined) delete live.guardrail;
    else live.guardrail = guardrail;
    return renderToStaticMarkup(<GuardrailChart model={{ ...m, live }} />);
  };

  it('draws the empty axis with the labelled limit, from the build', () => {
    const h = g(undefined);
    expect(h).toContain('data-guardrail="empty"');
    expect(h).not.toContain('data-guardrail-interval');
    const notes = all(doc(h), hasAttr('data-annotation'));
    expect(notes.length).toBe(2);
    for (const n of notes) {
      expect(squash(text(n))).toBe('Limit +10');
      expect(attr(n, 'data-derived')).toBe('build');
    }
    expect(all(doc(h), hasAttr('data-limit-line')).length).toBe(2);
    // Only the pre-registered rule is drawn: a diagram Figure, with no data badge and no table.
    expect(h).not.toContain('<table');
    expect(everything(h)).not.toMatch(/Live from this site|Simulated|Public data/);
    expect(audit(h)).toEqual([]);
  });

  it('draws one interval and the limit, with zero and both ends inside the plot, and a table that agrees', () => {
    for (const gr of [
      { lower: -3.2, upper: 4.1, limit: 10 },
      { lower: 2, upper: 14, limit: 10 },
      { lower: -100, upper: 100, limit: 10 },
      { lower: -40, upper: -20, limit: 10 },
    ]) {
      const h = g(gr);
      expect(h).toContain('data-guardrail="interval"');
      for (const frame of all(doc(h), hasAttr('data-chart-frame'))) {
        const height = Number(attr(all(frame, hasAttr('data-mark-layer'))[0]!, 'height'));
        const interval = all(frame, hasAttr('data-guardrail-interval'));
        expect(interval.length).toBe(1);
        const bar = all(interval[0]!, (el) => el.tagName === 'line' && attr(el, 'data-bar') !== undefined)[0]!;
        for (const v of [attr(bar, 'y1'), attr(bar, 'y2')].map(Number)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(height);
        }
        expect(all(frame, hasAttr('data-zero-line')).length).toBe(1);
        const limit = Number(attr(all(frame, hasAttr('data-limit-line'))[0]!, 'y1'));
        expect(limit).toBeGreaterThanOrEqual(0);
        expect(limit).toBeLessThanOrEqual(height);
      }
      const cells = all(all(doc(h), (el) => el.tagName === 'tbody')[0]!, (el) => el.tagName === 'td').map((td) => squash(text(td)));
      expect(cells[0]).toBe('Lower end');
      expect(cells[2]).toBe('Upper end');
      expect(cells[4]).toBe('Limit');
      expect(cells[5]).toBe('+10');
      const sentence = everything(h);
      expect(sentence).toContain(`${cells[1]} to ${cells[3]} points`);
      for (const td of all(doc(h), (el) => el.tagName === 'td')) expect(attr(td, 'data-derived')).toMatch(/live/);
      expect(audit(h)).toEqual([]);
    }
  });

  it('labels the limit with build refs and the interval with live refs', () => {
    const h = g({ lower: -3.2, upper: 4.1, limit: 10 });
    for (const n of all(doc(h), hasAttr('data-annotation'))) expect(attr(n, 'data-derived')).toBe('build');
    const ticks = all(doc(h), hasAttr('data-tick', 'y'));
    for (const t of ticks) expect(attr(t, 'data-derived')).toBe('live build');
  });

  it('carries a digit-free accessible name', () => {
    for (const h of [g(undefined), g({ lower: -3.2, upper: 4.1, limit: 10 }), g({ lower: 2, upper: 14, limit: 10 })]) {
      for (const f of all(doc(h), hasAttr('data-chart-frame'))) expect(attr(f, 'aria-label')).toMatch(/^[^\d]+$/);
    }
  });
});

describe('StepDiagrams', () => {
  const html = (node: ReactNode) => renderToStaticMarkup(<>{node}</>);

  it('shows identical headlines in the calibration', () => {
    const h = html(<HypothesisDiagram kind="identical-headlines" />);
    const outlines = all(doc(h), hasAttr('data-group-outline'));
    expect(outlines.map((o) => attr(o, 'data-group-outline'))).toEqual(['a', 'b']);
    const lines = outlines.map((o) => squash(text(all(o, hasAttr('data-outline-headlines'))[0]!)));
    expect(lines[0]).toBe(lines[1]);
    expect(attr(outlines[0]!, 'class')).toBe(attr(outlines[1]!, 'class'));
    expect(audit(h)).toEqual([]);
  });

  it('shows topic versus finding in the A/B, without either group’s real headline', () => {
    const h = html(<HypothesisDiagram kind="topic-finding" />);
    const outlines = all(doc(h), hasAttr('data-group-outline'));
    const lines = outlines.map((o) => squash(text(all(o, hasAttr('data-outline-headlines'))[0]!)));
    expect(lines).toEqual(['Headlines that name the topic', 'Headlines that state a finding']);
    expect(everything(h)).not.toContain('How I run experiments');
    expect(everything(h)).not.toContain('personalisation');
  });

  it('draws two equal, unnumbered group outlines', () => {
    const h = html(<GroupOutlinesDiagram />);
    const outlines = all(doc(h), hasAttr('data-group-outline'));
    expect(outlines.length).toBe(2);
    expect(attr(outlines[0]!, 'class')).toBe(attr(outlines[1]!, 'class'));
    expect(everything(h)).not.toMatch(/\d/);
    expect(audit(h)).toEqual([]);
  });

  it('draws the three decision zones', () => {
    const h = html(<DecisionZonesDiagram />);
    const zones = all(doc(h), hasAttr('data-decision-zone'));
    expect(zones.map((z) => attr(z, 'data-decision-zone'))).toEqual(['stop-for-harm', 'inconclusive', 'ship-b']);
    expect(zones.map((z) => squash(text(all(z, (el) => el.tagName === 'p')[0]!)))).toEqual(['Stop for harm', 'Inconclusive', 'Ship B']);
    expect(everything(h)).not.toMatch(/\d/);
    expect(audit(h)).toEqual([]);
  });

  it('are diagram Figures: no badge, controls or table', () => {
    for (const h of [html(<HypothesisDiagram kind="topic-finding" />), html(<GroupOutlinesDiagram />), html(<DecisionZonesDiagram />)]) {
      expect(h).toContain('<figure');
      expect(h).not.toContain('<table');
      expect(everything(h)).not.toMatch(/Live from this site|Simulated|Public data/);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Closure, read through the real reader where the reader decides it

const PRODUCTION: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://store.example', kvToken: 'w', kvReadOnlyToken: 'r' };
const BUILD_PRODUCTION: ServerEnv = { ...PRODUCTION, buildPhase: true };
const AB_NOW = '2026-12-03T12:00:00+01:00';
const CAL_NOW = '2026-11-20T10:00:00Z';
const END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;
const endPlus = (ms: number) => new Date(Date.parse(END) + ms).toISOString();
type G = Partial<GroupCounts>;
const SHIP_B = [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } }];
const BALANCED = [{ day: '2026-12-01', a: { entry: 80, inview: 60, engaged: 60, card: 9 }, b: { entry: 80, inview: 60, engaged: 60, card: 10 } }];

async function seed(redis: MemoryRedis, ns: string, rows: { day: string; a: G; b: G }[]): Promise<void> {
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      const counts = { ...(Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts), ...r[arm] };
      for (const [metric, n] of Object.entries(counts) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(ns), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
}
async function mark(redis: MemoryRedis, ns: string, kind: 'decision' | 'aa-failed' | 'held', day: string) {
  await redis.command(['SET', keys.closed(ns), JSON.stringify({ kind, day })]);
}
function read(redis: MemoryRedis, o: { config: ExperimentConfig; now: string }) {
  const deps: Partial<SnapshotDeps> = {
    env: PRODUCTION, mode: 'store', read: redis, write: null, flags: async () => NO_FLAGS, now: () => new Date(o.now),
    log: () => {}, config: o.config, schedule: () => {}, closingSeen: new Set<string>(),
  };
  return getExperimentSnapshot(deps);
}
const placeholderAt = async (now: string) =>
  toHomeModel(await getExperimentSnapshot({ env: BUILD_PRODUCTION, mode: 'none', read: null, write: null, now: () => new Date(now), config: FIXTURE_AB, log: () => {} }), 'b');

/** The whole scroll moment agrees on a closure: past tense, nothing projected or promised. */
function expectClosed(m: HomeModel) {
  const h = pageHtml(m);
  expect(everything(h)).not.toMatch(STOPPED_PROMISES);
  expect(everything(h)).not.toMatch(/views so far|has fewer than|are the test|is assigned/i);
  expect(h).not.toContain('data-cs="projection"');
  expect(paragraphs(stepHtml(m, 1))).toContain('The case-study cards above were the test.');
  if (!m.closedConfirmed) expect(everything(h)).not.toMatch(/counting has closed|counting stopped/i);
}

describe('closure across the five steps', () => {
  it('runs right up to the planned end, and closes at it', () => {
    const before = toHomeModel(buildFixture({ config: FIXTURE_AB, now: endPlus(-1), rows: BALANCED }), 'b');
    expect(before).toMatchObject({ countingClosed: false });
    expect(pageHtml(before)).toContain('data-cs="projection"');
    expect(paragraphs(stepHtml(before, 1))).toContain('The case-study cards above are the test.');
    for (const now of [END, endPlus(30_000)]) {
      // The analysis margin: closed at the planned end, no outcome recorded yet.
      const at = toHomeModel(buildFixture({ config: FIXTURE_AB, now, rows: BALANCED }), 'b');
      expect(at).toMatchObject({ mode: 'ab', countingClosed: true, closedConfirmed: true, outcome: null });
      expectClosed(at);
      expect(paragraphs(stepHtml(at, 3))).toContain('Counting has closed, so the chart shows the last interval, with nothing projected.');
      expect(paragraphs(stepHtml(at, 5))[0]).toBe('Counting has closed; no decision is recorded in this snapshot.');
    }
  });

  it('the unreadable placeholder: next update before the planned end, closed at and after it, never a mark', async () => {
    const before = await placeholderAt(endPlus(-1));
    expect(before).toMatchObject({ mode: 'unavailable', countingClosed: false });
    for (const n of [2, 3, 5] as const) expect(paragraphs(stepHtml(before, n))).toContain('The live counts could not be loaded. They will appear at the next update.');
    for (const now of [END, endPlus(1), endPlus(86_400_000)]) {
      const m = await placeholderAt(now);
      expect(m).toMatchObject({ mode: 'unavailable', closedConfirmed: true, outcome: null });
      expectClosed(m);
      for (const n of [2, 3, 5] as const) expect(paragraphs(stepHtml(m, n))).toContain('The live counts could not be loaded, and counting has closed.');
      expect(everything(pageHtml(m))).not.toMatch(/Ship B\.|Stop for harm\.|Inconclusive at the limit|next update/);
    }
    for (const m of [before, await placeholderAt(END)]) {
      expect(chartSnapshot(m, 3)).toBeNull();
      expect(all(doc(stepsHtml(m)), (el) => (attr(el, 'data-derived') ?? '').split(' ').includes('live'))).toEqual([]);
    }
  });

  it('a matching decision marker: the final result, counting closed', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-01');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', closedConfirmed: true });
    expectClosed(m);
    expect(paragraphs(stepHtml(m, 5))[0]).toMatch(/^Ship B\. .* Counting has closed\.$/);
    expect(chartAriaLabel(m, 3)).toMatch(/until counting stopped/);
  });

  it('a mismatching decision marker: the closure check in every step, no verdict', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-03');
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m.mode).toBe('closure-check');
    expectClosed(m);
    expect(chartSnapshot(m, 3)).toBeNull();
    expect(everything(pageHtml(m))).not.toMatch(/Ship B\.|Stop for harm\.|Inconclusive at the limit|paused|views counted/i);
  });

  it('an A/A flag-only marker: the failed calibration, no chart', async () => {
    const redis = createMemoryRedis();
    await mark(redis, FIXTURE_CALIBRATION.namespace, 'aa-failed', '2026-11-06');
    const m = toHomeModel(await read(redis, { config: FIXTURE_CALIBRATION, now: CAL_NOW }), 'a');
    expect(m.mode).toBe('aa-failed');
    expect(chartSnapshot(m, 3)).toBeNull();
    expect(paragraphs(stepHtml(m, 3))).toContain('Calibration stopped on 06.11: I no longer have the note explaining why.');
    expect(everything(pageHtml(m))).not.toMatch(STOPPED_PROMISES);
  });

  it('a derived decision with no marker yet: being confirmed in every step, never closed or stopped', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const m = toHomeModel(await read(redis, { config: FIXTURE_AB, now: AB_NOW }), 'b');
    expect(m).toMatchObject({ mode: 'ship-b', closed: null, closedConfirmed: false, countingClosed: true });
    expectClosed(m);
    expect(paragraphs(stepHtml(m, 5))[0]).toMatch(/^Ship B\. .* The result is being confirmed\.$/);
    expect(chartAriaLabel(m, 3)).not.toMatch(/counting stopped|pause/i);
  });

  it('a test held before its cap and still held at it: stopped, never inconclusive, running or resumed', () => {
    const rows = [
      { day: '2026-12-01', a: { entry: 60, inview: 50, engaged: 50, card: 5 }, b: { entry: 60, inview: 50, engaged: 50, card: 6 } },
      { day: '2026-12-02', a: { entry: 10, inview: 5, engaged: 5, card: 100 }, b: { entry: 10, inview: 5, engaged: 5, card: 1 } },
    ];
    for (const now of [AB_NOW, endPlus(86_400_000)]) {
      const m = toHomeModel(buildFixture({ config: FIXTURE_AB, now, rows }), 'b');
      expect(m.mode).toBe('held');
      const h = everything(pageHtml(m));
      expect(h).not.toMatch(/Inconclusive at the limit|Ship B\.|Stop for harm\.|resum|running|views so far/i);
      expect(h).not.toMatch(STOPPED_PROMISES);
      expect(pageHtml(m)).not.toContain('data-cs="projection"');
      expect(paragraphs(stepHtml(m, 5))[0]).toMatch(/^The test stopped because the counts failed a consistency check\./);
      expect(chartAriaLabel(m, 3)).toMatch(/until counting stopped/);
    }
  });

  it.each(['closure-check', 'ship-b', 'inconclusive'] as const)('%s: the past tense in the Split step too', (m) => {
    expect(paragraphs(stepHtml(mode(m), 2))[0]).toBe('Each counted visit to the home page was assigned to group A or B at random, on the server.');
  });
});

// ---------------------------------------------------------------------------------------------
// Review fixes

describe('review fixes', () => {
  it('a held test reports only the last clean look: never counts from the fault on', () => {
    const m = named('held-srm');
    const page = everything(pageHtml(m));
    expect(paragraphs(stepHtml(m, 2))).toContain('Analysed views at the last check that passed: 50 in group A and 50 in group B.');
    expect(page).not.toMatch(/\b55\b|\b370\b|\b90\b/);
    // The split flag is named by base and day only.
    expect(page).toContain('The split check failed on 02.12, on entry views.');
    expect(page).not.toMatch(/Entry views at that check/);
    // No clean look to report: the past-tense sentence, no count.
    const low = named('held-under-50');
    expect(paragraphs(stepHtml(low, 2))).toContain(
      'At least one group had fewer than 50 views at the last check that passed. The Live test page shows the counts that are safe to publish.',
    );
  });

  it('two renders of the steps in one document repeat no id', () => {
    for (const m of [mode('ab'), named('ab-tiny'), named('held-under-50'), mode('calibration'), mode('not-started')]) {
      const twice = renderToStaticMarkup(
        <>
          {homeSteps(m).map((s) => <div key={s.step}>{s.body}</div>)}
          {homeSteps(m, { idPrefix: 'home-stacked' }).map((s) => <div key={s.step}>{s.body}</div>)}
        </>,
      );
      const ids = all(doc(twice), hasAttr('id')).map((el) => attr(el, 'id')!);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    }
    // The default ids are unchanged.
    expect(stepHtml(mode('ab'), 1)).toContain('id="home-hypothesis"');
    expect(stepHtml(named('ab-tiny'), 3)).toContain('id="home-collecting"');
    expect(stepHtml(mode('ab'), 4)).toContain('id="home-guardrail"');
  });

  it('a later failed split check is stated in the Split step too', () => {
    const p = paragraphs(stepHtml(named('ship-b-late-srm'), 2));
    expect(p).toContain('Split check: passed at the decision; a later check failed.');
    expect(p).not.toContain('Split check: passed.');
  });

  it('a stopped collecting frame never says "yet", not even in its accessible name', () => {
    for (const stopped of ['paused', 'stopped', 'confirming'] as const) {
      const h = frameHtml({ stopped });
      for (const f of all(doc(h), hasAttr('data-chart-frame'))) expect(attr(f, 'aria-label')).toBe('No estimate is shown');
      expect(everything(h)).not.toMatch(/\byet\b/);
    }
    for (const n of ['held-under-50', 'paused-under-50', 'closed-under-50', 'final-low', 'paused-tiny'] as const) {
      expect(everything(stepHtml(named(n), 3))).not.toMatch(/\byet\b/);
    }
  });
});

describe('review fixes: minors', () => {
  const guard = (gr: { lower: number; upper: number; limit: number }) => {
    const m = mode('ab');
    return renderToStaticMarkup(<GuardrailChart model={{ ...m, live: { ...m.live, guardrail: gr } }} />);
  };

  it('a held test says where its split failed once, in the Split step', () => {
    const page = everything(pageHtml(named('held-srm')));
    expect(page.match(/failed on 02\.12, on entry views/g)).toHaveLength(1);
    expect(page.match(/The test stopped because the counts failed a consistency check\./g)).toHaveLength(2);
  });

  it('the guardrail says below, still reaches, or above the limit', () => {
    const cases = [
      [{ lower: -3, upper: 4, limit: 10 }, 'The quick-exit interval lies below the limit', 'The upper end is below the limit.', 'the interval lies below the limit'],
      [{ lower: -3, upper: 14, limit: 10 }, 'The quick-exit interval still reaches the limit', 'The interval still reaches the limit.', 'the interval still reaches the limit'],
      [{ lower: 12, upper: 20, limit: 10 }, 'The quick-exit interval lies above the limit', 'The whole interval lies above the limit.', 'the interval lies above the limit'],
    ] as const;
    for (const [gr, title, sentence, label] of cases) {
      const h = guard(gr);
      expect(squash(text(all(doc(h), (el) => el.tagName === 'h4')[0]!))).toBe(title);
      expect(everything(h)).toContain(sentence);
      for (const f of all(doc(h), hasAttr('data-chart-frame'))) expect(attr(f, 'aria-label')).toBe(`The quick-exit interval, B minus A, against its limit: ${label}`);
    }
  });

  it('the printed ends never contradict the verdict after rounding', () => {
    const num = (t: string) => Number(t.replace('−', '-').replace('+', ''));
    for (const gr of [
      { lower: -5, upper: 9.96, limit: 10 },
      { lower: -25, upper: 9.6, limit: 10 },
      { lower: -5, upper: 9.99999999, limit: 10 },
      { lower: 9.96, upper: 30, limit: 10 },
      { lower: -5, upper: 10, limit: 10 },
    ]) {
      const h = guard(gr);
      const shown = everything(h).match(/Quick exits, B minus A: (\S+) to (\S+) points\./)!;
      const [lo, hi] = [num(shown[1]!), num(shown[2]!)];
      const place = (l: number, u: number) => (u < gr.limit ? 'below' : l >= gr.limit ? 'above' : 'reaches');
      expect(place(lo, hi)).toBe(place(gr.lower, gr.upper));
      const cells = all(all(doc(h), (el) => el.tagName === 'tbody')[0]!, (el) => el.tagName === 'td').map((td) => squash(text(td)));
      expect(`${cells[1]} to ${cells[3]}`).toBe(`${shown[1]} to ${shown[2]}`);
    }
    expect(printedInterval({ lower: -5, upper: 9.96, limit: 10 }).digits).toBe(2);
  });

  it('a badge says live only for live data', () => {
    expect(everything(frameHtml({ refs: ['build'] }))).toContain('Simulated');
    expect(everything(frameHtml({ refs: ['build'] }))).not.toContain('Live from this site');
    expect(everything(frameHtml({ refs: ['live'] }))).toContain('Live from this site');
    const m = mode('ab');
    expect(everything(renderToStaticMarkup(<GuardrailChart model={{ ...m, refs: ['build'] }} />))).not.toContain('Live from this site');
  });

  it('a running frame at 50 a group promises nothing and never prints above its target', () => {
    const h = everything(frameHtml({ counts: { a: 60, b: 70, smaller: 60 } }));
    expect(h).toContain('Both groups have reached 50 views; no estimate is shown here.');
    expect(h).not.toMatch(STOPPED_PROMISES);
    expect(h).not.toMatch(/\b60 of 50\b|Progress/);
  });

  it('the projection sentence only where a band is drawn', () => {
    const m = mode('ab');
    const capped = { ...m, live: { ...m.live, capPerArm: 40 } };
    expect(paragraphs(stepHtml(capped, 3))).toContain('The interval stays valid however often anyone looks.');
    expect(everything(stepHtml(capped, 3))).not.toMatch(/lighter band/);
    expect(chartHtml(capped)).not.toContain('data-cs="projection"');
    expect(everything(stepHtml(m, 3))).toMatch(/lighter band/);
    expect(chartHtml(m)).toContain('data-cs="projection"');
  });

  it('quotes no group’s headline anywhere in the scroll moment, in either group', () => {
    const quotes = HEADLINES.flatMap((h) => [headlineText(h.a), headlineText(h.b)]);
    const models = [...MODES.map((x) => mode(x, 'a')), ...MODES.map((x) => mode(x, 'b')), ...NARRATIVE_FIXTURES.map((n) => named(n, 'a'))];
    for (const m of models) {
      const page = everything(pageHtml(m));
      for (const q of quotes) expect(page).not.toContain(q);
    }
  });
});
