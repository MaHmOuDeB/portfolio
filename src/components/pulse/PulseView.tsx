// The Pulse dashboard Figure: a copy of the dashboard with made-up numbers, and the list of events it
// sent. Shared and hook-free: the server draws the preset with it (the static HTML, also the no-JS
// view, where the list is empty and the actions are hidden) and the island draws the visitor's view
// and stream with the same markup, passing its handlers to the native buttons.
//
// - The control row is the Figure's (Channel, Date range, Reset, from PulseFigureClient.tsx). The
//   dashboard's own actions (Detail on each chart, Export CSV, Save view, Load saved view) are
//   native buttons inside the labelled dashboard content, not a second control row.
// - Two line charts on value axes that never rescale (the top is the same for every channel and
//   range). The numbers are made up, so every tick and table cell says simulated. Marks have no
//   transition.
// - The event list is not a live region: the Figure's polite announcement speaks once per committed
//   action. Each item names its event and properties as the source does (source:pulse) and marks each
//   value with where it comes from.
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';
import { ChartFrame, MARK_UNITS } from '@/components/kit/ChartFrame';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { niceTicks } from '@/lib/figure/scales';
import type { FigureState } from '@/lib/figure/states';
import { DEMO_PROMPT_VERSION } from '@/lib/pulse/bus';
import {
  CHARTS,
  PULSE_ID,
  channelLabel,
  channelPhrase,
  chartSummary,
  chartTop,
  dashboardRows,
  dashboardTable,
  rangeDays,
  type ChartKey,
  type DashboardView,
  type RangeValue,
} from '@/lib/pulse/dashboard';
import { PULSE_TAXONOMY_REFS } from '@/lib/pulse/names';
import { STREAM_LIMIT, propertyRefs, type Stream } from '@/lib/pulse/session';

export const PULSE_FIGURE_TITLE = 'Each dashboard action sends one tracked event';

const SIMULATED: readonly DerivedRef[] = ['simulated'];
const BUTTON = `${buttonClass('secondary')} max-xs:w-full`;

/** A range label as printed: the source's own words, so it carries the source's ref. */
export function RangeText({ range }: { range: RangeValue }) {
  return (
    <span data-num="" {...derivedAttr(PULSE_TAXONOMY_REFS)}>
      {range}
    </span>
  );
}

/** The result line: which view the dashboard shows. */
export function PulseResult({ view }: { view: DashboardView }) {
  return (
    <>
      Showing {channelPhrase(view.channel)} over the last <RangeText range={view.range} />.
    </>
  );
}

const tick = (v: number) => formatNumber(v, 0);

