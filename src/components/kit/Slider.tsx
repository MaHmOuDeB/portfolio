'use client';

// A native range input joined to a number input. The range input is the interactive element; the
// track under it is drawn, not native. Every value is snapped, so a hostile value from a prop or a
// typed entry is clamped and never throws. Hidden without JavaScript: the server renders the preset.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { cx } from '@/lib/cx';
import { snapToStep } from '@/lib/figure/snap';

export type SliderProps = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Every input, snapped. */
  onChange: (value: number) => void;
  /** Pointer up, key up, number-input blur: when to announce the result. */
  onCommit?: (value: number) => void;
  /** aria-valuetext, e.g. "20 looks". */
  valueText: (value: number) => string;
  /**
   * A short visible reading of the value beside the number input, such as "10%" for a share typed as
   * 0.1, so the number never stands without its unit. It sits under the root's data-derived marker.
   */
  readout?: (value: number) => string;
  /** Accessible name of the number input; default `${label}, exact value`. */
  numberLabel?: string;
  /** Where the value comes from, for data-derived on the root: it covers the numbers in aria-valuetext. */
  refs: readonly DerivedRef[];
  disabled?: boolean;
};

// The keys a range input moves on; releasing one commits the value.
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function Slider({
  id,
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  valueText,
  readout,
  numberLabel,
  refs,
  disabled,
}: SliderProps) {
  const snap = (v: number) => snapToStep(v, min, max, step);
  const current = snap(value);
  const numberId = `${id}-exact`;
  // The number input's text while it is being edited; null shows the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const endDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => endDrag.current?.(), []);

  const share = max > min ? (current - min) / (max - min) : 0;
  // The thumb's centre runs from half a thumb to the far end minus half a thumb.
  const fill = { width: `calc(var(--spacing) * 2.5 + (100% - var(--spacing) * 5) * ${share})` } as CSSProperties;

  const applyDraft = () => {
    if (draft === null) return;
    setDraft(null);
    const typed = draft.trim() === '' ? Number.NaN : Number(draft);
    if (Number.isNaN(typed)) return; // an empty or unreadable entry reverts to the current value
    const next = snap(typed);
    if (next !== current) onChange(next);
    onCommit?.(next);
  };

  return (
    <div data-slider data-js-only {...derivedAttr(refs)} className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <div data-touch-target className="relative flex min-h-(--size-target) min-w-32 flex-1 items-center">
          <div
            data-slider-track
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-sm border border-muted bg-line"
          >
            <div
              data-slider-fill
              className={cx('h-full rounded-sm', disabled ? 'bg-muted' : 'bg-accent')}
              style={fill}
            />
          </div>
          <input
            data-kit-range
            type="range"
            id={id}
            min={min}
            max={max}
            step={step}
            value={current}
            disabled={disabled}
            aria-valuetext={valueText(current)}
            className="relative min-h-(--size-target) w-full cursor-pointer appearance-none rounded-sm bg-transparent disabled:cursor-not-allowed"
            onChange={(event) => onChange(snap(event.currentTarget.valueAsNumber))}
            onKeyUp={(event) => {
              if (MOVE_KEYS.has(event.key)) onCommit?.(snap(event.currentTarget.valueAsNumber));
            }}
            onPointerDown={(event) => {
              const input = event.currentTarget;
              const figure = input.closest('[data-figure]');
              endDrag.current?.();
              figure?.setAttribute('data-dragging', '');
              const end = () => {
                figure?.removeAttribute('data-dragging');
                window.removeEventListener('pointerup', release);
                window.removeEventListener('pointercancel', end);
                endDrag.current = null;
              };
              const release = () => {
                end();
                onCommit?.(snap(input.valueAsNumber));
              };
              window.addEventListener('pointerup', release);
              window.addEventListener('pointercancel', end);
              endDrag.current = end;
            }}
          />
        </div>
        <label htmlFor={numberId} className="sr-only">
          {numberLabel ?? `${label}, exact value`}
        </label>
        <input
          type="number"
          id={numberId}
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(current)}
          disabled={disabled}
          className="min-h-(--size-target) w-20 rounded-md border border-muted bg-bg px-2 text-sm text-ink disabled:text-muted"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            // A complete, valid entry updates live; anything else waits for blur or Enter.
            const typed = event.currentTarget.valueAsNumber;
            if (Number.isFinite(typed) && snap(typed) === typed && typed !== current) onChange(typed);
          }}
          onBlur={applyDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyDraft();
          }}
        />
        {readout ? (
          <span data-slider-readout="" data-num="" className="min-w-10 text-sm text-muted">
            {readout(current)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
