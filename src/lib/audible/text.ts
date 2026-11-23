// The ship-rule Figure's words, as plain data (strings, templates and sentences, no functions and no
// elements), so the server can hand them to the island as props. English is the default (EN_FRAMEWORK);
// the other language is in content/de/audible.tsx, typed by FrameworkText, and a client file never
// imports it. A sentence's pieces are exactly the children of the English JSX it replaced, so the
// English markup is the same.
import type { Template } from '@/lib/i18n/template';
import { EN_LAB_KIT, type LabKit } from '@/lib/lab/text-common';
import { slot, type Sentence } from '@/lib/retention/sentence';
import type { FrameworkDecision } from './framework';

type Labelled = { label: string; hint: string };

export type FrameworkText = {
  kit: LabKit;
  /** An interactive Figure's title states the relationship. */
  title: string;
  /** The decision as a word, and the chart's accessible name for each decision (a finding, no digit). */
  decision: Record<FrameworkDecision, string>;
  chartName: Record<FrameworkDecision, string>;
  /** Each slider's label and the hint that says what that end of a range stands for. */
  sliders: { lower: Labelled; upper: Labelled; guardrail: Labelled };
  /** The slider's aria-valuetext: "{value} percentage points". */
  valueText: Template<'value'>;
  /** The slider's visible reading: "{value} points, {hint}". */
  readout: Template<'value' | 'hint'>;
  /** The two metrics' names under the axis, and the shorter names used under 640 px. */
  metrics: readonly [string, string];
  metricsNarrow: readonly [string, string];
  axis: { x: string; y: string };
  /** The zero-line words, wide and the two side words. */
  zero: { noChange: string; higher: string; lower: string };
  /** The guardrail limit's label: "Limit {value}". */
  limit: Template<'value'>;
  /** The word between the two ends of an interval. */
  to: string;
  /** The bounds as one sentence (the result line and the announcement). Slots: interval, guardrail, limit. */
  result: Sentence;
  table: {
    columns: readonly [string, string];
    rows: readonly [string, string, string, string];
    note: string;
  };
  caption: string;
};

export const EN_FRAMEWORK: FrameworkText = {
  kit: EN_LAB_KIT,
  title: 'Where the two intervals fall decides the call',
  decision: {
    ship: 'Ship: the main metric rose, guardrail intact',
    'ship-neutral': 'May ship: neutral on the main metric, guardrail intact',
    harm: 'Stop: the main metric fell',
    hold: "Hold: the guardrail's upper end is past its limit",
  },
  chartName: {
    ship: "The main metric's interval lies above zero and the guardrail's upper end is within its limit",
    'ship-neutral': "The main metric's interval reaches zero and the guardrail's upper end is within its limit",
    harm: "The main metric's interval lies below zero",
    hold: "The guardrail's upper end is past its limit",
  },
  sliders: {
    lower: { label: 'Session completion, lower end', hint: 'lowest plausible change' },
    upper: { label: 'Session completion, upper end', hint: 'highest plausible change' },
    guardrail: { label: 'Help requests, upper end', hint: 'highest plausible change' },
  },
  valueText: '{value} percentage points',
  readout: '{value} points, {hint}',
  metrics: ['Session completion', 'Help requests'],
  metricsNarrow: ['Completion', 'Help requests'],
  axis: { x: 'Metric', y: 'Change (percentage points)' },
  zero: { noChange: 'no change', higher: 'higher', lower: 'lower' },
  limit: 'Limit {value}',
  to: 'to',
  result: [
    'Session completion:',
    ' ',
    slot('interval'),
    ' ',
    'points; help requests: at most',
    ' ',
    slot('guardrail'),
    ' ',
    'points, against a limit of',
    ' ',
    slot('limit'),
    '.',
  ],
  table: {
    columns: ['Bound', 'Points'],
    rows: [
      'Session completion, lower end',
      'Session completion, upper end',
      'Help requests, upper end',
      'Help requests, limit',
    ],
    note: 'Points are percentage points. Every value is made up.',
  },
  caption:
    'Chapter Club, session completion and help requests are made up. The interval ends are typed in, not estimated from observations: no data, test or sample is behind them. A rise in help requests is bad, so the guardrail is drawn by its upper end only, and the dashed line is its limit.',
};
