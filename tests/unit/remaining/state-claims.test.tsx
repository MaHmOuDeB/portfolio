// Every experiment state, on both pages that describe it (the home page in both groups, and the
// Live test page in its default, no-JS and error runtimes), read whole as a reader and a screen
// reader get it, hidden markup included:
//
// - the site-wide Audible claim rules (tests/e2e/site-claims.ts);
// - per state, the words that would be false there: a held test never reads as running, passed,
//   inconclusive or resuming; a test that never started, or whose data could not be read, is never
//   called paused or calibrating; a failed calibration is never "calibrating"; no state names a
//   share of the free command quota;
// - the Live test page never calls its data anonymous;
// - on the Live test page, the page's own whole-page rules (no quota claim, group note, own-view
//   mark or p-value; never paused, running, resumed, passed, inconclusive or calibrating where false)
//   over every fixture, the dev-host ones included, and every runtime.
//
// The fixtures are the build-time test fixtures (src/lib/home), which no page ships.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { htmlClaimFindings } from '../../e2e/site-claims.ts';
import type { Arm } from '@/experiment.values';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { FIXTURE_AB, FIXTURE_CALIBRATION, snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { LIVE_PAGE_FIXTURES } from '@/lib/live-page/fixtures';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';

// The planner island reads the URL through next/navigation, which has no router here; the home
// tests cover it. A marked stand-in, as there.
vi.mock('@/components/home/HeroSimulator', () => ({
  HERO_PLANNER_ID: 'hero-planner',
  HeroSimulator: () => createElement('div', { 'data-hero-simulator': '' }),
}));
const { HomeSections } = await import('@/components/home/HomeSections');
const { LivePage } = await import('@/components/live-page/LivePage');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const STATES: readonly [string, ExperimentSnapshot][] = [
  ...MODES.map((m) => [m, snapshotFixture(m)] as [string, ExperimentSnapshot]),
  ...NARRATIVE_FIXTURES.map((n) => [n, narrativeFixture(n)] as [string, ExperimentSnapshot]),
];
const RUNTIMES = ['default', 'no-js', 'error'] as const;

function homeHtml(s: ExperimentSnapshot, arm: Arm): string {
  const m = toHomeModel(s, arm);
  vi.setSystemTime(new Date(m.readAt));
  return renderToStaticMarkup(<HomeSections model={m} />);
}
const displayOf = (s: ExperimentSnapshot): LivePageDisplay => toLivePageDisplay(toLivePageModel(s, { commit: null }, s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION));
const liveHtml = (d: LivePageDisplay, runtime: (typeof RUNTIMES)[number]) => renderToStaticMarkup(<LivePage display={d} meta={null} host="site.example" runtime={runtime} />);

const LABELS = ['aria-label', 'aria-description', 'aria-valuetext', 'title', 'alt'];
/**
 * Everything a reader or a screen reader gets, hidden markup included, and the labels: of the whole
 * page, or only of the elements `within` picks (and everything inside them).
 */
function everything(html: string, within?: (el: T.Element) => boolean): string {
  const out: string[] = [];
  const walk = (n: T.ParentNode, inside: boolean) => {
    for (const c of n.childNodes) {
      if (c.nodeName === '#text') {
        if (inside) out.push((c as T.TextNode).value);
      } else if ('tagName' in c) {
        const el = c as T.Element;
        if (el.tagName === 'script' || el.tagName === 'style') continue;
        const now = inside || (within?.(el) ?? false);
        if (now) for (const a of el.attrs) if (LABELS.includes(a.name)) out.push(a.value);
        walk(el, now);
      }
    }
  };
  walk(parse(`<body>${html}</body>`, { scriptingEnabled: false }), within === undefined);
  return out.join(' ').replace(/\s+/g, ' ');
}

const has = (name: string) => (el: T.Element) => el.attrs.some((a) => a.name === name);
const idIn = (...ids: string[]) => (el: T.Element) => el.attrs.some((a) => a.name === 'id' && ids.includes(a.value));
/** "Anonymous" only in the page's own denial ("They are not anonymous"). */
const ANONYMOUS_CLAIM = /(?<!\bnot )\banonym/i;

/**
 * The words that would be false in a state, by the page's mode for it. They apply to what the page
 * says about the test's state (the home page's note, the Live test page's "Where the test stands"
 * and "Decision and end"), not to the explanations around it, which name every outcome and phase.
 */
function falseWordsFor(mode: string): RegExp[] {
  const always = [/under half|about half|command quota|free monthly/i];
  switch (mode) {
    case 'held':
      return [...always, /still running|is running|\brunning\b|SRM passed|split check: passed|\bpassed\b|inconclusive|resum/i];
    case 'not-started':
      return [...always, /\bpaused\b|could not be loaded|calibrat/i];
    case 'unavailable':
      return [...always, /\bpaused\b|\bstopped\b|\bclosed\b/i];
    case 'settings-unreadable':
      return [...always, /\bpaused\b/i];
    case 'closure-check':
      return [...always, /\bpaused\b/i];
    case 'aa-failed':
      return [...always, /\bcalibrating\b/i];
    default:
      return always;
  }
}

/**
 * The Live test page's whole-page rules, exactly as the page's own tests state them for its base
 * fixtures (tests/unit/live-page/page.test.tsx), here over every fixture and every runtime: no quota
 * claim, no group note or own-view mark, no p-value; and for the exceptional modes, never paused
 * (but a stopped calibration), running, resumed, passed or inconclusive, and never calibrating for a
 * failed calibration or a test that never started.
 */
function wholePageRules(mode: string): RegExp[] {
  const out = [/under half|quota|command allowance|free monthly/i, /you are in group|your view|this view/i, /p-value|p =|chi-square|χ²/i];
  if (['held', 'unavailable', 'not-started', 'aa-failed', 'closure-check'].includes(mode)) {
    if (mode !== 'aa-failed') out.push(/\bpaused\b/i);
    out.push(/still running|is running|resum|split check: passed|SRM passed|Inconclusive at the six-month limit/i);
    if (mode === 'aa-failed' || mode === 'not-started') out.push(/calibrating/i);
  }
  return out;
}

describe('every experiment state on the home page, both groups', () => {
  const cases = STATES.flatMap(([name, s]) => (['a', 'b'] as const).map((arm) => [`${name}/${arm}`, s, arm] as const));
  it.each(cases)('%s: keeps the claim rules and says nothing false for its state', (_name, s, arm) => {
    const html = homeHtml(s, arm);
    expect(htmlClaimFindings(html, '/')).toEqual([]);
    // A held note may name "the last check that passed": its last clean evidence.
    const said = everything(html, has('data-home-note')).replace(/the last check that passed/g, '');
    const mode = toHomeModel(s, arm).mode;
    expect(everything(html)).not.toMatch(falseWordsFor(mode)[0]!);
    for (const re of falseWordsFor(mode)) expect(said, `${mode}: ${re}`).not.toMatch(re);
  });
});

describe('every experiment state on the Live test page, in every runtime', () => {
  const displays: [string, LivePageDisplay][] = [
    ...STATES.map(([name, s]) => [name, displayOf(s)] as [string, LivePageDisplay]),
    ...LIVE_PAGE_FIXTURES.map((f) => [`dev-host ${f.id}`, f.display()] as [string, LivePageDisplay]),
  ];
  const cases = displays.flatMap(([name, d]) => RUNTIMES.map((r) => [`${name} (${r})`, d, r] as const));
  it.each(cases)('%s: keeps the claim rules, never says anonymous, and says nothing false for its state', (_name, d, runtime) => {
    const html = liveHtml(d, runtime);
    expect(htmlClaimFindings(html, '/experiment')).toEqual([]);
    expect(everything(html)).not.toMatch(ANONYMOUS_CLAIM);
    expect(everything(html)).not.toMatch(falseWordsFor(d.mode)[0]!);
    for (const re of wholePageRules(d.mode)) expect(everything(html), `whole page, ${d.mode}: ${re}`).not.toMatch(re);
    expect(html, 'no own-view mark').not.toContain('data-your-view');
    // An unreadable build: the state sentence holds no date and no count.
    if (d.mode === 'settings-unreadable') expect(everything(html, has('data-live-state'))).not.toMatch(/\d/);
    const said = everything(html, idIn('where-it-stands', 'decision'));
    expect(said.length, 'the state sections are read').toBeGreaterThan(20);
    for (const re of falseWordsFor(d.mode)) {
      // The held page may name "the last check that passed": its last clean evidence.
      expect(said.replace(/the last check that passed/g, ''), `${d.mode}: ${re}`).not.toMatch(re);
    }
  });

  it('reads the states it claims to: every mode of the matrix appears', () => {
    const seen = new Set(displays.map(([, d]) => d.mode));
    for (const m of ['held', 'not-started', 'unavailable', 'settings-unreadable', 'aa-failed', 'paused', 'calibration', 'ab']) expect(seen, m).toContain(m);
  });

  it('the false-word rules are not vacuous', () => {
    expect('The test is still running.').toMatch(falseWordsFor('held')[1]!);
    expect('Split check: passed').toMatch(falseWordsFor('held')[1]!);
    expect('Split check: passed').toMatch(wholePageRules('held').at(-1)!);
    expect('Counting is paused.').toMatch(wholePageRules('closure-check').at(-2)!);
    expect('It is calibrating.').toMatch(wholePageRules('not-started').at(-1)!);
    expect(wholePageRules('ab')).toHaveLength(3);
    expect('Counting is paused until 03.12.').toMatch(falseWordsFor('not-started')[1]!);
    expect('It is calibrating first.').toMatch(falseWordsFor('aa-failed')[1]!);
    expect('a month uses under half of the quota').toMatch(falseWordsFor('ab')[0]!);
    expect('The data are anonymous.').toMatch(ANONYMOUS_CLAIM);
    expect('They are not anonymous: someone could link a change to a visit.').not.toMatch(ANONYMOUS_CLAIM);
  });
});
