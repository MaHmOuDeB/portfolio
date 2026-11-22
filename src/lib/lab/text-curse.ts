// The exaggeration Figure's words (the winner's curse), as plain data: see text-planner.ts for the idea.
// English is the default (EN_CURSE); the other language is in content/de/lab.tsx, typed by CurseText.
import type { Template } from '@/lib/i18n/template';
import { slot, type Sentence } from '@/lib/retention/sentence';
import { EN_EXHIBIT, EN_LAB_KIT, type ExhibitLabels, type LabKit } from './text-common';

export type CurseText = {
  kit: LabKit;
  exhibit: ExhibitLabels;
  /** An interactive Figure's title states the relationship. */
  title: string;
  /** The control and readout words, plain only. */
  labels: { power: string; exaggeration: string; wrongSign: string };
  /** A whole percent: "{value}%". */
  percent: Template<'value'>;
  /** The power slider's reading: "{value} of the time". */
  powerTime: Template<'value'>;
  numberLabel: Template<'label'>;
  /** "over {value}" for a power that would round to a certainty, "below {value}" for a tiny share. */
  over: Template<'value'>;
  below: Template<'value'>;
  unbounded: string;
  /** The result line. Slots: x (the exaggeration), wrong (the wrong-sign share). */
  result: Sentence;
  /** The readout's suffix after the exaggeration, and its words for a result with no finite value. */
  times: string;
  noValue: string;
  notShown: string;
  axis: { y: string };
  chartName: { result: string; unbounded: string };
  table: { columns: readonly [string, string, string, string, string]; yes: string; noValue: string; note: string };
  caption: string;
  leadIn: string;
  takeaway: string;
  summary: string;
  term: string;
  /** Slot: term. */
  terms: Sentence;
  /** Slots: alpha, ratioPart, min, max. */
  method: Sentence;
  /** The part of the method that names the setting's ratio. Slot: ratio. */
  ratioPart: Sentence;
  /** The link under the exhibit to a test sized as the planner sizes one. Slot: check (the planner's number). */
  presetLink: Sentence;
};

export const EN_CURSE: CurseText = {
  kit: EN_LAB_KIT,
  exhibit: EN_EXHIBIT,
  title: 'The smaller the test, the more its wins overstate the effect',
  labels: {
    power: 'How often the test clears the bar',
    exaggeration: 'Results that clear the bar overstate the effect by',
    wrongSign: 'Results that clear the bar but point the wrong way',
  },
  percent: '{value}%',
  powerTime: '{value} of the time',
  numberLabel: '{label}, percent',
  over: 'over {value}',
  below: 'below {value}',
  unbounded: 'At this setting the calculation has no finite answer, so no number is shown.',
  result: [
    'At this setting, results that clear the bar average ',
    slot('x'),
    ' times the real effect. Of those, ',
    slot('wrong'),
    ' of them point the wrong way.',
  ],
  times: ' times',
  noValue: 'no finite value',
  notShown: 'not shown',
  axis: { y: 'Times the real effect' },
  chartName: {
    result:
      'How many times the real effect the results that clear the bar report, against how often the test clears the bar: large for a test that rarely clears it and close to the real effect for one that nearly always does, with your setting marked',
    unbounded:
      'How many times the real effect the results that clear the bar report, against how often the test clears the bar: large for a test that rarely clears it and close to the real effect for one that nearly always does, with no setting marked, because this setting has no finite answer',
  },
  table: {
    columns: [
      'How often the test clears the bar (power)',
      'Ratio of effect to noise',
      'Results that clear the bar but point the wrong way',
      'Overstatement among results that clear the bar',
      'Your setting',
    ],
    yes: 'Yes',
    noValue: 'no finite value',
    note: 'An exact calculation at a two-sided significance level. Each power fixes the ratio of the true effect to its standard error, in the same arbitrary units.',
  },
  caption: 'An exact calculation on made-up values, with no random draws.',
  leadIn: 'Drag the slider right, toward a bigger test. Watch the wins shrink toward the real effect.',
  takeaway:
    'A forecast built on a win like this would overpromise. So I treat a surprising win from a small test as a lead. I test it again at full size before anyone plans on that number.',
  summary: 'How the overstatement is calculated',
  term: "Winner's curse (type M error)",
  terms: [
    slot('term'),
    ': a result that clears the bar overstates the effect on average when the test is too small to see it reliably; Gelman and Carlin call the overstatement the exaggeration ratio, or type M (magnitude) error.',
  ],
  method: [
    'A study estimates a true effect, and its estimate is normally distributed around that effect with a known standard error, both in the same arbitrary units; the test is two-sided at a significance level of',
    ' ',
    slot('alpha'),
    '. Power is the chance that the estimate clears that bar, and it fixes the ratio of the true effect to its standard error',
    slot('ratioPart'),
    '. The other two numbers describe only the estimates that clear the bar: how many have the wrong sign, and how large they are on average against the true effect. Reporting only those is the selection that creates the exaggeration. The line shows the exaggeration at every power from',
    ' ',
    slot('min'),
    ' to',
    ' ',
    slot('max'),
    ", and the dot is your setting. These are Gelman and Carlin's retrodesign formulas; they assume independent observations and a known standard error, and they guarantee no business outcome.",
  ],
  ratioPart: [': your setting is a ratio of ', slot('ratio')],
  presetLink: ['See a test sized as in check', ' ', slot('check')],
};
