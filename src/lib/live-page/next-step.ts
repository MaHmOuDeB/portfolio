// The Live test page's next-step sentence: the only producer of it. Pure; it reads the server-only
// model and returns a sentence with its refs, or null.
//
// - A final decision (ship B, stop for harm, inconclusive). Once the stop is confirmed (a stored stop,
//   or the A/B past its planned end, `closedConfirmed`), counting has stopped. A decision derived from
//   the data whose stop is not stored yet may still see the route count for a moment, so it says the
//   result is being confirmed, and that the first decision is final, as the pre-registration says.
// - A failed calibration with a restart date that is set and still ahead: the restart day.
// - A calibration whose checks are ready, with an A/B start date that is set and still ahead: the
//   start day. The A/B never starts by itself, so no start is announced without the date.
// - Every other state, including every state in which counting is open: none.
// A dated sentence holds `{date}` where the day goes; the page prints it as a `<time>`.
import type { DerivedRef } from '@/components/kit/Derived';
import type { LivePageModel } from './model';

export type NextStep = {
  text: string;
  refs: readonly DerivedRef[];
  /** The day `{date}` stands for (ISO with an offset); set only on a dated sentence. */
  date?: string;
};

export const CLOSED_STEP = 'Counting has stopped; later looks change nothing.';
export const CONFIRMING_STEP =
  'The test has reached its decision; the result is being confirmed. The first decision is final, so later looks change nothing.';
export const RESTART_STEP = 'The calibration restarts on {date}.';
export const AB_START_STEP = 'The A/B test starts on {date}.';

/** A configured date that is still ahead of the snapshot's own read time. */
function ahead(iso: string | undefined, readAt: string): iso is string {
  return iso !== undefined && Date.parse(iso) > Date.parse(readAt);
}

export function nextStepFor(model: LivePageModel): NextStep | null {
  const m = model.home;
  if (m.outcome !== null) return { text: m.closedConfirmed ? CLOSED_STEP : CONFIRMING_STEP, refs: m.refs };
  if (m.mode === 'aa-failed') {
    const restartsOn = m.live.aaFailed?.restartsOn;
    return ahead(restartsOn, m.readAt) ? { text: RESTART_STEP, refs: ['build'], date: restartsOn } : null;
  }
  if (m.mode === 'calibration' && m.calibration?.ready === true) {
    const startsOn = m.live.abStartedOn;
    return ahead(startsOn, m.readAt) ? { text: AB_START_STEP, refs: ['build'], date: startsOn } : null;
  }
  return null;
}
