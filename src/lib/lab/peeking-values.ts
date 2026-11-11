// The peeking Figure's values and control words, for the code the page loads at once (the control
// row and its preview copy). It must not import peeking.ts, which brings the precomputed table: the
// table arrives with the island only (guarded by tests/unit/lab/peeking-bundle.test.ts). The schema,
// presets and visitors per look equal the model's (tested in tests/unit/lab/peeking-figure.test.tsx).
import type { DerivedRef } from '@/components/kit/Derived';
import { formatNumber } from '@/lib/figure/format';
import type { ParamValues, Presets } from '@/lib/figure/url-state';

export const PEEK_ID = 'peeking';
/** An interactive Figure's title states the relationship. */
export const PEEK_TITLE = 'More looks, more false winners';

export const PEEK_SCHEMA = {
  looks: { kind: 'number', min: 1, max: 50, step: 1 },
  mode: { kind: 'enum', values: ['daily', 'once'] },
  fix: { kind: 'enum', values: ['naive', 'obf', 'cs'] },
} as const;

export type PeekParams = ParamValues<typeof PEEK_SCHEMA>;

/** `interview` is the deep link `?peeking.preset=interview`: the same view as the default. */
export const PEEK_PRESETS: Presets<typeof PEEK_SCHEMA> = {
  default: { looks: 20, mode: 'daily', fix: 'naive' },
  interview: { looks: 20, mode: 'daily', fix: 'naive' },
};

/** Each daily look adds this many visitors per group (the simulation's manifest). */
export const PEEK_VISITORS_PER_LOOK = 100;
export const PEEK_UI_REFS: readonly DerivedRef[] = ['simulated'];

export const MODE_OPTIONS = [
  { value: 'daily', label: 'Peek daily' },
  { value: 'once', label: 'Look once' },
] as const;

export const FIX_OPTIONS = [
  { value: 'naive', label: 'None' },
  { value: 'obf', label: "O'Brien-Fleming" },
  { value: 'cs', label: 'Confidence sequence' },
] as const;

/** Shown under Fix while it is disabled. */
export const ONCE_FIX_REASON = 'One look at the end needs no fix.';

const visitors = (looks: number) => formatNumber(looks * PEEK_VISITORS_PER_LOOK, 0);

/** The slider's aria-valuetext: the looks, and the visitors per group they add up to. */
export function looksValueText(looks: number, mode: PeekParams['mode']): string {
  if (mode === 'once') return `one look after ${visitors(looks)} visitors per group`;
  return looks === 1 ? `1 look, ${visitors(1)} visitors per group` : `${looks} looks, ${visitors(looks)} visitors per group by the last`;
}

/** The slider's visible unit: the visitors per group at the last look (or the one look). */
export const looksReadout = (looks: number) => `${visitors(looks)} per group`;
