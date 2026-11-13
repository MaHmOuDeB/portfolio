'use client';

// A native radio group drawn as a segmented control. The radios are visually hidden inside their
// labels, so the focus ring is drawn on the label (globals.css, `label:has(:focus-visible)`). Never
// overflow-hidden: the ring must sit outside the segment, on bg. Hidden without JavaScript.
// From xs up the options are one joined row exactly 44 px tall (--size-target, the touch target, with
// no padding round it), so a control row lines up with the Slider and Reset. Under xs they stack as
// full-width rows, each with a radio mark, so an unselected option still reads as a choice.
// A disabled group can name the element that says why (`disabledReasonId`): it describes the group
// while disabled, and only then, so a hidden reason is never read.
// A choice made before the group listened is taken up once it does (see takeEarlyPick below).
import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { hasEntry } from '@/lib/figure/early-entry';

export type SegmentedProps<V extends string> = {
  name: string;
  legend: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
  /**
   * The id of the element that says why the group is disabled. While `disabled`, it describes the
   * group (aria-describedby on the fieldset), so assistive technology reads the reason with it; while
   * enabled it is not used.
   */
  disabledReasonId?: string;
};

const STATE = {
  checked: { enabled: 'border-ink bg-ink text-bg', disabled: 'cursor-not-allowed border-muted bg-muted text-bg' },
  unchecked: { enabled: 'cursor-pointer border-muted text-ink hover:bg-line', disabled: 'cursor-not-allowed border-line text-muted' },
} as const;

// The root of a LoadOnIntent whose island has not replaced its preview yet.
const IDLE_ISLAND = '[data-island="idle"]';

/** The radios of the group `name` that the reader checked before anything listened. */
function earlyPicks(radios: Iterable<Element>): HTMLInputElement[] {
  return [...radios].filter((r): r is HTMLInputElement => r instanceof HTMLInputElement && r.type === 'radio' && r.checked && hasEntry(r));
}

/**
 * The choice a reader made in the LoadOnIntent preview copy of this group, read while the group
 * first renders, with the loader's root it was made in. It must be read then: the copy and this
 * group share a name in one document, so they are one radio group, and once this group's checked
 * radio is inserted the browser unchecks the copy's choice.
 */
function previewPick(name: string): { value: string; root: Element } | null {
  if (typeof document === 'undefined') return null;
  for (const radio of earlyPicks(document.getElementsByName(name))) {
    const root = radio.closest(IDLE_ISLAND);
    if (root !== null) return { value: radio.value, root };
  }
  return null;
}

export function Segmented<V extends string>({ name, legend, options, value, onChange, disabled, disabledReasonId }: SegmentedProps<V>) {
  // A value that is not an option (a stale or hostile URL) shows the first option as chosen.
  const selected = options.some((o) => o.value === value) ? value : options[0]?.value;
  const box = useRef<HTMLFieldSetElement>(null);
  const [copyPick] = useState(() => previewPick(name));

  // A choice the reader made before this group listened: a radio picked (by pointer or the arrow
  // keys) before the page hydrated, which React 19 leaves checked while the segments are still drawn
  // as rendered and the value behind them is unchanged. Read once, in the commit where the group
  // first appears:
  // - in a LoadOnIntent preview it is left as it is: the loader loads the island, whose group (the
  //   same name) takes it over from the pick read as it first rendered;
  // - otherwise the rendered radio is checked again and the pick is passed to onChange, as its change
  //   event would have been. A pick that is not one of the options is ignored.
  const takeEarlyPick = useEffectEvent(() => {
    const fieldset = box.current;
    if (fieldset === null || disabled) return;
    const own = fieldset.querySelectorAll('input[type="radio"]');
    const [pick] = earlyPicks(own);
    const root = fieldset.closest(IDLE_ISLAND);
    let picked: string | null = null;
    if (pick !== undefined) {
      if (root !== null) return;
      for (const radio of own) if (radio instanceof HTMLInputElement) radio.checked = radio.value === selected;
      picked = pick.value;
    } else if (copyPick !== null && root !== null && copyPick.root === root) {
      picked = copyPick.value;
    }
    const option = options.find((o) => o.value === picked);
    if (option !== undefined && option.value !== selected) onChange(option.value);
  });
  useLayoutEffect(() => {
    takeEarlyPick();
  }, []);

  return (
    <fieldset
      ref={box}
      data-js-only
      disabled={disabled}
      aria-describedby={disabled && disabledReasonId ? disabledReasonId : undefined}
      className="min-w-0 max-xs:w-full"
    >
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
                id={`${name}-${option.value}`}
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
