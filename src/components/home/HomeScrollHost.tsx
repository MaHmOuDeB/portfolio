// The test build's Home host only: the Home composition with the scroll moment placed after the
// tiles. The real Home page no longer shows the scroll moment; this file keeps the host and its
// states (the five steps, the "your view" tick rule) renderable until they are removed. Server only.
import type { ComponentType } from 'react';
import { liveFigureState } from '@/lib/figure/cs-band';
import { homeFreshnessAt, type HomeModel } from '@/lib/home/model';
import { chartAriaLabel, chartSnapshot, homeChartTable, homeSteps } from '@/lib/home/scroll';
import { HomeBody } from './HomeSections';
import { ScrollMomentView, type ScrollMomentProps } from './ScrollMoment';
import { ScrollShell, type ScrollShellProps } from './ScrollShell';

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

/** The host's composition with its inputs given. */
export function HomeSectionsView({ model, Shell = ScrollShell, ...rest }: ViewProps) {
  const scroll = rest.scroll ?? homeScrollProps(model, { tickAllowed: homeTickAllowed(model, rest.renderedAt) });
  return (
    <HomeBody
      model={model}
      extra={
        <div className="mt-12 md:mt-section">
          <ScrollMomentView {...scroll} Shell={Shell} />
        </div>
      }
    />
  );
}
