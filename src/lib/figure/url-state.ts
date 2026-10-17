// URL state for Figures. A page can hold several Figures, so every key is namespaced by the
// Figure's id: `?peeking.looks=20&peeking.preset=interview`. Pure functions, no DOM: the client
// hook (components/kit/useFigureParams) reads and writes through them.
//
// A shared or stale URL is untrusted. Reading never throws: a number that does not parse, or an
// enum value that is not an option, falls back to the preset; other numbers are clamped and
// snapped; a repeated key uses the first; an unknown preset gives `default`. Keys of other
// Figures are never read or changed.
import { snapToStep } from './snap';

export type ParamSpec =
  | { kind: 'number'; min: number; max: number; step: number }
  | { kind: 'enum'; values: readonly string[] };
export type ParamSchema = Record<string, ParamSpec>;
export type ParamValues<S extends ParamSchema> = {
  [K in keyof S]: S[K] extends { kind: 'enum'; values: readonly (infer V)[] } ? V : number;
};
export type Presets<S extends ParamSchema> = { default: ParamValues<S> } & Record<string, ParamValues<S>>;

/** How long the URL waits after the last change, so a slider drag does not write on every step. */
export const URL_DEBOUNCE_MS = 250;

const DEFAULT_PRESET = 'default';
const FIGURE_ID = /^[a-z][a-z0-9-]*$/;

/** Throws on an id that would break the namespace (a dot, a capital): a programmer error. */
export function assertFigureId(id: string): void {
  if (!FIGURE_ID.test(id)) throw new Error(`Figure id "${id}" must match ${FIGURE_ID}`);
}

const keyOf = (id: string, param: string) => `${id}.${param}`;
const isOwnKey = (id: string, key: string) => key.startsWith(`${id}.`);

function readValue(spec: ParamSpec, raw: string | null, fallback: number | string): number | string {
  if (raw === null) return fallback;
  if (spec.kind === 'enum') return spec.values.includes(raw) ? raw : fallback;
  // Number('') and Number('  ') are 0, not a value anyone wrote, so blank falls back too.
  const parsed = raw.trim() === '' ? Number.NaN : Number(raw);
  return Number.isNaN(parsed) ? fallback : snapToStep(parsed, spec.min, spec.max, spec.step);
}

export function readFigureParams<S extends ParamSchema>(
  search: URLSearchParams,
  id: string,
  schema: S,
  presets: Presets<S>,
): { values: ParamValues<S>; preset: string } {
  assertFigureId(id);
  const asked = search.get(keyOf(id, 'preset'));
  // Own properties only: `?demo.preset=toString` must not reach Object.prototype.
  const preset = asked !== null && Object.hasOwn(presets, asked) ? asked : DEFAULT_PRESET;
  const base = presets[preset] as Record<string, number | string>;
  const values: Record<string, number | string> = {};
  for (const param of Object.keys(schema)) {
    values[param] = readValue(schema[param]!, search.get(keyOf(id, param)), base[param]!);
  }
  return { values: values as ParamValues<S>, preset };
}

/** Sets every key of this Figure (keeping `${id}.preset`) on a copy of `search`. */
export function writeFigureParams<S extends ParamSchema>(
  search: URLSearchParams,
  id: string,
  values: ParamValues<S>,
): URLSearchParams {
  assertFigureId(id);
  const next = new URLSearchParams(search);
  for (const [param, value] of Object.entries(values)) next.set(keyOf(id, param), String(value));
  return next;
}

/**
 * Removes every key of this Figure from a copy of `search`, except `${id}.preset` when the page
 * loaded with a preset other than `default`: Reset restores that preset, and the URL says so.
 */
export function resetFigureParams(search: URLSearchParams, id: string, preset: string): URLSearchParams {
  assertFigureId(id);
  const presetKey = keyOf(id, 'preset');
  const next = new URLSearchParams(search);
  for (const key of new Set(next.keys())) {
    if (isOwnKey(id, key) && key !== presetKey) next.delete(key);
  }
  // `set` keeps the key where it was and drops repeats.
  if (preset === DEFAULT_PRESET) next.delete(presetKey);
  else next.set(presetKey, preset);
  return next;
}
