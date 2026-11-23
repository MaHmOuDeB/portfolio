// The sample-size planner's words, as plain data: strings, templates and sentences, no functions and no
// elements, so the server can hand them to the client islands as props. English is the default of every
// component here (EN_PLANNER); the other language is in content/de/lab.tsx, typed by PlannerText, and a
// client file never imports it. The planner has two contexts: a hypothetical test (the Lab) and the
// Retention win-back sizing.
//
// A sentence that holds numbers is a `Sentence` (see src/lib/retention/sentence.ts): its pieces are
// exactly the children of the English JSX it replaced, so rendering the English text writes the same
// markup as before. A one-line announcement is a `Template`, filled with plain text.
import type { Template } from '@/lib/i18n/template';
import { slot, type Sentence } from '@/lib/retention/sentence';
import { EN_EXHIBIT, EN_LAB_KIT, plural, type ExhibitLabels, type LabKit, type Plural } from './text-common';

/** What the groups are made of: visitors in a hypothetical test, customers on Retention. */
export type PlannerNoun = 'visitors' | 'customers';
/** Where the planner stands: a hypothetical test (the Lab) or the Retention win-back sizing. */
export type PlannerContext = 'hypothetical' | 'retention';

export type PlannerNounText = {
  /** One of them ("visitor"). */
  one: string;
  /** Several ("visitors"). */
  other: string;
  /** At the start of a table row ("Visitors"). */
  capital: string;
  /** After a preposition that takes the dative ("at 100 visitors a day"); English has no case, so it equals one and other. */
  dative: Plural;
};

export type PlannerContextText = {
  /** The sizing Figure's title (on the Lab, the one Figure's): the relationship, never a number. */
  sizingTitle: string;
  /** The duration Figure's title (the pair only). */
  durationTitle: string;
  /** The words beside each Figure's Simulated badge: true whatever the controls are set to. */
  label: string;
  /** The duration control's label. */
  trafficLabel: string;
  /** The sizing controls' words. */
  baseline: string;
  baselineHint: string;
  rise: string;
  /** What the inputs are, the first sentences of the sizing caption. Slots (Retention): baseline, uplift, target. */
  note: Sentence;
  /** The first sentence of the duration caption. Slot: count. */
  durationFirst: Sentence;
  /** The sentence after the traffic, said on Retention only (the Lab has none). */
  durationExtra: string | null;
};

export type PlannerText = {
  kit: LabKit;
  exhibit: ExhibitLabels;
  nouns: Record<PlannerNoun, PlannerNounText>;
  context: Record<PlannerContext, PlannerContextText>;
  /** "{noun} per group", with the plural noun. */
  perGroup: Template<'noun'>;
  point: Plural;
  /** "{n} point", "{n} points". */
  points: { one: Template<'n'>; other: Template<'n'> };
  week: Plural;
  weeksRounded: Plural;
  /** A whole percent: "{value}%". */
  percent: Template<'value'>;
  /** A percent of the baseline with one decimal: "{value}%". */
  relativePercent: Template<'value'>;
  /** "{value} of the baseline" (a rise as a percent of the baseline), and its slider readout "{value} of baseline". */
  ofBaseline: Template<'value'>;
  ofBaselineShort: Template<'value'>;
  /** The result line of the sizing Figure. Slots: rise, from, to. */
  sizingResult: Sentence;
  /** The method's assumptions and the formula. Slots: alpha, power, noun, formula. */
  method: Sentence;
  /** The duration Figure's result line. Slots: count, all, traffic, noun. */
  durationResult: Sentence;
  /** The sentence of the duration caption that follows the first. */
  durationRest: string;
  /** The controls' words. */
  controls: {
    baselineValue: Template<'value'>;
    baselineHinted: Template<'value' | 'hint'>;
    numberPercent: Template<'label'>;
    numberRelative: Template<'label'>;
    numberPoints: Template<'label'>;
    riseTo: Template<'rise' | 'target'>;
    up: Template<'rise' | 'target'>;
    modeLegend: string;
    modePoints: string;
    modeRelative: string;
    perDay: Template<'n'>;
    trafficNoun: Template<'n' | 'noun'>;
    trafficCount: Template<'count'>;
  };
  /** The announcements, as plain text. */
  announce: {
    sizing: Template<'n' | 'noun' | 'rise' | 'from' | 'to'>;
    paired: Template<'sentence' | 'weeks' | 'n' | 'noun'>;
    duration: Template<'weeks' | 'n' | 'noun' | 'count'>;
    labLead: Template<'from' | 'to' | 'hits' | 'of'>;
    lab: Template<'lead' | 'count' | 'weeks'>;
  };
  tables: {
    columns: readonly [string, string];
    sizing: { baseline: string; rise: string; riseRelative: string; target: string };
    duration: { perDay: Template<'noun'>; inAll: Template<'noun'>; weeks: string };
    lab: {
      baseline: string;
      rise: string;
      riseRelative: string;
      target: string;
      traffic: string;
      perGroup: string;
      inAll: string;
      weeks: string;
    };
  };
  /** The Lab's exhibit: the sentence above, the one below, the method row's summary, its terms and run-time method. */
  lab: {
    leadIn: string;
    takeaway: string;
    methodSummary: string;
    /** The four terms, as the method row names them. */
    termNames: { sampleSize: string; mde: string; power: string; alpha: string };
    /** Slots: sampleSize, mde, power, alpha (the term names), powerShare, hits, of, alphaShare, one, odds. */
    terms: Sentence;
    /** Slots: traffic, noun, rest. */
    weeksMethod: Sentence;
  };
};

