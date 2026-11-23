// The kit's own words, as data. Every string a kit component prints is here, so a second language is
// one more `KitText` value (content/de/kit.ts) and no kit component changes. English is the default
// of every component: `KIT_TEXT_EN` holds the words the kit always printed, moved here verbatim.
//
// - A sentence with a value is a `Template` (a client island fills it) or, where the value is an
//   element (a number carrying its refs), a function that returns the sentence as children. The
//   functions build their children with `seq`, so a text and an element sit side by side exactly as
//   they did in the markup (React writes a separator between two neighbouring texts, and the markup
//   of a page does not change).
// - The slices a client component prints (`reset`, `step`, `slider`, `count`, `error`) hold strings
//   and templates only, so they cross from a server component as plain data. Each has its own
//   export, so a client file that needs one default takes only that one into its bundle.
// - `locale` is the one language tag; the slices a client prints carry it too where they format.
import { createElement, Fragment, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locale';
import type { Template } from '@/lib/i18n/template';

/** Children of a sentence, in order, as separate nodes: strings and elements side by side. */
export function seq(...parts: ReactNode[]): ReactNode {
  return createElement(Fragment, null, ...parts);
}

/** The text before and after the one placeholder `{key}` of a template that holds it once. */
export function aroundPlaceholder<P extends string>(t: Template<P>, key: P): [before: string, after: string] {
  const at = t.indexOf(`{${key}}`);
  if (at === -1) throw new Error(`the template has no {${key}}`);
  return [t.slice(0, at), t.slice(at + key.length + 2)];
}

export type ZeroText = {
  /** The zero line of a difference axis. */
  noDifference: string;
  /** B is above the zero line. */
  higher: string;
  /** B is below the zero line. */
  lower: string;
};

export type FigureText = {
  controlsNeedJs: string;
  /** The accessible name of the control row. */
  controls: string;
};

export type TableText = {
  show: string;
  /** The caption of a table whose Figure has no plain-text title. */
  caption: string;
};

export type ErrorText = {
  /** The sentence of a Figure that could not load: its status, then the rest. */
  chart: readonly [status: string, rest: string];
  live: readonly [status: string, rest: string];
  diagram: readonly [status: string, rest: string];
  tableCaption: string;
};

export type BadgeText = { simulated: string; publicData: string; live: string };

export type LiveText = {
  /** The word before a time ("Updated 14:05"). */
  updated: string;
  progress: (p: { n: ReactNode; target: ReactNode }) => ReactNode;
  earliestEnd: string;
  plannedEnd: string;
  guardrail: (p: { seconds: ReactNode; interval: ReactNode; limit: ReactNode }) => ReactNode;
  nextStep: (p: { step: string }) => ReactNode;
  unavailable: string;
  inconclusiveCap: string;
  inconclusiveFew: (p: { min: ReactNode }) => ReactNode;
  shipLead: string;
  shipRest: (p: { interval: ReactNode }) => ReactNode;
  stopLead: string;
  stopRest: (p: { interval: ReactNode }) => ReactNode;
  inconclusiveLead: string;
  inconclusiveRest: (p: { interval: ReactNode; ruledOut: ReactNode }) => ReactNode;
  paused: string;
  pausedLine: (p: { when: ReactNode; reason: string }) => ReactNode;
  abStarted: (p: { when: ReactNode }) => ReactNode;
  calibrating: string;
  stillRunning: string;
  includesZeroYet: string;
  srmPassed: string;
  srmFailed: string;
  srmFailedRest: string;
  viewsSoFar: (p: { a: ReactNode; b: ReactNode }) => ReactNode;
  calibrationStopped: (p: { when: ReactNode; reason: string }) => ReactNode;
  calibrationRestarts: (p: { when: ReactNode }) => ReactNode;
  viewsWhenStopped: (p: { a: ReactNode; b: ReactNode }) => ReactNode;
  calibrationStoppedPlain: string;
};

export type PhaseText = {
  paused: string;
  calibration: string;
  /** The reader's group, "A" or "B". */
  ab: Template<'group'>;
  /** The A/B sentence for a page that names no group. */
  abNoGroup: string;
  views: (p: { count: ReactNode }) => ReactNode;
  linkPaused: string;
  linkLive: string;
};

export type StepText = { locale: Locale; previous: string; next: string };

export type SliderText = { exactValue: Template<'label'> };

export type FieldText = { error: string };

export type CountText = {
  locale: Locale;
  upTo: Template<'limit'>;
  none: string;
  left: { one: Template<'n'>; other: Template<'n'> };
  over: { one: Template<'n'>; other: Template<'n'> };
};

export type ConfidenceText = {
  xLabel: string;
  yLabel: string;
  yourView: string;
  aria: {
    pausedIdentical: Template<'where'>;
    pausedGroups: Template<'where'>;
    pausedWhere: { includesZero: string; aboveZero: string; belowZero: string };
    calibration: Template<'where'>;
    calibrationWhere: { includes: string; excludes: string };
    running: Template<'where'>;
    which: { current: string; final: string };
    runningWhere: {
      includesFinal: Template<'which'>;
      includesRunning: Template<'which'>;
      above: Template<'which'>;
      below: Template<'which'>;
    };
  };
};

export type NowRowText = {
  /** The word before the current interval: "now", "final" or "last". */
  labels: { now: string; final: string; last: string };
  estimatesAppear: (p: { target: ReactNode }) => ReactNode;
  due: (p: { target: ReactNode }) => ReactNode;
};

export type KitText = {
  locale: Locale;
  zero: ZeroText;
  figure: FigureText;
  table: TableText;
  error: ErrorText;
  badge: BadgeText;
  live: LiveText;
  phase: PhaseText;
  reset: string;
  step: StepText;
  slider: SliderText;
  select: string;
  field: FieldText;
  count: CountText;
  confidence: ConfidenceText;
  nowRow: NowRowText;
};

export const EN_ZERO: ZeroText = { noDifference: 'no difference', higher: 'B higher', lower: 'B lower' };

export const EN_FIGURE: FigureText = { controlsNeedJs: 'Controls need JavaScript.', controls: 'Controls' };

export const EN_TABLE: TableText = { show: 'Show the numbers as a table', caption: 'The numbers in this chart' };

export const EN_ERROR: ErrorText = {
  chart: ['This chart could not load.', ' The numbers are in the table below.'],
  live: ['This chart could not load.', ' The numbers for both groups are in the table below.'],
  diagram: ['This diagram could not load.', ' The text around it describes the same steps.'],
  tableCaption: 'The numbers in this chart',
};

export const EN_BADGE: BadgeText = { simulated: 'Simulated', publicData: 'Public data', live: 'Live from this site' };

export const EN_LIVE: LiveText = {
  updated: 'Updated',
  progress: (p) => seq('Progress: ', p.n, ' of', ' ', p.target, ' in the smaller group'),
  earliestEnd: 'Earliest end',
  plannedEnd: 'Planned end',
  guardrail: (p) => seq('Leaving within ', p.seconds, ' seconds, B − A: ', p.interval, ' ', 'points; limit ', p.limit, '.'),
  nextStep: (p) => seq(" What I'll do now: ", p.step, '.'),
  unavailable: 'The interval for this look is not available.',
  inconclusiveCap: 'Inconclusive at the six-month limit.',
  inconclusiveFew: (p) =>
    seq('Inconclusive at the six-month limit: fewer than ', p.min, ' views per group arrived, so no interval is shown.'),
  shipLead: 'Ship B.',
  shipRest: (p) =>
    seq(
      ' The lower end of the interval is above zero (',
      p.interval,
      ' points), the quick-exit guardrail is within its limit, and the split check passed.',
    ),
  stopLead: 'Stopped: B did worse.',
  stopRest: (p) => seq(' The upper end of the interval is below zero (', p.interval, ' points).'),
  inconclusiveLead: 'Inconclusive at the six-month limit:',
  inconclusiveRest: (p) =>
    seq(' the difference runs from ', p.interval, ' points, so an effect larger than', ' ', p.ruledOut, ' points is ruled out.'),
  paused: 'Paused',
  pausedLine: (p) => seq(' on ', p.when, ': ', p.reason, '.'),
  abStarted: (p) => seq('A/B started ', p.when, '.'),
  calibrating: 'Calibrating: both groups see the same page.',
  stillRunning: 'The test is still running.',
  includesZeroYet: 'The interval still includes zero, so no difference is ruled out yet.',
  srmPassed: 'SRM passed',
  srmFailed: 'SRM failed',
  srmFailedRest: '. The split check failed, so no verdict is shown.',
  viewsSoFar: (p) => seq('Views so far: ', p.a, ' in A,', ' ', p.b, ' in B, where the design expects an even split.'),
  calibrationStopped: (p) => seq('Calibration stopped on ', p.when, ': ', p.reason, '.'),
  calibrationRestarts: (p) => seq(' ', 'Calibration restarts on ', p.when, '.'),
  viewsWhenStopped: (p) => seq('Views when it stopped: ', p.a, ' in A,', ' ', p.b, ' in B.'),
  calibrationStoppedPlain: 'Calibration stopped.',
};

export const EN_PHASE: PhaseText = {
  paused: 'The experiment on this site is paused.',
  calibration:
    'This site runs a live experiment on its own visitors. It is calibrating first, so everyone sees the same page.',
  ab: 'This site runs an A/B test on its visitors, and you are in group {group}.',
  abNoGroup: 'This site runs an A/B test on its visitors.',
  views: (p) => seq(' There have been ', p.count, ' views so far.'),
  linkPaused: 'See why the experiment is paused',
  linkLive: 'See the live results',
};

export const EN_RESET = 'Reset';

export const EN_STEP: StepText = { locale: 'en', previous: 'Previous', next: 'Next' };

export const EN_SLIDER: SliderText = { exactValue: '{label}, exact value' };

export const EN_SELECT = 'Choose one';

export const EN_FIELD: FieldText = { error: 'Error: ' };

export const EN_COUNT: CountText = {
  locale: 'en',
  upTo: 'Up to {limit} characters',
  none: 'No characters left',
  left: { one: '{n} character left', other: '{n} characters left' },
  over: { one: '{n} character too many', other: '{n} characters too many' },
};

export const EN_CONFIDENCE: ConfidenceText = {
  xLabel: 'Views per group',
  yLabel: 'B − A (percentage points)',
  yourView: 'your view',
  aria: {
    pausedIdentical:
      'The difference between the two identical groups as views per group grew until the pause: the last interval {where}',
    pausedGroups:
      'The difference between the groups, B minus A, as views per group grew until the pause: the last interval {where}',
    pausedWhere: { includesZero: 'includes zero', aboveZero: 'lies above zero', belowZero: 'lies below zero' },
    calibration: 'The difference between the two identical groups as views per group grow: {where}',
    calibrationWhere: {
      includes: 'the current interval includes zero',
      excludes: 'the current interval does not include zero',
    },
    running: 'The difference between the groups, B minus A, as views per group grow: {where}',
    which: { current: 'the current interval', final: 'the final interval' },
    runningWhere: {
      includesFinal: '{which} includes zero',
      includesRunning: '{which} still includes zero, so no difference is ruled out yet',
      above: '{which} lies above zero: B higher',
      below: '{which} lies below zero: B lower',
    },
  },
};

export const EN_NOW_ROW: NowRowText = {
  labels: { now: 'now', final: 'final', last: 'last' },
  estimatesAppear: (p) => seq('Estimates appear at ', p.target, ' views per group, as the pre-registration says.'),
  due: (p) => seq(p.target, ' views per group are in; the first estimate appears at the next look.'),
};

export const KIT_TEXT_EN: KitText = {
  locale: 'en',
  zero: EN_ZERO,
  figure: EN_FIGURE,
  table: EN_TABLE,
  error: EN_ERROR,
  badge: EN_BADGE,
  live: EN_LIVE,
  phase: EN_PHASE,
  reset: EN_RESET,
  step: EN_STEP,
  slider: EN_SLIDER,
  select: EN_SELECT,
  field: EN_FIELD,
  count: EN_COUNT,
  confidence: EN_CONFIDENCE,
  nowRow: EN_NOW_ROW,
};
