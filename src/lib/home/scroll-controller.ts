// The Home scroll moment's interaction, as pure parts the client shell (components/home/ScrollShell)
// wires to the page. Client-safe: types only from the model, the chart data and the experiment.
//
// - The controller joins the two sources of the current step. The step navigation sets the step at
//   once, then asks for the scroll to it; while that scroll runs the step observer is ignored, until
//   the scroll settles (scrollend) or, where no scrollend comes, a fallback time has passed. Only the
//   navigation scrolls: the observer only ever sets the step.
// - The trigger band is the thin band the observer watches: 45% to 50% down the screen when the stage
//   sits beside the steps, and the same band of the part of the screen the stage leaves visible when
//   it sits above them (on a phone the stage covers the top of the screen, so a band 45% down the
//   whole screen would find a step behind it).
// - The counted-view event gives the views per group when this visitor's view was counted. Only this
//   page's group and a finite, positive count are taken.
// - The "your view" tick is drawn only from where the server allows it (`tickFrom` in ScrollMoment:
//   a running chart with enough data, the tick allowed) and never before the last look drawn.
import type { Arm } from '@/experiment.values';
import type { LiveSnapshot } from '@/lib/figure/cs-band';

/** How long the observer is ignored after a step-navigation scroll when the browser sends no scrollend. */
export const SETTLE_FALLBACK_MS = 1000;

/** The trigger band beside the stage: 45% to 50% down the screen. */
export const BAND = '-45% 0px -50% 0px';
const BAND_TOP = 0.45;
const BAND_BOTTOM = 0.5;

export type ScrollController = {
  /** The step navigation asked for `step`: set it now, then scroll to it (instantly under reduced motion). */
  fromNav(step: number, instant: boolean): void;
  /** The step in the trigger band; ignored while a navigation scroll runs. */
  fromObserver(step: number): void;
  /** The navigation's scroll has ended. */
  settled(): void;
  /** Clears the timer; every later call does nothing. */
  dispose(): void;
};

const isStep = (step: number) => Number.isInteger(step) && step >= 1;

export function createScrollController({
  setCurrent,
  scrollTo,
}: {
  setCurrent: (step: number) => void;
  scrollTo: (step: number, instant: boolean) => void;
}): ScrollController {
  // Set while a navigation scroll runs: the observer is ignored until it is cleared.
  let pending: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  const release = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };
  return {
    fromNav(step, instant) {
      if (disposed || !isStep(step)) return;
      release();
      pending = setTimeout(() => {
        pending = null;
      }, SETTLE_FALLBACK_MS);
      setCurrent(step);
      scrollTo(step, instant);
    },
    fromObserver(step) {
      if (disposed || pending !== null || !isStep(step)) return;
      setCurrent(step);
    },
    settled() {
      release();
    },
    dispose() {
      disposed = true;
      release();
    },
  };
}

/** Where the stage is: beside the steps, or above them and stuck with its bottom edge `stuckBottom` px down. */
export type StageLayout = { kind: 'beside' } | { kind: 'above'; stuckBottom: number };

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** The observer's rootMargin for the trigger band, on a screen `viewportHeight` px tall. Never empty. */
export function bandMargin(layout: StageLayout, viewportHeight: number): string {
  if (layout.kind === 'beside') return BAND;
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 1 ? viewportHeight : 1;
  const under = Number.isFinite(layout.stuckBottom) ? Math.min(vh, Math.max(0, layout.stuckBottom)) : 0;
  const room = vh - under;
  let top = under + BAND_TOP * room;
  let bottom = under + BAND_BOTTOM * room;
  if (bottom - top < 1) {
    // No room under the stage: the last pixel of the screen, so the band still exists.
    bottom = vh;
    top = vh - 1;
  }
  return `-${px(top)} 0px -${px(vh - bottom)} 0px`;
}

/** The views per group of a counted view of `arm`, or null: another group, or a count that is not finite and positive. */
export function acceptedViewN(detail: unknown, arm: Arm): number | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { arm: counted, viewN } = detail as { arm?: unknown; viewN?: unknown };
  if (counted !== arm || typeof viewN !== 'number' || !Number.isFinite(viewN) || viewN <= 0) return null;
  return viewN;
}

/**
 * The snapshot the chart draws: with `yourViewN` only when the server let the tick start (`from`) and
 * the count is at or past it; otherwise the very same snapshot, with no views key at all. The counts
 * are never changed.
 */
export function withYourView(snapshot: LiveSnapshot, from: number | null, viewN: number | null): LiveSnapshot {
  if (from === null || viewN === null || viewN < from) return snapshot;
  return { ...snapshot, yourViewN: viewN };
}
