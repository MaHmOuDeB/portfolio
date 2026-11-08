'use client';

// A native radio group drawn as a segmented control. The radios are visually hidden inside their
// labels, so the focus ring is drawn on the label (globals.css, `label:has(:focus-visible)`). Never
// overflow-hidden: the ring must sit outside the segment, on bg. Hidden without JavaScript.
// From xs up the options are one joined row exactly 44 px tall (--size-target, the touch target, with
// no padding round it), so a control row lines up with the Slider and Reset. Under xs they stack as
// full-width rows, each with a radio mark, so an unselected option still reads as a choice.
import { cx } from '@/lib/cx';

export type SegmentedProps<V extends string> = {
  name: string;
  legend: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
};

const STATE = {
  checked: { enabled: 'border-ink bg-ink text-bg', disabled: 'cursor-not-allowed border-muted bg-muted text-bg' },
  unchecked: { enabled: 'cursor-pointer border-muted text-ink hover:bg-line', disabled: 'cursor-not-allowed border-line text-muted' },
} as const;

export function Segmented<V extends string>({ name, legend, options, value, onChange, disabled }: SegmentedProps<V>) {
  // A value that is not an option (a stale or hostile URL) shows the first option as chosen.
  const selected = options.some((o) => o.value === value) ? value : options[0]?.value;
  return (
    <fieldset data-js-only disabled={disabled} className="min-w-0 max-xs:w-full">
      <legend className="text-sm text-muted">{legend}</legend>
      <div className="mt-1 flex flex-col gap-2 xs:inline-flex xs:flex-row xs:gap-0">
        {options.map((option) => {
          const checked = option.value === selected;
          return (
            <label
              key={option.value}
              data-touch-target
              data-segment
              className={cx(
                'relative inline-flex min-h-(--size-target) items-center gap-3 border px-4 text-sm font-medium transition-colors max-xs:w-full max-xs:flex-wrap max-xs:rounded-md xs:whitespace-nowrap xs:not-first:-ml-px xs:first:rounded-l-md xs:last:rounded-r-md',
                STATE[checked ? 'checked' : 'unchecked'][disabled ? 'disabled' : 'enabled'],
              )}
            >
              <input
                type="radio"
                className="sr-only scroll-my-8"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              <span
                aria-hidden="true"
                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-current xs:hidden"
              >
                {checked ? <span className="size-2 rounded-full bg-current" /> : null}
              </span>
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
