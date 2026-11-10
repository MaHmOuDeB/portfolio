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
 * The scroll moment's props for a model, as the Home page composes them: the five steps, and for each
 * step the live chart the server sliced for it (null where it has none). The counted-view tick is not
 * allowed on the host (no visit is counted here) unless a state asks for it: the tick's browser specs
 * then send the counted-view event themselves.
 */
export function scrollMomentProps(model: HomeModel, { tickAllowed = false }: { tickAllowed?: boolean } = {}): ScrollMomentProps {
  const steps = homeSteps(model);
  const charts = steps.map(({ step }) => {
    const snapshot = chartSnapshot(model, step);
    return snapshot === null
      ? null
      : { snapshot, table: homeChartTable(snapshot, model.refs), ariaLabel: chartAriaLabel(model, step), tickAllowed };
  });
  return { arm: model.arm, steps, charts, refs: model.refs };
}

const abModel = () => STEP_STATES.find((s) => s.id === 'ab')!.model();

/**
 * A mechanism state for the canvas cross-fade, never a Home state: the Evidence step's chart, and at the
 * Decision step the same looks drawn as paused (the same table), so the canvas has two layers.
 */
function twoCharts(model: HomeModel): ScrollMomentProps {
  const props = scrollMomentProps(model);
  const evidence = props.charts[2]!;
  const paused = { ...evidence, ariaLabel: undefined, snapshot: { ...evidence.snapshot, freshness: { kind: 'paused' as const, pausedOn: evidence.snapshot.plannedEnd, reason: 'a fictional pause' } } };
  return { ...props, charts: props.charts.map((c, i) => (i === 4 ? paused : c)) };
}

/**
 * The scroll-moment pages' states: every step state, then the chart geometry cases, the A/B whose
 * live chart fails after hydration, the A/B with the visitor tick allowed, and the cross-fade's two
 * layers. `props` composes the moment where the page's default (no tick) does not fit.
 */
export const SCROLL_STATES: readonly { id: string; model: () => HomeModel; props?: (m: HomeModel) => ScrollMomentProps }[] = [
  ...STEP_STATES,
  { id: 'ab-many-looks', model: manyLooks },
  { id: CHART_ERROR_STATE, model: abModel },
  { id: 'ab-tick', model: abModel, props: (m) => scrollMomentProps(m, { tickAllowed: true }) },
  { id: 'ab-two-charts', model: abModel, props: twoCharts },
];
