// The treatment of the card-headlines experiment: the three featured-card headlines in each group.
// Group A names the topic; group B states the finding. This copy is frozen with the experiment
// configuration (it is part of the pre-registration hash), so a wording change needs a new
// pre-registration version. Numbers are facts, never typed numerals.
import type { FactId } from '../../src/lib/facts/index.ts';

/** A piece of a headline: plain text, or a number rendered from the facts data. */
export type HeadlinePart = string | { fact: FactId };

export type CardHeadlines = {
  study: 'audible' | 'retention' | 'pulse';
  a: HeadlinePart[];
  b: HeadlinePart[];
};

export const HEADLINES: readonly CardHeadlines[] = [
  {
    study: 'audible',
    a: ['How I run experiments'],
    b: ['Most tests pitted personalisation against plain baselines'],
  },
  {
    study: 'retention',
    a: ['Customer retention and reactivation analysis'],
    b: [
      'Reversed orders turned ',
      { fact: 'retail.returns.yoy_growth_clean' },
      ' returns growth into ',
      { fact: 'retail.returns.yoy_growth_raw' },
    ],
  },
  {
    study: 'pulse',
    a: ['Pulse: analytics instrumentation demo'],
    b: [{ fact: 'pulse.events.count' }, ' events, each designed to answer a product question'],
  },
];