/**
 * The noun after "at <n> ... a day". German picks the dative by count ("1 Besucher", "100 Besuchern"); English keeps
 * the plural it has always printed, so its output does not change.
 */
export const trafficNoun = (text: PlannerText, noun: PlannerNoun, n: number): string =>
  text.kit.locale === 'de' ? plural(n, text.nouns[noun].dative) : text.nouns[noun].dative.other;

export const EN_PLANNER: PlannerText = {
  kit: EN_LAB_KIT,
  exhibit: EN_EXHIBIT,
  nouns: {
    visitors: { one: 'visitor', other: 'visitors', capital: 'Visitors', dative: { one: 'visitor', other: 'visitors' } },
    customers: { one: 'customer', other: 'customers', capital: 'Customers', dative: { one: 'customer', other: 'customers' } },
  },
  context: {
    hypothetical: {
      sizingTitle: 'Smaller rises need more visitors and more weeks',
      durationTitle: 'The fewer visitors a day, the more weeks a test needs',
      label: 'Hypothetical test',
      trafficLabel: 'Visitors per day',
      baseline: 'Sign-up rate today',
      baselineHint: 'of visitors',
      rise: 'Smallest rise worth acting on',
      note: ['Made-up numbers to plan with. Visitors are split evenly between the two groups.'],
      durationFirst: [
        'If a page gets ',
        slot('count'),
        ' visitors a day, split equally between groups',
        ', this is how long both groups take to reach the size from the planner above, in whole weeks, rounded up.',
      ],
      durationExtra: null,
    },
    retention: {
      sizingTitle: 'Smaller rises need more customers per group',
      durationTitle: 'The fewer customers a day, the more weeks it takes to fill both groups',
      label: 'Hypothetical uplift',
      trafficLabel: 'Total customers per day',
      baseline: 'Baseline conversion',
      baselineHint: '',
      rise: 'Rise to detect',
      note: [
        'The preset is a hypothetical uplift on an observed baseline. Its baseline,',
        ' ',
        slot('baseline'),
        ", is the share of lapsed customers in the case study's public dataset who ordered again within the window; a rise of ",
        slot('uplift'),
        ' points, to ',
        slot('target'),
        ', is an uplift to plan for, not the effect of any offer. Nobody was contacted and no test was run.',
      ],
      durationFirst: [
        'If ',
        slot('count'),
        ' customers a day enter the test, split equally between groups',
        ', this is how long both groups take to reach the size from the planner above, in whole weeks, rounded up.',
      ],
      durationExtra: "Each customer's result is known only once their window for ordering again has passed, so the test runs that much longer after the last one enters.",
    },
  },
  perGroup: '{noun} per group',
  point: { one: 'point', other: 'points' },
  points: { one: '{n} point', other: '{n} points' },
  week: { one: 'week', other: 'weeks' },
  weeksRounded: { one: 'week, rounded up', other: 'weeks, rounded up' },
  percent: '{value}%',
  relativePercent: '{value}%',
  ofBaseline: '{value} of the baseline',
  ofBaselineShort: '{value} of baseline',
  sizingResult: ['To detect a rise of ', slot('rise'), ', from ', slot('from'), ' to ', slot('to'), '.'],
  method: [
    "Sample sizes from Cohen's h for a two-sided test at a significance level of",
    ' ',
    slot('alpha'),
    ' and a power of',
    ' ',
    slot('power'),
    ', with the ',
    slot('noun'),
    ' split equally between the two groups and the result read once, at the end:',
    ' ',
    slot('formula'),
    ' ',
    'In points, the rise is the target minus the baseline; as a percent of the baseline, it is that difference divided by the baseline. Either way the sample is the same.',
  ],
  durationResult: ['To reach ', slot('count'), ' per group, ', slot('all'), ' in all, at ', slot('traffic'), ' ', slot('noun'), ' a day.'],
  durationRest:
    'The traffic is a number to plan with, not a promise of actual traffic: it assumes every one of them enters the test and the same number arrives every day.',
  controls: {
    baselineValue: '{value} baseline conversion',
    baselineHinted: '{value} {hint}',
    numberPercent: '{label}, percent',
    numberRelative: '{label}, percent of the baseline',
    numberPoints: '{label}, points',
    riseTo: '{rise}, to {target}',
    up: 'Up {rise}, to {target}',
    modeLegend: 'Rise to detect, in',
    modePoints: 'Points',
    modeRelative: 'Percent of baseline',
    perDay: '{n} a day',
    trafficNoun: '{n} {noun} a day, both groups together',
    trafficCount: '{count} a day, both groups together',
  },
  announce: {
    sizing: '{n} {noun} per group to detect a rise of {rise}, from {from} to {to}',
    paired: '{sentence}; both groups fill in {weeks} at {n} {noun} a day',
    duration: '{weeks} at {n} {noun} a day to reach {count} per group',
    labLead: 'To catch a real rise from {from} to {to} in {hits} tests out of {of}, you need:',
    lab: '{lead} {count} per group and {weeks}',
  },
  tables: {
    columns: ['Input or result', 'Value'],
    sizing: {
      baseline: 'Baseline conversion (%)',
      rise: 'Rise to detect (percentage points)',
      riseRelative: 'Rise to detect (% of baseline)',
      target: 'Target conversion (%)',
    },
    duration: { perDay: '{noun} per day, both groups together', inAll: '{noun} in all', weeks: 'Weeks, rounded up' },
    lab: {
      baseline: 'Sign-up rate today (%)',
      rise: 'Smallest rise worth acting on (percentage points)',
      riseRelative: 'Smallest rise worth acting on (% of the rate today)',
      target: 'Target sign-up rate (%)',
      traffic: 'Visitors per day, both groups together',
      perGroup: 'Visitors per group',
      inAll: 'Visitors in all',
      weeks: 'Weeks, rounded up',
    },
  },
  lab: {
    leadIn:
      'Make the smallest rise smaller and watch the visitors climb. Halve the rise, and each group needs about four times as many.',
    takeaway:
      'Before a test, I agree on the smallest rise worth acting on. Some pages get too few visitors to show it within weeks. For those, I test a bolder change or a busier page instead of waiting months.',
    methodSummary: 'How I worked out the size and the weeks',
    termNames: { sampleSize: 'Sample size', mde: 'Minimum detectable effect', power: 'Power', alpha: 'Significance level' },
    terms: [
      slot('sampleSize'),
      ': how many visitors each group needs before the test can tell a real difference of the size you care about from chance.',
      ' ',
      slot('mde'),
      ': the smallest rise worth acting on, agreed before the test. ',
      slot('power'),
      ': the chance that a test detects an effect of a given size when the effect is really there; ',
      slot('powerShare'),
      ' means',
      ' ',
      slot('hits'),
      ' times in',
      ' ',
      slot('of'),
      '. ',
      slot('alpha'),
      ': the risk of a false winner when there is no real rise; ',
      slot('alphaShare'),
      ' ',
      'means ',
      slot('one'),
      ' time in',
      ' ',
      slot('odds'),
      '.',
    ],
    weeksMethod: [
      'The weeks are how long both groups take to reach that size at',
      ' ',
      slot('traffic'),
      ' ',
      slot('noun'),
      ' a day, split equally between them, in whole weeks, rounded up. ',
      slot('rest'),
    ],
  },
};
