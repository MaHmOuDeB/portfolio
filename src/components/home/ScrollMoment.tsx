'use client';

// The Home scroll moment: five steps (heading and a server-rendered body each) and the live chart.
// The server sends one markup for both layouts and CSS picks one before the first paint (globals.css,
// from the JavaScript flag on <html>, the reduced-motion setting and the screen size), so nothing is
// restructured or swapped when the page hydrates:
// - the sticky shell: a stage with the chart's canvas and the step navigation, sticky beside the steps
//   from 1024 px wide (at least 520 px tall) and above them below that (at least 600 px tall);
// - the stacked frames: each step with its own chart under its body, as the page reads without
//   JavaScript, with reduced motion and on short screens.
// The inactive layout's parts are display: none, never off-screen. The step bodies are drawn once and
// both layouts use them; only the chart is drawn twice (the canvas and a stacked frame), and one of the
// two is always hidden.
// When the kit draws a chart, one chart Figure frames the moment: its title above the steps, its
// caption, badge and table after the last step, never in the canvas. Its one table serves both layouts.
// Without a kit chart (counts printed as "<5", a placeholder, a failed check, a stopped test with no
// look) there is no stage, and the steps are always stacked: each body carries its own visual.
// The Figure's own error boundary wraps the whole shell, and its fallback preview would be these
// client children: if anything in the shell outside a chart's own boundary threw in the browser, the
// fallback would replace all five steps. Accepted: the step bodies are server output and each HomeChart
// has its own boundary, so nothing in the shell is known to throw there.
// The title is a level-2 heading, so the steps' h3 headings and their diagrams' h4 titles nest under
// it rather than under the last case-study card.
// This receives no Home model: only the steps, the chart entries the server sliced (`chartSnapshot`,
// `homeChartTable`, `chartAriaLabel` in src/lib/home/scroll.tsx) and the refs. The step shown first is
// the first; the step navigation moves it, and nothing scrolls on its own.
import { useState, type ReactNode } from 'react';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { StepNav } from '@/components/kit/StepNav';
import { EXPERIMENT, type Arm } from '@/experiment.values';
import { liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import { normalizeSteps } from '@/lib/figure/steps';
import type { HomeStep } from '@/lib/home/scroll';
import { HomeChart } from './HomeChart';

export type ScrollChart = { snapshot: LiveSnapshot; table: TableData; ariaLabel?: string; tickAllowed: boolean };

export type ScrollMomentProps = {
  /** The group this view was assigned to (used by the counted-view tick). */
  arm: Arm;
  steps: readonly { step: HomeStep; heading: string; body: ReactNode }[];
  /** One entry per step, null where the step has no live chart. */
  charts: readonly (null | ScrollChart)[];
  refs: readonly DerivedRef[];
};

const BUILD: readonly DerivedRef[] = ['build'];
const FIGURE_ID = 'home-chart';

/** The chart the canvas shows for a step: its own, else the nearest earlier one, else the nearest later one. */
function canvasChart(charts: ScrollMomentProps['charts'], current: number): ScrollChart | null {
  const i = current - 1;
  const drawn = (c: ScrollChart | null | undefined): c is ScrollChart => c != null;
  return [charts[i], ...charts.slice(0, Math.max(0, i)).reverse(), ...charts.slice(i + 1)].find(drawn) ?? null;
}

/** The one chart the Figure frames. Every entry must print the same table, or one Figure would misdescribe another. */
function framedChart(charts: ScrollMomentProps['charts']): ScrollChart | null {
  const drawn = charts.filter((c): c is ScrollChart => c !== null);
  const first = drawn[0] ?? null;
  if (first && drawn.some((c) => JSON.stringify(c.table) !== JSON.stringify(first.table))) {
    throw new TypeError('the scroll moment frames its charts in one Figure with one table; every chart entry must carry that table');
  }
  return first;
}

export function ScrollMoment({ steps, charts, refs }: ScrollMomentProps) {
  const [current, setCurrent] = useState(1);
  const framed = framedChart(charts);
  const onCanvas = canvasChart(charts, current);
  const at = (step: number) => normalizeSteps(step, steps.length).current;

  const shell = (
    <div data-scroll-shell="">
      {framed && onCanvas ? (
        <div data-scroll-stage="" className="bg-bg pt-3">
          <div id="home-canvas" data-scroll-canvas="">
            <HomeChart snapshot={onCanvas.snapshot} table={onCanvas.table} refs={refs} ariaLabel={onCanvas.ariaLabel} />
          </div>
          <div className="mt-3 pb-3">
            <StepNav current={current} total={steps.length} onChange={(next) => setCurrent(at(next))} label="Steps of the live test" refs={BUILD} />
          </div>
        </div>
      ) : null}
      <ol data-scroll-steps="" className="grid gap-12">
        {steps.map((s, i) => {
          const chart = charts[i] ?? null;
          return (
            <li key={s.step} id={`home-step-${s.step}`} data-scroll-step={s.step} aria-current={s.step === current ? 'step' : undefined}>
              <h3 className="text-xl font-semibold">{s.heading}</h3>
              <div className="mt-3">{s.body}</div>
              {chart ? (
                <div id={`home-frame-${s.step}`} data-stacked-frame={s.step} className="mt-6">
                  <HomeChart snapshot={chart.snapshot} table={chart.table} refs={refs} ariaLabel={chart.ariaLabel} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <div data-scroll-moment={framed ? 'sticky' : 'stacked'}>
      {framed ? (
        <Figure
          id={FIGURE_ID}
          titleLevel={2}
          title="The difference between the groups."
          caption={
            <>
              When a band is shown, it is the <Derived value={1 - EXPERIMENT.alpha} unit="share" refs={BUILD} /> confidence sequence of
              B − A in percentage points, narrowed at each look and never widened.
            </>
          }
          provenance={refs.includes('live') ? 'live' : 'simulated'}
          state={liveFigureState(framed.snapshot)}
          table={framed.table}
        >
          {shell}
        </Figure>
      ) : (
        shell
      )}
    </div>
  );
}
