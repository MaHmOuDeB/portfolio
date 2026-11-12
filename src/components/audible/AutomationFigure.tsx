// The test-account automation Figure (`setup-time`, static): the setup time per test account before
// and with the tool, as two bars. The two times are the approximate figures I reported, printed as
// Facts in the title and the table; the bars and the axis are a reconstruction drawn from them, not
// measured data, so the Figure is badged "Simulated" and its caption says so.
//
// Refs: the table's cells carry the two profile facts (reported figures); the axis ticks carry
// `simulated` (the reconstructed scale). Server-only, no hooks.
import { ChartFrame, MARK_UNITS, type PlotContext } from '@/components/kit/ChartFrame';
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Figure } from '@/components/kit/Figure';
import { getFact, type FactId } from '@/lib/facts';
import { formatNumber } from '@/lib/figure/format';
import type { FigureState } from '@/lib/figure/states';

export const AUTOMATION_ID = 'setup-time';

const REPORTED: readonly DerivedRef[] = ['profile.audible.setup_minutes_before', 'profile.audible.setup_minutes_after'];
const RECONSTRUCTED: readonly DerivedRef[] = ['simulated'];

export const AUTOMATION_CAPTION = 'Illustrative reconstruction using approximate reported timings; not measured telemetry.';

const NAMES = ['Before the tool', 'With the tool'] as const;
/** Half a bar's width, in bars: each bar fills half of its column. */
const HALF_BAR = 0.25;
const HEIGHT = { narrow: 200, wide: 240 } as const;

/** A reported time, read from its fact: the bars and the table never hold a typed number. */
function numericFactValue(id: FactId): number {
  const { value } = getFact(id);
  if (typeof value !== 'number') throw new TypeError(`setup time: ${id} is not a number`);
  return value;
}

function barName(v: number): string {
  const name = Number.isInteger(v) ? NAMES[v] : undefined;
  if (name === undefined) throw new RangeError(`setup time: no bar at tick ${v}`);
  return name;
}

export function automationTable(): TableData {
  return {
    columns: ['Test-account setup', 'Minutes, about'],
    rows: [
      [NAMES[0], numericFactValue('profile.audible.setup_minutes_before')],
      [NAMES[1], numericFactValue('profile.audible.setup_minutes_after')],
    ],
    formats: ['number', 'count'],
    note: 'Approximate times per test account, as I reported them.',
    refs: REPORTED,
  };
}

function SetupChart() {
  const minutes = [numericFactValue('profile.audible.setup_minutes_before'), numericFactValue('profile.audible.setup_minutes_after')];
  // Five-minute ticks up to a fifth above the longer time, so the tall bar never meets the top.
  const top = Math.ceil((Math.max(...minutes) * 1.2) / 5) * 5;
  const ticks = Array.from({ length: top / 5 + 1 }, (_, i) => i * 5);
  const marks = (ctx: PlotContext) =>
    minutes.map((value, i) => {
      const x0 = ctx.xFrac(i - HALF_BAR) * MARK_UNITS;
      const x1 = ctx.xFrac(i + HALF_BAR) * MARK_UNITS;
      const y = ctx.yPx(value);
      return <rect key={NAMES[i]} data-mark="" x={x0} width={x1 - x0} y={y} height={Math.max(0, ctx.yPx(0) - y)} fill="var(--color-series-1)" />;
    });
  return (
    <ChartFrame
      id={`${AUTOMATION_ID}-chart`}
      ariaLabel="Minutes per test account: a tall bar before the tool and a short bar with it"
      x={{ domain: [-0.5, 1.5], ticks: { wide: [0, 1], narrow: [0, 1] }, format: barName, label: 'Test-account setup', refs: RECONSTRUCTED }}
      y={{
        domain: [0, top],
        ticks: { wide: ticks, narrow: ticks.filter((_, i) => i % 2 === 0) },
        format: (v) => formatNumber(v, 0),
        label: 'Minutes per test account, about',
        refs: RECONSTRUCTED,
      }}
      height={HEIGHT}
      marks={marks}
    />
  );
}

/** `state` forces a runtime view (no-JS or error) for the kitchen sink and tests. */
export function AutomationFigure({ state }: { state?: FigureState } = {}) {
  return (
    <Figure
      id={AUTOMATION_ID}
      state={state}
      title={
        <>
          Test-account setup fell from about <Fact id="profile.audible.setup_minutes_before" /> to about{' '}
          <Fact id="profile.audible.setup_minutes_after" /> minutes
        </>
      }
      provenance="simulated"
      table={automationTable()}
      caption={
        <>
          Minutes to set up one test account by hand, before the tool, and with it. {AUTOMATION_CAPTION}
        </>
      }
    >
      <SetupChart />
    </Figure>
  );
}