/** One chart: the made-up daily values of the view, as a line. */
function PulseChart({ view, chart }: { view: DashboardView; chart: (typeof CHARTS)[number] }) {
  const rows = dashboardRows(view);
  const days = rangeDays(view.range);
  const top = chartTop(chart.key);
  return (
    <ChartFrame
      id={`${PULSE_ID}-${chart.key}-chart`}
      ariaLabel={`Made-up ${chart.label.toLowerCase()} per day for ${channelPhrase(view.channel)}, over the chosen range`}
      x={{
        domain: [1, days],
        ticks: { wide: niceTicks([1, days], 6), narrow: niceTicks([1, days], 3) },
        format: tick,
        label: 'Day of the range',
        refs: SIMULATED,
      }}
      y={{ domain: [0, top], ticks: { wide: niceTicks([0, top], 4), narrow: niceTicks([0, top], 3) }, format: tick, label: `${chart.label} per day`, refs: SIMULATED }}
      height={{ narrow: 160, wide: 180 }}
      marks={(ctx) => (
        <polyline
          data-mark=""
          data-chart={chart.key}
          points={rows.map((r) => `${(ctx.xFrac(r.day) * MARK_UNITS).toFixed(2)},${ctx.yPx(r[chart.key]).toFixed(2)}`).join(' ')}
          fill="none"
          stroke="var(--color-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
    />
  );
}

/** The detail under a chart: its total and its busiest day over the rows shown. */
function ChartDetail({ view, chart }: { view: DashboardView; chart: ChartKey }) {
  const { total, peak, peakDay } = chartSummary(view, chart);
  const n = (value: number) => <Derived value={value} unit="count" refs={SIMULATED} />;
  return (
    <p>
      Over the range: {n(total)} in all, and {n(peak)} on the busiest day, day {n(peakDay)}.
    </p>
  );
}

export type DashboardHandlers = {
  onDetail: (chart: ChartKey) => void;
  onExport: () => void;
  onSave: () => void;
  onLoad: () => void;
};

type DashboardProps = {
  view: DashboardView;
  stream?: Stream;
  saved?: DashboardView | null;
  detail?: ChartKey | null;
  /** The island's handlers; the server's preview has none, and its buttons are hidden until it loads. */
  handlers?: DashboardHandlers;
};

/** The labelled dashboard: the two charts with their Detail buttons, then the export and saved-view actions. */
function Dashboard({ view, saved, detail, handlers }: DashboardProps) {
  return (
    <div role="region" aria-labelledby={`${PULSE_ID}-dashboard-title`}>
      <h4 id={`${PULSE_ID}-dashboard-title`} className="text-lg font-semibold">
        Dashboard
      </h4>
      {CHARTS.map((chart) => {
        const open = detail === chart.key;
        return (
          <div key={chart.key} data-pulse-chart={chart.key} className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h5 className="text-base font-semibold">{chart.label}</h5>
              <button
                type="button"
                id={`${PULSE_ID}-detail-button-${chart.key}`}
                data-js-only=""
                aria-expanded={open}
                aria-controls={`${PULSE_ID}-detail-${chart.key}`}
                className={BUTTON}
                onClick={handlers ? () => handlers.onDetail(chart.key) : undefined}
              >
                Detail<span className="sr-only">: {chart.label}</span>
              </button>
            </div>
            <div className="mt-2">
              <PulseChart view={view} chart={chart} />
            </div>
            <div id={`${PULSE_ID}-detail-${chart.key}`} hidden={!open} className="mt-2 max-w-text text-sm">
              {open ? <ChartDetail view={view} chart={chart.key} /> : null}
            </div>
          </div>
        );
      })}
      <div data-js-only="" className="mt-6">
        <div role="group" aria-label="Dashboard actions" className="flex flex-col gap-3 xs:flex-row xs:flex-wrap">
          <button type="button" id={`${PULSE_ID}-export`} className={BUTTON} onClick={handlers?.onExport}>
            Export CSV
          </button>
          <button type="button" id={`${PULSE_ID}-save`} className={BUTTON} onClick={handlers?.onSave}>
            Save view
          </button>
          <button
            type="button"
            id={`${PULSE_ID}-load`}
            disabled={!saved}
            aria-describedby={`${PULSE_ID}-load-reason`}
            className={`${BUTTON} disabled:cursor-not-allowed disabled:border-line disabled:text-muted`}
            onClick={handlers?.onLoad}
          >
            Load saved view
          </button>
        </div>
        <p id={`${PULSE_ID}-load-reason`} className="mt-2 max-w-text text-sm text-muted">
          {saved ? (
            <>
              Saved view: {channelLabel(saved.channel)} over the last <RangeText range={saved.range} />.
            </>
          ) : (
            <>Save a view first; then Load saved view brings it back.</>
          )}
        </p>
      </div>
    </div>
  );
}

/** The events this dashboard sent, newest first, with the local demo prompt version. */
export function PulseStream({ stream = [] }: { stream?: Stream }) {
  return (
    <div role="region" aria-labelledby={`${PULSE_ID}-stream-title`} className="mt-8 border-t border-line pt-6">
      <h4 id={`${PULSE_ID}-stream-title`} className="text-lg font-semibold">
        Events sent
      </h4>
      <p className="mt-2 max-w-text text-sm text-muted">
        The last <Derived value={STREAM_LIMIT} unit="count" refs={SIMULATED} /> events this dashboard sent, newest first.
      </p>
      <p className="mt-2 max-w-text text-sm text-muted">
        Local demo prompt version: <code {...derivedAttr(DEMO_PROMPT_VERSION.refs)}>{DEMO_PROMPT_VERSION.value}</code>. It is
        this copy&apos;s own value, not the original&apos;s.
      </p>
      <div data-js-only="" className="mt-4">
        {stream.length === 0 ? (
          <p className="max-w-text text-sm">No events yet. Viewed Dashboard arrives as soon as the dashboard has loaded.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {stream.map(({ seq, event }) => (
              <li key={seq} data-pulse-event={event.name} {...derivedAttr(PULSE_TAXONOMY_REFS)} className="border-l-2 border-line pl-3 text-sm">
                <span className="font-semibold">{event.name}</span>
                {Object.entries(event.properties).map(([key, value]) => (
                  <span key={key} className="block">
                    {key}: <code {...derivedAttr(propertyRefs(key))}>{value}</code>
                  </span>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
      <p data-nojs-only="" className="mt-4 max-w-text text-sm">
        The list needs JavaScript: without it, this copy sends no events.
      </p>
    </div>
  );
}

/**
 * Thrown by the test seam's charts: a failure after a change, for the error fallback's tests. Its
 * body is exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SeamFailure(): never {
  throw new Error('The Pulse charts failed after a change (test seam)');
}

export type PulseFigureViewProps = DashboardProps & {
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /** A forced runtime state, for the kitchen sink and tests. */
  state?: FigureState;
  /**
   * Test seam, absent in production: with `changed`, the charts throw, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the visitor has changed the channel or the range since the island loaded. */
  changed?: boolean;
};

export function PulseFigureView({
  view,
  stream,
  saved,
  detail,
  handlers,
  controls,
  announcement,
  preview,
  state,
  faultAfterChange,
  changed,
}: PulseFigureViewProps) {
  return (
    <Figure
      id={PULSE_ID}
      title={PULSE_FIGURE_TITLE}
      state={state}
      provenance="simulated"
      table={dashboardTable(view)}
      controls={controls}
      announcement={announcement}
      preview={preview}
      result={<PulseResult view={view} />}
      caption={
        <>
          A copy of the Pulse dashboard, with made-up numbers for a made-up product. Each action adds its event to the list,
          newest first. The events stay in this page and are not part of this site&apos;s own experiment.
        </>
      }
    >
      <Dashboard view={view} saved={saved} detail={detail} handlers={handlers} />
      <PulseStream stream={stream} />
      {faultAfterChange && changed ? <SeamFailure /> : null}
    </Figure>
  );
}
