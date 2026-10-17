'use client';

// A native radio group drawn as a segmented control. The radios are visually hidden inside their
// labels, so the focus ring is drawn on the label (globals.css, `label:has(:focus-visible)`). Never
// overflow-hidden: the ring must sit outside the segment, on bg. Hidden without JavaScript.
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
  checked: { enabled: 'bg-ink text-bg', disabled: 'cursor-not-allowed bg-muted text-bg' },
  unchecked: { enabled: 'cursor-pointer text-ink hover:bg-line', disabled: 'cursor-not-allowed text-muted' },
} as const;

export function Segmented<V extends string>({ name, legend, options, value, onChange, disabled }: SegmentedProps<V>) {
  // A value that is not an option (a stale or hostile URL) shows the first option as chosen.
  const selected = options.some((o) => o.value === value) ? value : options[0]?.value;
  return (
    <fieldset data-js-only disabled={disabled} className="min-w-0">
      <legend className="text-sm text-muted">{legend}</legend>
      <div className="mt-1 inline-flex gap-1 rounded-md border border-muted p-1 max-xs:flex max-xs:flex-col">
        {options.map((option) => {
          const checked = option.value === selected;
          return (
            <label
              key={option.value}
              data-touch-target
              data-segment
              className={cx(
                'relative inline-flex min-h-(--size-target) items-center rounded-sm px-4 text-sm font-medium whitespace-nowrap transition-colors',
                STATE[checked ? 'checked' : 'unchecked'][disabled ? 'disabled' : 'enabled'],
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
