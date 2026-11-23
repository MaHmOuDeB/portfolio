// The split check's words, as plain data (see text-planner.ts for the shape of the idea): strings,
// templates and sentences, so the server can hand them to the client island as props. English is the
// default (EN_SRM); the other language is in content/de/lab.tsx, typed by SrmText.
import type { Template } from '@/lib/i18n/template';
import { slot, type Sentence } from '@/lib/retention/sentence';
import { EN_EXHIBIT, EN_LAB_KIT, type ExhibitLabels, type LabKit } from './text-common';

export type SrmText = {
  kit: LabKit;
  exhibit: ExhibitLabels;
  /** An interactive Figure's title states the relationship. */
  title: string;
  /** The count sliders: "{n} visitor", "{n} visitors". */
  visitors: { one: Template<'n'>; other: Template<'n'> };
  labelA: string;
  labelB: string;
  empty: string;
  smallNote: string;
  status: { flagged: string; ok: string };
  /** The odds of a false alarm. Slots: one, n. */
  odds: Sentence;
  /** The verdict after the status, with a fair coin. Slot: odds. */
  verdict: { flagged: Sentence; ok: Sentence };
  /** The statistic for the method row, as plain text. */
  statText: Template<'chi2' | 'p'>;
  /** A flagged p-value, printed as below the threshold. */
  below: Template<'value'>;
  /** The chart's accessible name, one per state. */
  chartName: { empty: string; flagged: string; ok: string };
  axis: { x: string; y: string };
  /** The group's name under its pair of bars. Slot: group. */
  groupLabel: Sentence;
  legend: { observed: string; expected: string };
  caption: string;
  table: { columns: readonly [string, string, string, string]; groupA: string; groupB: string; note: string };
  /** The sentence above the Figure. Slots: a, b. */
  leadIn: Sentence;
  takeaway: string;
  summary: string;
  /** The method row. Slot (terms): term. Slots (method): threshold, small. Slots (setting): chi2, p. */
  term: string;
  terms: Sentence;
  method: Sentence;
  setting: Sentence;
  /** The link under the exhibit to the even split. */
  evenLink: string;
};

export const EN_SRM: SrmText = {
  kit: EN_LAB_KIT,
  exhibit: EN_EXHIBIT,
  title: 'The bigger the gap, the less often a fair coin makes it',
  visitors: { one: '{n} visitor', other: '{n} visitors' },
  labelA: 'Group A visitors',
  labelB: 'Group B visitors',
  empty: 'No visitors yet, so there is nothing to check.',
  smallNote: 'With so few visitors, this check is only rough.',
  status: { flagged: 'Flagged', ok: 'Not flagged' },
  odds: [slot('one'), ' time in ', slot('n')],
  verdict: {
    flagged: ['a fair coin leaves a gap this big or bigger ', 'less than', ' ', slot('odds'), '.'],
    ok: ['a fair coin leaves a gap this big or bigger ', 'at least', ' ', slot('odds'), '.'],
  },
  statText: 'chi-square {chi2}, one degree of freedom, p-value {p}',
  below: 'below {value}',
  chartName: {
    empty: 'The visitors who arrived and half of all visitors, in group A and group B, as paired bars: no visitors yet, so nothing is tested',
    flagged: 'The visitors who arrived and half of all visitors, in group A and group B, as paired bars: the split is flagged for a closer look',
    ok: 'The visitors who arrived and half of all visitors, in group A and group B, as paired bars: the split is not flagged',
  },
  axis: { x: 'Group', y: 'Visitors' },
  groupLabel: ['Group ', slot('group')],
  legend: { observed: 'Visitors who arrived (filled)', expected: 'Half of all visitors, the plan (outlined)' },
  caption: 'Made-up visitor counts. Each group was meant to get half.',
  table: {
    columns: ['Group', 'Visitors', 'Planned share', 'Expected visitors'],
    groupA: 'Group A',
    groupB: 'Group B',
    note: 'Made-up counts you set. The expected visitors are half of all visitors.',
  },
  leadIn: [
    'Here group A got ',
    slot('a'),
    ' visitors and group B ',
    slot('b'),
    '. That looks close. Is it? Move group B closer to group A and watch the verdict.',
  ],
  takeaway:
    'It is not close enough. I make this check before I read any result. When it flags, I find what broke the split before anything else. Otherwise a winner may only reflect who ended up in each group.',
  summary: 'How the split check works',
  term: 'Split check (sample ratio mismatch)',
  terms: [
    'Each visitor is assigned at random, like a fair coin toss.',
    ' ',
    slot('term'),
    ': a test of whether each group received the share of visitors the design gave it; if it fails, the assignment or the counting is at fault and no result should be read. The Lab fixes the planned share at half; the check works against any planned share.',
  ],
  method: [
    'The check is a chi-square test with one degree of freedom on the counts against that share. It flags the split when the p-value is below ',
    slot('threshold'),
    ', a strict threshold, so that a check run on every test rarely raises a false alarm. A flag is a warning to investigate the assignment and the logging, not proof of what caused it. The test is an approximation: with fewer than ',
    slot('small'),
    ' expected visitors in a group its p-value is rough. It assumes each visitor is counted once and assigned independently with the same chance (a binomial model), and it guarantees no business outcome. These p-values are simulated diagnostics on numbers you set, not results from this site’s live test.',
  ],
  setting: [' ', 'For your setting: chi-square ', slot('chi2'), ', one degree of freedom, p-value', ' ', slot('p'), '.'],
  evenLink: 'See an even split pass',
};
