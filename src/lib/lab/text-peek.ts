// The peeking Figure's words, as plain data: see text-planner.ts for the idea. A sentence that holds
// numbers is a `Sentence`; a plain word that belongs inside one text piece of it ("above", "days") is
// a `{name}` placeholder filled in place (src/lib/lab/sentence.ts). English is the default (EN_PEEK); the
// other language is in content/de/lab.tsx, typed by PeekText. The table's words are the model's
// (src/lib/lab/peeking.ts builds the table), so `table` is a slice of its own.
import type { Template } from '@/lib/i18n/template';
import { slot, type Sentence } from '@/lib/retention/sentence';
import { EN_EXHIBIT, EN_LAB_KIT, type ExhibitLabels, type LabKit, type Plural } from './text-common';

/** How the rate stands against the planned level, in the words a sentence inserts. */
export type PeekRelation = { closeOrUnder: string; wellUnder: string; above: string; below: string; about: string };

export type PeekTableText = {
  once: { columns: readonly [string, string, string]; daily: string; end: string; note: string };
  naive: { columns: readonly [string, string]; note: string };
  fix: { columns: readonly [string, string, Template<'fix'>]; note: string };
  /** The fix's name inside the table's last column. */
  fixNames: { naive: string; obf: string; cs: string };
};

export type PeekText = {
  kit: LabKit;
  exhibit: ExhibitLabels;
  /** An interactive Figure's title states the relationship. */
  title: string;
  labels: { looks: string; fix: string };
  fixOptions: { naive: string; obf: string; cs: string };
  presetLinks: { obf: string; cs: string };
  day: Plural;
  /** "{n} day", "{n} days" for the slider's reading. */
  days: { one: Template<'n'>; other: Template<'n'> };
  /** The slider's value text. Slots: days, visitors. */
  looksOne: Template<'days' | 'visitors'>;
  looksMany: Template<'days' | 'visitors'>;
  percent: Template<'value'>;
  relation: PeekRelation;
  /** The words a sentence inserts: the mark's name and "check(s)". */
  words: { dot: string; line: string; check: Plural };
  /** The result line, one per case. Slots: rate, runs, alpha, nPerLook, looks. Words: relation, days. */
  result: { once: Sentence; cs: Sentence; single: Sentence; singleObf: Sentence; obf: Sentence; naive: Sentence };
  /** The price of a fix, added to the result. Slot: ratio. */
  cost: { width: Sentence; boundary: Sentence };
  criterion: { once: Sentence; obf: Sentence; cs: Sentence; naive: Sentence };
  /** What the marks are. Slots: looks, n. Words: mark, checks, tail. */
  legend: {
    onceHidden: Sentence;
    once: Sentence;
    naiveOne: Sentence;
    naiveMany: Sentence;
    hidden: Sentence;
    other: Sentence;
    tailOne: string;
    tailMany: string;
  };
  caption: Sentence;
  method: {
    head: Sentence;
    scheduleOnce: Sentence;
    scheduleDaily: Sentence;
    onceRate: Sentence;
    tail: Sentence;
    cost: string;
    credit: string;
  };
  leadIn: Sentence;
  takeaway: string;
  summary: string;
  termNames: { peeking: string; falseWinner: string; obf: string; cs: string };
  /** Slots: peeking, falseWinner, odds, obf, cs. */
  terms: Sentence;
  /** The odds of a false winner at the nominal level. Slots: one, n. */
  odds: Sentence;
  chart: {
    name: {
      once: string;
      naiveOne: string;
      naiveMany: string;
      fixOne: Template<'method'>;
      fixMany: Template<'method'>;
      methods: { obf: string; cs: string };
    };
    axis: { x: string; y: string };
    key: Sentence;
  };
  table: PeekTableText;
};

