// Numerals the truth audit accepts without a <Fact> or <Derived> marker. A token is allowed when a
// match of the pattern, run over the whole text, contains it. `routes` limits an entry to those
// routes; without it the entry applies everywhere. There are no status-code entries: the not-found
// and error pages show no status code as text.
export const ALLOW: readonly { pattern: RegExp; routes?: readonly string[]; reason: string }[] = [
  { pattern: /(?<![\d.,])\b20(0[89]|[12]\d|30)\b(?![.,]\d)/, reason: 'year' },
  { pattern: /\b[ABC][12]\b/, reason: 'CEFR level' },
];

// Routes the site does not author. The stray-number check is skipped on them; the deny-list, banned
// phrases and marker validation still run. `/_global-error` is the static page Next 16.3.8 hard-codes
// for a crash of the root layout itself (title "500: This page couldn't load"). It is shown only
// then, and `global-error.tsx` cannot replace it, so the site cannot edit its text.
export const FRAMEWORK_ROUTES: readonly string[] = ['/_global-error'];
