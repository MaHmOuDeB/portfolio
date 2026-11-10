// The Home scroll moment: five steps (heading and a server-rendered body each) and the live chart.
// This is the server half; ScrollShell is the client half that follows the visitor. Server-safe.
// The server sends one markup for both layouts and CSS picks one before the first paint (globals.css,
// from the JavaScript flag on <html>, the reduced-motion setting and the screen size), so nothing is
// restructured or swapped when the page hydrates:
// - the sticky shell: a stage with the chart's canvas and the step navigation, sticky beside the steps
//   from 1024 px wide (at least 520 px tall) and above them below that (at least 600 px tall);
// - the stacked frames: each step with its own chart under its body, as the page reads without
//   JavaScript, with reduced motion and on short screens.
// The inactive layout's parts are display: none, never off-screen. The step bodies are drawn once and
// both layouts use them; only the chart is drawn twice (the canvas and a stacked frame), and one of the
// two is always hidden. Each chart is drawn here, on the server (HomeChartView), and stays that drawing
// until ScrollShell has loaded the chart's code.
// When the kit draws a chart, one chart Figure frames the moment: its title above the steps, its
// caption, badge and table after the last step, never in the canvas. Its one table serves both layouts.
// Without a kit chart (counts printed as "<5", a placeholder, a failed check, a stopped test with no
// look) there is no stage, and the steps are always stacked: each body carries its own visual.
// The Figure's own error boundary wraps the whole shell, and its fallback preview would be its client
// children: if anything in the shell outside a chart's own boundary threw in the browser, the fallback
// would replace all five steps. Accepted: the step bodies are server output and each chart has its own
// boundary, so nothing in the shell is known to throw there.
// The title is a level-2 heading, so the steps' h3 headings and their diagrams' h4 titles nest under
// it rather than under the last case-study card.
// This receives no Home model: only the group, the steps, the chart entries the server sliced
// (`chartSnapshot`, `homeChartTable`, `chartAriaLabel` in src/lib/home/scroll.tsx, with `tickAllowed`)
// and the refs.
import type { ComponentType, ReactNode } from 'react';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { EXPERIMENT, type Arm } from '@/experiment.values';
import { confidenceModel, liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import { MIN_PER_GROUP, resolveFigureBody } from '@/lib/figure/states';
import type { HomeStep } from '@/lib/home/scroll';
import { HomeChartPreview } from './HomeChartView';
import { ScrollShell, type ScrollShellProps, type ShellChart } from './ScrollShell';

export type ScrollChart = {
  snapshot: LiveSnapshot;
  table: TableData;
  ariaLabel?: string;
  /** Whether this page may draw the visitor's "your view" tick on this chart (set by the server, no default). */
  tickAllowed: boolean;
};

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

/** The one chart the Figure frames. Every entry must print the same table, or one Figure would misdescribe another. */
function framedChart(charts: ScrollMomentProps['charts']): ScrollChart | null {
  const drawn = charts.filter((c): c is ScrollChart => c !== null);
  const first = drawn[0] ?? null;
  if (first && drawn.some((c) => JSON.stringify(c.table) !== JSON.stringify(first.table))) {
    throw new TypeError('the scroll moment frames its charts in one Figure with one table; every chart entry must carry that table');
  }
  return first;
}

/**
 * Where the visitor's "your view" tick may start: the views per group of the last look drawn, or null
 * for no tick. Only where the server allowed it, and only on a chart that runs on enough data: fresh
 * (not stale, not paused, so never held or closed), in the calibration or the A/B (a decided test
 * counts no more views; a withheld result draws nothing), and with every count it prints at least 50.
 */
export function tickFrom(chart: ScrollChart): number | null {
  if (chart.tickAllowed !== true) return null;
  const s = chart.snapshot;
  const state = liveFigureState(s);
  const body = resolveFigureBody(state);
  if (state.live?.data !== 'enough-data' || s.freshness.kind !== 'fresh' || (body !== 'calibration' && body !== 'ab')) return null;
  const counts = [s.nA, s.nB, ...s.series.flatMap((p) => [p.nA, p.nB])];
  if (!counts.every((n) => Number.isFinite(n) && n >= MIN_PER_GROUP)) return null;
  return confidenceModel(s)?.current.n ?? null;
}

/** The step's own chart, else the nearest earlier one, else the nearest later one (an entry index), or -1. */
function canvasEntry(charts: ScrollMomentProps['charts'], step: number): number {
  const i = step - 1;
  const order = [i, ...Array.from({ length: i }, (_, k) => i - 1 - k), ...Array.from({ length: charts.length - i - 1 }, (_, k) => i + 1 + k)];
  return order.find((k) => charts[k] != null) ?? -1;
}

/** The canvas layers (one per distinct chart; equal entries share the first's layer) and the layer of each step. */
function canvasPlan(charts: ScrollMomentProps['charts']): { layers: number[]; byStep: number[] } {
  const key = (c: ScrollChart) => JSON.stringify([c.snapshot, c.ariaLabel ?? null]);
  const owner = new Map<string, number>();
  const layerOf = charts.map((c, i) => {
    if (c === null) return -1;
    const k = key(c);
    if (!owner.has(k)) owner.set(k, i);
    return owner.get(k)!;
  });
  const byStep = charts.map((_, i) => {
    const entry = canvasEntry(charts, i + 1);
    return entry < 0 ? -1 : layerOf[entry]!;
  });
  return { layers: [...new Set(layerOf.filter((l) => l >= 0))], byStep };
}

/** The scroll moment with a given client half: ScrollShell, or a test build's stand-in. */
export function ScrollMomentView({ arm, steps, charts, refs, Shell }: ScrollMomentProps & { Shell: ComponentType<ScrollShellProps> }) {
  const framed = framedChart(charts);
  const plan = framed ? canvasPlan(charts) : null;
  const shellCharts: (ShellChart | null)[] = charts.map((c) =>
    c === null ? null : { snapshot: c.snapshot, table: c.table, ariaLabel: c.ariaLabel, tickFrom: tickFrom(c) },
  );
  const preview = (i: number, where: 'canvas' | 'frame') => {
    const c = charts[i];
    return c ? <HomeChartPreview id={`home-chart-${where}-${i + 1}`} snapshot={c.snapshot} refs={refs} ariaLabel={c.ariaLabel} /> : null;
  };
  const shell = (
    <Shell
      arm={arm}
      steps={steps}
      charts={shellCharts}
      previews={{
        canvas: charts.map((_, i) => (plan?.layers.includes(i) ? preview(i, 'canvas') : null)),
        frames: charts.map((_, i) => preview(i, 'frame')),
      }}
      canvas={plan}
      refs={refs}
    />
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

export function ScrollMoment(props: ScrollMomentProps) {
  return <ScrollMomentView {...props} Shell={ScrollShell} />;
}
