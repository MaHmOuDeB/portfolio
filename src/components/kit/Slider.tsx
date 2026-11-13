'use client';

// A native range input joined to a number input. The range input is the interactive element; the
// track under it is drawn, not native. Every value is snapped, so a hostile value from a prop or a
// typed entry is clamped and never throws. Hidden without JavaScript: the server renders the preset.
//
// An entry made before the Slider listened is taken up once it does (see takeEarlyEntry below): the
// inputs show from the first paint, so a reader can type or move the range before the page hydrates.
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { cx } from '@/lib/cx';
import { earlyTyped, hasEntry } from '@/lib/figure/early-entry';
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
  /**
   * Pointer up, key up, number-input blur: when to announce the result. A key that moved the value
   * and is still held when focus leaves (its key-up lands elsewhere) commits on that blur. One
   * gesture can commit the same value twice (that blur, then the key-up landing on the other input),
   * so a commit of an unchanged value must be harmless.
   */
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
// The root of a LoadOnIntent whose island has not replaced its preview yet.
const IDLE_ISLAND = '[data-island="idle"]';

/**
 * The input holding an entry made before this Slider listened: `own` itself (hydrated with what the
 * reader typed or moved), or else the input with the same id in the LoadOnIntent preview that this
 * Slider's island is replacing. In the commit where an island appears, its preview is still in the
 * document (the loader removes it in the next one), so the copy can be read then.
 */
function earlySource(own: HTMLInputElement): HTMLInputElement | null {
  if (hasEntry(own)) return own;
  const root = own.closest(IDLE_ISLAND);
  if (root === null) return null;
  for (const copy of root.querySelectorAll(`[id="${CSS.escape(own.id)}"]`)) {
    if (copy !== own && copy instanceof HTMLInputElement && hasEntry(copy)) return copy;
  }
  return null;
}

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
  // The value the last arrow key in the number input stepped to, committed when the key is up. If
  // focus leaves first, the blur commits it, then forgets it. It is also forgotten, uncommitted,
  // whenever something else takes over before that key-up (an entry is typed, a composition starts,
  // or the next arrow key-down is not taken over), so a later key-up or blur never commits an old
  // value.
  const stepped = useRef<number | null>(null);
  // A move key is down on the range input and its key-up has not come: blur commits the value then.
  const rangeHeld = useRef(false);
  const rangeRef = useRef<HTMLInputElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => endDrag.current?.(), []);

  // An entry the reader made before this Slider listened: typed in the number input, or a move of
  // the range input. React 19 hydrates an input without touching what it holds and no handler ran, so
  // without this the input would keep showing the entry (say "999", unclamped) while the value, the
  // chart and the URL stayed where they were. Read once, in the commit where the Slider first
  // appears, so that no later render has reset the input first:
  // - In a LoadOnIntent preview, the entry is left where it is: the loader takes it as intent and
  //   loads the island, whose Slider (the same id) takes it over.
  // - A typed entry is handled as the number input's own handlers would have: still focused, it
  //   stays the entry being edited (applied at once if it is on the grid) and the next blur or Enter
  //   commits it; with focus gone, it is committed as a blur commits it, clamped and snapped, or
  //   reverted if it is empty. A typed entry wins over a range move made before it.
  // - A range move is applied and committed, as its key-up or pointer-up would have.
  // Inputs of this Slider that held the entry are first set back to what was rendered; when the value
  // changes, React writes the new one. Nothing moves without the reader's own action.
  const takeEarlyEntry = useEffectEvent(() => {
    const range = rangeRef.current;
    const number = numberRef.current;
    if (range === null || number === null || disabled) return;
    const typed = earlySource(number);
    const moved = typed === null ? earlySource(range) : null;
    const source = typed ?? moved;
    if (source === null) return;
    // The entry is in this Slider's own inputs (hydrated in place), not in a preview copy.
    const own = source === number || source === range;
    if (own && source.closest(IDLE_ISLAND) !== null) return;
    // Read before the range input is set back below.
    const movedTo = moved === null ? current : snap(moved.valueAsNumber);
    if (own) range.value = String(current);
    if (typed !== null) {
      const entry = earlyTyped(typed.value, typed.ownerDocument.activeElement === typed, { min, max, step });
      if (entry.kind === 'draft') {
        stepped.current = null;
        setDraft(entry.text);
        if (entry.live !== null && entry.live !== current) onChange(entry.live);
        return;
      }
      if (own) number.value = shown;
      if (entry.kind === 'revert') return;
      if (entry.value !== current) onChange(entry.value);
      onCommit?.(entry.value);
      return;
    }
    if (movedTo !== current) onChange(movedTo);
    onCommit?.(movedTo);
  });
  useLayoutEffect(() => {
    takeEarlyEntry();
  }, []);

  const share = max > min ? (current - min) / (max - min) : 0;
  // The thumb's centre runs from half a thumb to the far end minus half a thumb.
  const fill = { width: `calc(var(--spacing) * 2.5 + (100% - var(--spacing) * 5) * ${share})` } as CSSProperties;

  /** Applies and commits a typed entry; true when it committed one. */
  const applyDraft = (): boolean => {
    if (draft === null) return false;
    setDraft(null);
    const typed = draft.trim() === '' ? Number.NaN : Number(draft);
    if (Number.isNaN(typed)) return false; // an empty or unreadable entry reverts to the current value
    const next = snap(typed);
    if (next !== current) onChange(next);
    onCommit?.(next);
    return true;
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
            ref={rangeRef}
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
            onKeyDown={(event) => {
              if (MOVE_KEYS.has(event.key)) rangeHeld.current = true;
            }}
            onKeyUp={(event) => {
              if (!MOVE_KEYS.has(event.key)) return;
              rangeHeld.current = false;
              onCommit?.(snap(event.currentTarget.valueAsNumber));
            }}
            onBlur={(event) => {
              // Focus left while a move key was held: the value it moved to is shown, so commit it.
              if (!rangeHeld.current) return;
              rangeHeld.current = false;
              onCommit?.(snap(event.currentTarget.valueAsNumber));
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
          ref={numberRef}
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
            // An entry replaces a step whose key-up never came: only the entry is committed from here.
            stepped.current = null;
            setDraft(event.currentTarget.value);
            // A complete entry on the step grid (as the browser prints it, or as the spinner steps to
            // it) updates live; anything else waits for blur or Enter.
            const typed = event.currentTarget.valueAsNumber;
            if (!isOnStepGrid(typed, min, max, step)) return;
            const next = snap(typed);
            if (next !== current) onChange(next);
          }}
          onBlur={() => {
            const held = stepped.current;
            stepped.current = null;
            // A typed entry commits itself; otherwise a step whose key-up never came commits here.
            if (!applyDraft() && held !== null) onCommit?.(held);
          }}
          onCompositionStart={() => {
            stepped.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyDraft();
            const dir = NUMBER_STEP_KEYS.get(event.key);
            if (dir) stepped.current = null;
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
