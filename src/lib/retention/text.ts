// The words of the two interactive Retention Figures (returns and cohorts), as plain data: strings,
// templates and sentences, no functions and no elements, so the server can hand them to the client
// islands as props. English is the default of every component, as in the kit (src/components/kit/
// text.ts); the German values are in content/de/retention.tsx, typed by these types, and a client file
// never imports them. The static Figures (models and segments) print from the page's copy on the server.
//
// A sentence that holds numbers is a `Sentence` (see ./sentence): its pieces are exactly the children
// of the English JSX it replaced, so the English markup is the same.
import { KIT_TEXT_EN, type KitText } from '@/components/kit/text';
import type { Template } from '@/lib/i18n/template';
import type { ReturnMode } from './data';
import { slot, type Sentence } from './sentence';

/** The slices of the kit's words that strings alone can carry: what an island's Figure and controls print. */
export type KitSlice = Pick<KitText, 'locale' | 'zero' | 'figure' | 'table' | 'error' | 'badge' | 'reset' | 'step'>;

/** The island's full `KitText`: the slice, with the English of the parts an island never prints. */
export function kitFromSlice(slice: KitSlice): KitText {
  return { ...KIT_TEXT_EN, ...slice };
}

/** The slice of a full `KitText`, for a server component to hand to an island. */
export function kitSlice(t: KitText): KitSlice {
  return { locale: t.locale, zero: t.zero, figure: t.figure, table: t.table, error: t.error, badge: t.badge, reset: t.reset, step: t.step };
}

export const EN_KIT_SLICE: KitSlice = kitSlice(KIT_TEXT_EN);

export type ReturnsText = {
  kit: KitSlice;
  title: string;
  mode: { legend: string; raw: string; clean: string };
  /** The chart's accessible name: a finding in words, no digit. */
  chartName: Record<ReturnMode, string>;
  partial: string;
  axis: { x: string; y: string };
  /** The words of the growth window: "Jan to Nov 2011 versus Jan to Nov 2010". */
  period: { to: string; versus: string };
  /** The first sentence of the result line, with the other mode's sentence in the slot `reversal`. Slots: hours, growth, period, reversal. */
  lead: Record<ReturnMode, Sentence>;
  /** The sentence that says what the other mode would show. Slots: january, date. */
  reversal: Record<ReturnMode, Sentence>;
  /** Slot: hours. */
  caption: Sentence;
  table: {
    columns: readonly [month: string, value: string, partial: string];
    yes: string;
    no: string;
    note: Record<ReturnMode, string>;
  };
};

export const EN_RETURNS: ReturnsText = {
  kit: EN_KIT_SLICE,
  title: 'Removing reversed orders changes the returns story',
  mode: { legend: 'Reversed orders', raw: 'Counted as returns', clean: 'Removed' },
  chartName: {
    raw: 'Returned-order value by month, with reversed orders counted as returns: a spike in the second January and a tall partial last month',
    clean: 'Returned-order value by month, with reversed orders removed: no spike in the second January, and a small partial last month',
  },
  partial: 'Partial month',
  axis: { x: 'Month', y: 'Returned-order value (GBP)' },
  period: { to: 'to', versus: 'versus' },
  lead: {
    raw: [
      'Counting orders cancelled within ',
      slot('hours'),
      ' hours as returns, returned-order value looks like it grew',
      ' ',
      slot('growth'),
      ', ',
      slot('period'),
      '. ',
      slot('reversal'),
    ],
    clean: [
      'With orders cancelled within ',
      slot('hours'),
      ' hours removed, returned-order value grew about',
      ' ',
      slot('growth'),
      ', ',
      slot('period'),
      '. ',
      slot('reversal'),
    ],
  },
  reversal: {
    raw: [
      'Removing those orders brings the growth down',
      ': the difference is mostly one ',
      slot('january'),
      ' order placed and cancelled on',
      ' ',
      slot('date'),
      '.',
    ],
    clean: [
      'Counting those orders as returns makes the growth look larger',
      ': the difference is mostly one ',
      slot('january'),
      ' order placed and cancelled on',
      ' ',
      slot('date'),
      '.',
    ],
  },
  caption: [
    "Returned-order value per month, in pounds, from a public dataset of a UK online gift retailer's orders. The reversal rule removes a cancellation together with the order line it reverses: the same customer, product and quantity, ordered up to ",
    slot('hours'),
    ' hours before it. The data stops early in its last month, so that bar is a partial month, drawn as an outline and not compared with the full months. Growth here is in returned-order value, not returns as a share of sales.',
  ],
  table: {
    columns: ['Month', 'Returned-order value (GBP)', 'Partial month'],
    yes: 'Yes',
    no: 'No',
    note: {
      raw: 'Without the reversal rule: a cancellation that reverses an order counts as a returned order. The last month is partial: the data ends early in December.',
      clean:
        'With the reversal rule: an order and the cancellation that reverses it are both removed. The last month is partial: the data ends early in December.',
    },
  },
};

export type CohortText = {
  kit: KitSlice;
  title: string;
  /** The word before the chosen cohort ("Cohort: Jan 2010"), and the picker's accessible name. */
  picked: string;
  nav: string;
  selected: string;
  axis: { x: string; heat: string; line: string };
  /** Slot: name. */
  annotation: Template<'name'>;
  /** The charts' accessible names: findings in words, no digit. */
  aria: { heat: Template<'span' | 'month'>; line: Template<'month'> };
  /** The word between the first and last month of the span ("January to November 2010"). */
  span: { to: string };
  /** Slots: share1, name, size, share12. */
  result: Sentence;
  /** Slot: span. */
  caption: Sentence;
  table: {
    columns: readonly [cohort: string, customers: string, formation: string];
    /** The headers of months one to twelve. */
    months: readonly string[];
    note: string;
  };
};

export const EN_COHORTS: CohortText = {
  kit: EN_KIT_SLICE,
  title: 'Repeat ordering varies by cohort and month',
  picked: 'Cohort: ',
  nav: 'Cohort',
  selected: 'Selected',
  axis: { x: 'Months after the first order', heat: 'Cohort, by month of first order', line: 'Ordered again that month (%)' },
  annotation: '{name} cohort',
  aria: {
    heat: 'Share of each cohort, by month of first order from {span}, who ordered again in each month after it, as shaded cells with their values; the {month} cohort is outlined',
    line: 'Share of the {month} cohort who ordered again, month by month for the twelve months after their first order',
  },
  span: { to: 'to' },
  result: [
    'In the month after their first order, ',
    slot('share1'),
    ' of the ',
    slot('name'),
    ' cohort (',
    slot('size'),
    ' customers) ordered again; in the twelfth month after it, ',
    slot('share12'),
    ' did.',
  ],
  caption: [
    'Customers of a UK online gift retailer, from a public dataset, grouped by the month of their first order in the data, ',
    slot('span'),
    '. Each later month shows the share of a cohort who ordered again in that later month, so a share can rise again: it is not the share still ordering every month since. Month zero, the first order itself, includes every member by definition, so only the table shows it. On a wide screen each row is a cohort and darker cells hold larger shares, with the chosen cohort outlined; on a narrow one the chosen cohort is a line.',
  ],
  table: {
    columns: ['Cohort', 'Customers', 'Formation month'],
    months: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'].map((w) => `Month ${w}`),
    note: 'Customers are grouped by the month of their first order in the data. Each later month counts the cohort members who ordered in that month, so a share can rise again; it is not the share who kept buying every month since.',
  },
};
