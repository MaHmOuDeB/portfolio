// Numerals the truth audit accepts without a <Fact> or <Derived> marker. A token is allowed when a
// match of the pattern, run over the whole text, contains it. `routes` limits an entry to those
// routes; without it the entry applies everywhere. There are no status-code entries: the not-found
// and error pages show no status code as text.
export const ALLOW: readonly { pattern: RegExp; routes?: readonly string[]; reason: string }[] = [
  { pattern: /(?<![\d.,])\b20(0[89]|[12]\d|30)\b(?![.,]\d)/, reason: 'year' },
  { pattern: /\b[ABC][12]\b/, reason: 'CEFR level' },
];
