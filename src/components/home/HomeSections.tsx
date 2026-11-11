// The Home page below the site header, in page order at every width: the hero and the note on the
// live test, the featured case studies, the scroll moment and "Tools I've built". One server
// composition for the per-group home page and the test build's host; the page adds the beacon, the
// host does not. Server only: it takes the Home model, which keeps exact counts, and hands each part
// only what it needs. No client component receives the model: the note's island gets its timing,
// the cards the headline group, the scroll moment its steps and server-sliced chart entries.
//
// The headline group is `model.headlineArm`: group A's headlines in the calibration in both groups,
// the assigned group's in the A/B. Each card holds both strings for sizing; only the selected one is
// visible and announced (CaseCard).
//
// The "your view" tick on a chart is allowed (`tickAllowed`) only when no day reached the daily
// ceiling, the test is not held, paused, closed or short of data, and the data is fresh when this
// page is rendered. The beacon's view count is a per-group total of in-view views across the
// namespace, while the chart's looks leave ceiling days out, so after a ceiling day the two cannot be
// put on one axis and no tick is drawn.
import type { ComponentType } from 'react';
import { serverNow } from '@/lib/experiment/clock';
import { serverEnv } from '@/lib/env';
import { liveFigureState } from '@/lib/figure/cs-band';
import { homeFreshnessAt, type HomeModel } from '@/lib/home/model';
import { chartAriaLabel, chartSnapshot, homeChartTable, homeSteps } from '@/lib/home/scroll';
import { FeaturedCases } from './FeaturedCases';
import { Hero } from './Hero';
import { LiveNote } from './LiveNote';
import { ScrollMomentView, type ScrollMomentProps } from './ScrollMoment';
import { ScrollShell, type ScrollShellProps } from './ScrollShell';
import { Tools } from './Tools';

/** Whether the scroll moment's charts may draw the visitor's tick, for a page rendered at `renderedAt`. */
export function homeTickAllowed(model: HomeModel, renderedAt: string): boolean {
  if (model.hasCeilingDay || model.held !== null || model.mode === 'held' || model.mode === 'paused' || model.countingClosed) return false;
  if (liveFigureState(model.live).live?.data !== 'enough-data') return false;
  return homeFreshnessAt(model, renderedAt).kind === 'fresh';
}

/** The scroll moment's props: the five steps, and for each step the chart the server sliced for it (null where none). */
export function homeScrollProps(model: HomeModel, { tickAllowed }: { tickAllowed: boolean }): ScrollMomentProps {
  const steps = homeSteps(model);
  const charts = steps.map(({ step }) => {
    const snapshot = chartSnapshot(model, step);
    return snapshot === null
      ? null
      : { snapshot, table: homeChartTable(snapshot, model.refs), ariaLabel: chartAriaLabel(model, step), tickAllowed };
  });
  return { arm: model.arm, steps, charts, refs: model.refs };
}

type ViewProps = {
  model: HomeModel;
  /** The scroll moment's client half: ScrollShell, or a test build's stand-in. */
  Shell?: ComponentType<ScrollShellProps>;
} & (
  | { /** The render time the tick rule reads. */ renderedAt: string; scroll?: undefined }
  | { /** The test build's own scroll-moment props, in place of the page's. */ scroll: ScrollMomentProps; renderedAt?: undefined }
);

/** The composition with its inputs given: the page passes the render time, the test build may pass its own scroll moment. */
export function HomeSectionsView({ model, Shell = ScrollShell, ...rest }: ViewProps) {
  const scroll = rest.scroll ?? homeScrollProps(model, { tickAllowed: homeTickAllowed(model, rest.renderedAt) });
  // Called as a function so an absent note (before the start) leaves no empty box in the page.
  const note = LiveNote({ model });
  return (
    <>
      <Hero />
      {note !== null ? (
        <div data-home-note="" className="mt-6">
          {note}
        </div>
      ) : null}
      <div className="mt-12 md:mt-section">
        <FeaturedCases headlineArm={model.headlineArm} />
      </div>
      <div className="mt-12 md:mt-section">
        <ScrollMomentView {...scroll} Shell={Shell} />
      </div>
      <div className="mt-12 md:mt-section">
        <Tools />
      </div>
    </>
  );
}

export function HomeSections({ model }: { model: HomeModel }) {
  return <HomeSectionsView model={model} renderedAt={serverNow(serverEnv()).toISOString()} />;
}
