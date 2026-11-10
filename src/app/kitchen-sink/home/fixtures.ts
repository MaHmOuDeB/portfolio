// The Home host's fixed inputs: the note under the hero and the scroll moment are drawn from
// fictional snapshots, never from the site's store, so the host looks the same on every run. Later
// sections of the Home page join the host here as they are built.
import type { ScrollMomentProps } from '@/components/home/ScrollMoment';
import { FIXTURE_AB, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeModel } from '@/lib/home/model';
import { chartAriaLabel, chartSnapshot, homeChartTable, homeSteps } from '@/lib/home/scroll';
import { STEP_STATES } from './steps/states';

/** The note's model: a calibration that is collecting, seen from group A. */
export function hostNoteModel(): HomeModel {
  return toHomeModel(snapshotFixture('calibration'), 'a');
}

/** The data here is fictional, so every number the scroll moment prints is marked simulated, never live. */
const simulated = (m: HomeModel): HomeModel => ({ ...m, refs: ['simulated'] });

/** The scroll moment on the host pages: the note's state, with simulated refs. */
export function hostScrollModel(): HomeModel {
  return simulated(hostNoteModel());
}

/**
 * An A/B with a look on each of ten days, so the band has an area (the mode fixtures have one look).
 * Group B gets a few more card clicks, so the band moves off zero.
 */
function manyLooks(): HomeModel {
  const rows = Array.from({ length: 10 }, (_, i) => {
    const day = `2026-12-${String(i + 1).padStart(2, '0')}`;
    return { day, a: { entry: 30, inview: 25, engaged: 25, card: 3 }, b: { entry: 30, inview: 25, engaged: 25, card: 5 } };
  });
  return simulated(toHomeModel(buildFixture({ config: FIXTURE_AB, now: '2026-12-12T12:00:00+01:00', rows }), 'b'));
}

/** The scroll-moment page whose live chart fails in the browser (HostHome's `breakChart`). */
export const CHART_ERROR_STATE = 'chart-error';

/**
 * The scroll-moment pages' states: every step state, then the chart geometry cases, then the A/B whose
 * live chart fails after hydration.
 */
export const SCROLL_STATES: readonly { id: string; model: () => HomeModel }[] = [
  ...STEP_STATES,
  { id: 'ab-many-looks', model: manyLooks },
  { id: CHART_ERROR_STATE, model: STEP_STATES.find((s) => s.id === 'ab')!.model },
];

/**
 * The scroll moment's props for a model, as the Home page composes them: the five steps, and for each
 * step the live chart the server sliced for it (null where it has none). The counted-view tick is
 * never allowed on the host: no visit is counted here.
 */
export function scrollMomentProps(model: HomeModel): ScrollMomentProps {
  const steps = homeSteps(model);
  const charts = steps.map(({ step }) => {
    const snapshot = chartSnapshot(model, step);
    return snapshot === null
      ? null
      : { snapshot, table: homeChartTable(snapshot, model.refs), ariaLabel: chartAriaLabel(model, step), tickAllowed: false };
  });
  return { arm: model.arm, steps, charts, refs: model.refs };
}
