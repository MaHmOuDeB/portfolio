// An entry made in a Figure control before React listened to it. The controls are server-rendered and
// shown from the first paint, so a reader can type in a number input, move a range input or pick a
// radio before the page hydrates (or, in a LoadOnIntent preview, before the island arrives). React 19
// hydrates an input without touching what it holds, and no handler ran, so nothing else knows about
// the entry. The kit's controls read it once they listen (Slider, Segmented, LoadOnIntent): these are
// the pure halves of that, the DOM-free decisions.
import { isOnStepGrid, snapToStep } from './snap';

/** What an input element reports, as far as an entry is concerned. */
export type ControlState = {
  type: string;
  value: string;
  defaultValue: string;
  checked: boolean;
  defaultChecked: boolean;
  step: string;
};

/**
 * True when the control holds something other than what was rendered: React writes the rendered value
 * to `defaultValue` and `defaultChecked`, and a reader's entry changes only `value` or `checked`.
 * A range input counts as moved only by half a step or more, so a rendered value the browser itself
 * rounds onto its grid is never mistaken for an entry.
 */
export function hasEntry(control: ControlState): boolean {
  if (control.type === 'radio' || control.type === 'checkbox') return control.checked !== control.defaultChecked;
  if (control.type === 'range') {
    const moved = Math.abs(Number(control.value) - Number(control.defaultValue));
    const step = Number(control.step);
    if (Number.isNaN(moved)) return false;
    return step > 0 && Number.isFinite(step) ? moved >= step / 2 : moved > 0;
  }
  return control.value !== control.defaultValue;
}

export type Grid = { min: number; max: number; step: number };

/**
 * What a Slider does with text typed in its number input before it listened, as its own handlers
 * would have done:
 * - still focused: keep it as the entry being edited (`draft`), and apply it at once if it is a value
 *   on the grid (`live`, as the input's change handler does), so the next blur or Enter commits it;
 * - focus has left: the blur already happened, so commit the snapped value, or revert an empty or
 *   unreadable entry.
 */
export type EarlyTyped =
  | { kind: 'draft'; text: string; live: number | null }
  | { kind: 'commit'; value: number }
  | { kind: 'revert' };

export function earlyTyped(text: string, focused: boolean, { min, max, step }: Grid): EarlyTyped {
  const typed = text.trim() === '' ? Number.NaN : Number(text);
  if (focused) return { kind: 'draft', text, live: isOnStepGrid(typed, min, max, step) ? snapToStep(typed, min, max, step) : null };
  if (Number.isNaN(typed)) return { kind: 'revert' };
  return { kind: 'commit', value: snapToStep(typed, min, max, step) };
}
