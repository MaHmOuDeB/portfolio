// The states a Figure can be in. Every Figure has the runtime axis; a live Figure also has a phase,
// an amount of data and a freshness. Several axes can apply at once, and one of them sets what the
// Figure's body shows. Pure, no DOM: the Figure, the live bodies and the kitchen sink all use it.
//
// Order of precedence (the first that applies sets the body; the others still show their labels,
// such as the badge, the timestamp and the counts):
//   1. runtime `error`
//   2. freshness `paused`
//   3. phase `srm-suppressed`
//   4. phase `aa-failed`
//   5. an outcome: phase `ship-b`, `stop-for-harm` or `inconclusive`
//   6. `low-data`
//   7. the phase's normal view: `calibration` or `ab`. `before-data` always has low data; with
//      enough data it cannot occur and resolves to `low-data` too.
// Runtime `no-js` and freshness `stale` are modifiers: they never set the body.

/** Forced runtimes, for the kitchen sink and tests. `interacting` is live: data-dragging and focus. */
export type FigureRuntime = 'default' | 'no-js' | 'error';
export type LivePhase =
  | 'before-data'
  | 'calibration'
  | 'aa-failed'
  | 'ab'
  | 'inconclusive'
  | 'ship-b'
  | 'stop-for-harm'
  | 'srm-suppressed';
export type DataAmount = 'low-data' | 'enough-data';
export type Freshness =
  | { kind: 'fresh' }
  | { kind: 'stale'; updatedAt: string; renderedAt: string }
  | { kind: 'paused'; pausedOn: string; reason: string };
export type LiveAxes = { phase: LivePhase; data: DataAmount; freshness: Freshness };
export type FigureState = { runtime?: FigureRuntime; live?: LiveAxes };
export type FigureBody =
  | 'default'
  | 'error'
  | 'paused'
  | 'srm-suppressed'
  | 'aa-failed'
  | 'ship-b'
  | 'stop-for-harm'
  | 'inconclusive'
  | 'low-data'
  | 'calibration'
  | 'ab';

/** Views the smaller group needs before an estimate is shown. */
export const MIN_PER_GROUP = 50;

export const LIVE_PHASES: readonly LivePhase[] = [
  'before-data',
  'calibration',
  'aa-failed',
  'ab',
  'inconclusive',
  'ship-b',
  'stop-for-harm',
  'srm-suppressed',
];
export const DATA_AMOUNTS: readonly DataAmount[] = ['low-data', 'enough-data'];
export const RUNTIMES: readonly FigureRuntime[] = ['default', 'no-js', 'error'];

/**
 * `enough-data` once the smaller group has MIN_PER_GROUP views. A count that is not a number
 * (NaN from a broken store) reads as low data: the Figure then shows counts, never an estimate.
 */
export function dataAmount(nA: number, nB: number): DataAmount {
  return Math.min(nA, nB) >= MIN_PER_GROUP ? 'enough-data' : 'low-data';
}

/** The body a Figure shows, by the order of precedence above. */
export function resolveFigureBody(s: FigureState): FigureBody {
  if (s.runtime === 'error') return 'error';
  const live = s.live;
  if (live === undefined) return 'default';
  if (live.freshness.kind === 'paused') return 'paused';
  switch (live.phase) {
    case 'srm-suppressed':
    case 'aa-failed':
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return live.phase;
    case 'before-data':
      return 'low-data';
    case 'calibration':
    case 'ab':
      return live.data === 'low-data' ? 'low-data' : live.phase;
    default: {
      const unreachable: never = live.phase;
      throw new TypeError(`unknown live phase ${String(unreachable)}`);
    }
  }
}