export const EN_PEEK: PeekText = {
  kit: EN_LAB_KIT,
  exhibit: EN_EXHIBIT,
  title: 'More checks, more false winners',
  labels: { looks: 'Days checked', fix: 'Fix' },
  fixOptions: { naive: 'No fix', obf: 'Stricter early checks', cs: 'Always-valid check' },
  presetLinks: { obf: 'Try stricter early checks', cs: 'Try the always-valid check' },
  day: { one: 'day', other: 'days' },
  days: { one: '{n} day', other: '{n} days' },
  looksOne: '{days}, {visitors} visitors per group',
  looksMany: '{days}, {visitors} visitors per group by the last',
  percent: '{value}%',
  relation: { closeOrUnder: 'close to or under', wellUnder: 'well under', above: 'above', below: 'below', about: 'about' },
  words: { dot: 'dot', line: 'line', check: { one: 'check', other: 'checks' } },
  result: {
    once: [
      'Checked once at the end, after ',
      slot('nPerLook'),
      ' visitors per group, ',
      slot('rate'),
      ' of ',
      slot('runs'),
      ' tests found a false winner',
      ', {relation} the ',
      slot('alpha'),
      ' a single check allows.',
    ],
    cs: [
      'With the always-valid check, ',
      slot('rate'),
      ' of ',
      slot('runs'),
      ' tests found a false winner',
      '. That is well under the ',
      slot('alpha'),
      ' a single check allows. How far under depends on the setting.',
    ],
    single: [
      'With a single check, ',
      slot('rate'),
      ' of ',
      slot('runs'),
      ' tests found a false winner',
      ', {relation} the ',
      slot('alpha'),
      ' a single check allows.',
    ],
    singleObf: [' With one check there is nothing to correct.'],
    obf: [
      'With stricter early checks, ',
      slot('rate'),
      ' of ',
      slot('runs'),
      ' tests found a false winner',
      ', close to or under the ',
      slot('alpha'),
      ' a single check allows.',
    ],
    naive: [
      'Checked daily for ',
      slot('looks'),
      ' {days}, ',
      slot('rate'),
      ' of ',
      slot('runs'),
      ' tests found a false winner',
      '. Checked once at the end, about ',
      slot('alpha'),
      ' would.',
    ],
  },
  cost: {
    width: [' The price: at the last check, its margin of error is about ', slot('ratio'), " wider than one check's."],
    boundary: [' The price: at the last check, the bar is about ', slot('ratio'), ' higher than for one check.'],
  },
  criterion: {
    once: ['A run counts as a false winner if its p-value (pooled z-test, two-sided) at that one check falls below ', slot('alpha'), '. '],
    obf: [
      "A run counts as a false winner the first time the size of its z statistic reaches the O'Brien-Fleming bar for that check, set for an overall two-sided level of ",
      slot('alpha'),
      '. ',
    ],
    cs: ['A run counts as a false winner the first time the ', slot('level'), ' confidence sequence for the difference excludes zero. '],
    naive: ['A run counts as a false winner the first time its p-value (pooled z-test, two-sided) falls below ', slot('alpha'), '. '],
  },
  legend: {
    onceHidden: [
      'The comparison schedule is ',
      slot('looks'),
      ' daily check of ',
      slot('n'),
      ' visitors per group with no fix. With one check the comparison schedule gives the same share, so its pale dot sits under the ringed dot. ',
    ],
    once: [
      'The pale {mark} is the comparison schedule: ',
      slot('looks'),
      ' daily {checks} of ',
      slot('n'),
      ' visitors per group with no fix. The ringed dot is the one check at the end. ',
    ],
    naiveOne: ['The ringed dot is the share of runs flagged at the one check. '],
    naiveMany: ['The line is the share of runs flagged so far on each day, and the ringed dot is the last day. '],
    hidden: [
      'The comparison is the same ',
      slot('looks'),
      ' daily check of ',
      slot('n'),
      ' visitors per group with no fix; with one check the fix changes nothing, so the pale dot sits under the ringed dot. ',
    ],
    other: ['The pale {mark} is the same ', slot('looks'), ' daily {checks} of ', slot('n'), ' visitors per group with no fix; {tail}'],
    tailOne: 'the ringed dot uses the fix. ',
    tailMany: 'the dark line uses the fix, and the ringed dot is its last day. ',
  },
  caption: ['Simulated tests of two identical pages, each with a ', slot('p'), ' sign-up rate.'],
  method: {
    head: [
      'These are A/A tests: both groups see the same version, so every winner is a false one. ',
      'Under these simulation assumptions the rate is ',
      slot('rate'),
      ' (',
      slot('level'),
      ' Monte Carlo range ',
      slot('lower'),
      ' to ',
      slot('upper'),
      '): {relation} the nominal ',
      slot('alpha'),
      '. ',
    ],
    scheduleOnce: ['Looking once means one check after ', slot('n'), ' visitors per group. '],
    scheduleDaily: ['Each day checked adds ', slot('n'), ' visitors per group. '],
    onceRate: ['Checked once at the end, after the same ', slot('n'), ' visitors per group, the simulated rate is ', slot('rate'), '. '],
    tail: [
      'The dotted line marks the nominal ',
      slot('alpha'),
      '. ',
      slot('runs'),
      ' runs from seed ',
      slot('seed'),
      '; the ',
      slot('level'),
      ' Monte Carlo range is a Wilson interval over the runs: where the rate would settle with far more runs. ',
      'Each setting is its own simulation, so nearby numbers of days can differ by a few points. ',
    ],
    cost: "The price of a fix is arithmetic at the last check's sample, not a measured loss of power. ",
    credit: 'Idea credited to Evan Miller, “How Not To Run an A/B Test”.',
  },
  leadIn: [
    'Both pages here are the same, so every winner is a false winner. Drag the days checked and watch how many of',
    ' ',
    slot('runs'),
    ' tests find one.',
  ],
  takeaway:
    'I decide how to read a test before it starts. I read it once at the end, or with a method built for daily checks. The price of checking often: a winner needs stronger proof. The live test on this site uses the always-valid check.',
  summary: 'How the simulation works',
  termNames: {
    peeking: 'Peeking',
    falseWinner: 'False winner (false positive)',
    obf: "Stricter early checks (O'Brien-Fleming)",
    cs: 'Always-valid check (confidence sequence)',
  },
  terms: [
    slot('peeking'),
    ': checking a running test again and again and stopping the first time it looks significant, which gives chance many tries to produce a false winner. ',
    slot('falseWinner'),
    ': a difference the test flags although the two versions are in truth the same; a test read once is set to allow this about',
    ' ',
    slot('odds'),
    ', the nominal level.',
    ' ',
    slot('obf'),
    ': a planned schedule of checks in which early checks need much stronger evidence, so the false-winner rate over all checks stays at the planned level.',
    ' ',
    slot('cs'),
    ': an interval that stays valid however often it is looked at, at the price of being wider than a one-check interval.',
  ],
  odds: [slot('one'), ' time in ', slot('n')],
  chart: {
    name: {
      once: 'False winners when checking once at the end, beside daily checks with no fix',
      naiveOne: 'False winners at a single check with no fix',
      naiveMany: 'False winners so far by day when checking daily with no fix: the share climbs from the first day to the last',
      fixOne: 'False winners at a single check with {method}, beside the same check with no fix',
      fixMany: 'False winners so far by day with {method}, beside the same daily checks with no fix',
      methods: { obf: 'stricter early checks', cs: 'the always-valid check' },
    },
    axis: { x: 'Day', y: 'False winners so far' },
    key: ['Dotted line: ', slot('alpha'), ', the false winners one check at the end allows'],
  },
  table: {
    once: {
      columns: ['Look', 'Schedule', 'False winners so far (%)'],
      daily: 'Peeking daily, no fix',
      end: 'One look at the end',
      note: 'Shares of the simulated runs. Looking once means a single check, made after as many visitors as the daily schedule has at its last look.',
    },
    naive: {
      columns: ['Day', 'False winners so far, no fix (%)'],
      note: 'Shares of the simulated runs flagged as a winner on or before each day, checked once a day.',
    },
    fix: {
      columns: ['Day', 'False winners so far, no fix (%)', 'False winners so far, {fix} (%)'],
      note: 'Shares of the simulated runs flagged as a winner on or before each day, checked once a day.',
    },
    fixNames: { naive: 'no fix', obf: 'stricter early checks', cs: 'always-valid check' },
  },
};
