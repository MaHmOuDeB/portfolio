// The peeking Figure's values and control words, for the code the page loads at once (the control
// row and its preview copy). It must not import peeking.ts, which brings the precomputed table: the
// table arrives with the island only (guarded by tests/unit/lab/peeking-bundle.test.ts). The schema,
// presets and visitors per look equal the model's (tested in tests/unit/lab/peeking-figure.test.tsx).
//
// The Figure checks daily: its URL state is the number of days checked and the fix. The model can
// also check once at the end (the method row quotes that rate), but no control sets it, so an old
// link with `peeking.mode` is ignored and falls back to daily checks.
import type { DerivedRef } from '@/components/kit/Derived';
import { formatNumber } from '@/lib/figure/format';
import type { ParamValues, Presets } from '@/lib/figure/url-state';
import { fill } from '@/lib/i18n/template';
import { plural } from './text-common';
import { EN_PEEK, type PeekText } from './text-peek';

export const PEEK_ID = 'peeking';
/** An interactive Figure's title states the relationship. */
export const PEEK_TITLE = EN_PEEK.title;

export const PEEK_SCHEMA = {
  looks: { kind: 'number', min: 1, max: 50, step: 1 },
  fix: { kind: 'enum', values: ['naive', 'obf', 'cs'] },
} as const;

export type PeekParams = ParamValues<typeof PEEK_SCHEMA>;

/** `interview` is the deep link `?peeking.preset=interview`: the same view as the default. */
export const PEEK_PRESETS: Presets<typeof PEEK_SCHEMA> = {
  default: { looks: 20, fix: 'naive' },
  interview: { looks: 20, fix: 'naive' },
};

/** Each daily look adds this many visitors per group (the simulation's manifest). */
export const PEEK_VISITORS_PER_LOOK = 100;
export const PEEK_UI_REFS: readonly DerivedRef[] = ['simulated'];

/** The fixes in plain words; the method row names them (O'Brien-Fleming, confidence sequence). */
export const FIX_OPTIONS = [
  { value: 'naive', label: 'No fix' },
  { value: 'obf', label: 'Stricter early checks' },
  { value: 'cs', label: 'Always-valid check' },
] as const;

/** The control row's words. */
export const PEEK_LABELS = EN_PEEK.labels;

/** The fix options with their words in a language. */
export const fixOptions = (text: PeekText = EN_PEEK) =>
  PEEK_SCHEMA.fix.values.map((value) => ({ value, label: text.fixOptions[value] }));

/** The links under the exhibit: the same setting with each fix, as a full page load so the island reads it. */
export const PEEK_PRESET_LINKS = [
  { href: '?peeking.fix=obf#peeking-at-results', label: 'Try stricter early checks' },
  { href: '?peeking.fix=cs#peeking-at-results', label: 'Try the always-valid check' },
] as const;

const visitors = (looks: number, text: PeekText) => formatNumber(looks * PEEK_VISITORS_PER_LOOK, 0, { locale: text.kit.locale });

/** "1 day", "20 days". */
const daysText = (days: number, text: PeekText) =>
  fill(plural(days, text.days), { n: formatNumber(days, 0, { locale: text.kit.locale }) });

/** The slider's aria-valuetext: the days checked, and the visitors per group they add up to. */
export function looksValueText(looks: number, text: PeekText = EN_PEEK): string {
  return fill(looks === 1 ? text.looksOne : text.looksMany, { days: daysText(looks, text), visitors: visitors(looks, text) });
}

/** The slider's visible unit: the days checked. */
export const looksReadout = (looks: number, text: PeekText = EN_PEEK) => daysText(looks, text);
