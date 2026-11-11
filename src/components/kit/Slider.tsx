'use client';

// A native range input joined to a number input. The range input is the interactive element; the
// track under it is drawn, not native. Every value is snapped, so a hostile value from a prop or a
// typed entry is clamped and never throws. Hidden without JavaScript: the server renders the preset.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { cx } from '@/lib/cx';
import { isOnStepGrid, snapToStep, stepFrom } from '@/lib/figure/snap';

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
  /**
   * The number input's text for a value, display only, such as "17.2" for 17.2413793103448; what is
   * typed is still read as a number. It must be text a number input holds (digits, one ".", a
   * leading "-", an exponent: never "1,353", "−5" or "17%"); anything else shows the plain value.
   * Default: the plain value, `String(value)`.
   *
   * A rounded text is off the step grid, which the browser counts as a step mismatch and exposes to
   * screen readers as invalid; while it is shown, the input states aria-invalid="false" (a typed
   * entry keeps the browser's own state). The arrow keys step from the value, not the text, but the
   * spin buttons are the browser's own: their first click toward the value (up from "17.2", which is
   * below 17.24, or down from a text above the value) lands on the value itself, so nothing moves
   * and the input shows the plain digits until it loses focus; the next click steps. A click away
   * from the value steps at once.
   */
  numberText?: (value: number) => string;
  /** Accessible name of the number input; default `${label}, exact value`. */
  numberLabel?: string;
  /** Where the value comes from, for data-derived on the root: it covers the numbers in aria-valuetext. */
  refs: readonly DerivedRef[];
  disabled?: boolean;
};

// The keys a range input moves on; releasing one commits the value.
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
// The keys that step the number input, with their direction.
const NUMBER_STEP_KEYS: ReadonlyMap<string, 1 | -1> = new Map([['ArrowUp', 1], ['ArrowDown', -1]]);
// A valid floating-point number in HTML: the only text a number input holds.
const NUMBER_TEXT = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;

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
  numberText,
  numberLabel,
  refs,
  disabled,
}: SliderProps) {
  const snap = (v: number) => snapToStep(v, min, max, step);
  const current = snap(value);
  const numberId = `${id}-exact`;
  const formatted = numberText?.(current);
  const shown = formatted !== undefined && NUMBER_TEXT.test(formatted) ? formatted : String(current);
  // The number input's text while it is being edited; null shows the current value.
  const [draft, setDraft] = useState<string | null>(null);
  // A shown text other than the plain value is a rounding of a value on the grid: valid.
  const formattedShown = draft === null && shown !== String(current);
  const endDrag = useRef<(() => void) | null>(null);
  // The value the last arrow key in the number input stepped to, committed when the key is up.
  const stepped = useRef<number | null>(null);
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
          value={draft ?? shown}
          aria-invalid={formattedShown ? false : undefined}
          disabled={disabled}
          className="min-h-(--size-target) w-20 rounded-md border border-muted bg-bg px-2 text-sm text-ink disabled:text-muted"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            // A complete entry on the step grid (as the browser prints it, or as the spinner steps to
            // it) updates live; anything else waits for blur or Enter.
            const typed = event.currentTarget.valueAsNumber;
            if (!isOnStepGrid(typed, min, max, step)) return;
            const next = snap(typed);
            if (next !== current) onChange(next);
          }}
          onBlur={applyDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyDraft();
            const dir = NUMBER_STEP_KEYS.get(event.key);
            // A step that is not positive and finite is left to the browser.
            // A key that is part of an IME composition chooses a candidate, so it is never taken over.
            if (!dir || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || !(step > 0 && Number.isFinite(step))) return;
            // The arrow keys step on the grid here, not natively: from a shown text such as "17.2",
            // or a value the browser rounds differently, the native first step only lands back on
            // the current value. A typed entry steps from what was typed, as natively.
            event.preventDefault();
            const typed = draft === null || draft.trim() === '' ? Number.NaN : Number(draft);
            const next = stepFrom(Number.isNaN(typed) ? current : typed, dir, min, max, step);
            setDraft(null);
            stepped.current = next;
            if (next !== current) onChange(next);
          }}
          onKeyUp={(event) => {
            if (!NUMBER_STEP_KEYS.has(event.key) || event.nativeEvent.isComposing) return;
            // The value just stepped to, not the last render's, so a caller that defers its value
            // still commits what the key chose.
            onCommit?.(stepped.current ?? current);
            stepped.current = null;
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
