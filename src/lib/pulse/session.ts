// The event side of the Pulse dashboard copy: the event each action sends, the bounded stream the
// visitor sees, and how a mounted dashboard connects to its bus. Client-safe and pure: the stream is
// the caller's state, changed only through the `update` function it passes; nothing is stored, and
// no event leaves the page.
//
// - Each event has the export's name and exactly its properties (the bus refuses anything else).
//   The values are this copy's own, except the range labels and the CSV format, which are the
//   source's ("7d / 30d / 90d", "Export CSV"); prompt_version is the copy's own demo value.
// - A mounted dashboard sends Viewed Dashboard once. `mounted` is a ref the component keeps, so an
//   effect that runs twice on one mount (React's strict mode) does not send it twice; a new mount has
//   a new ref and a new bus, and sends its own.
// - Reset empties the stream through the bus (every subscriber's onClear), then sends one new
//   Viewed Dashboard.
import type { DerivedRef } from '@/components/kit/Derived';
import { DEMO_PROMPT_VERSION, type PulseBus, type PulseEvent } from '@/lib/pulse/bus';
import type { ChannelValue, ChartKey, RangeValue } from '@/lib/pulse/dashboard';

/** How many events the stream keeps: the newest ones. */
export const STREAM_LIMIT = 20;
/** The one view a visitor can save: a made-up name. */
export const VIEW_NAME = 'My view';

export type StreamEntry = Readonly<{ seq: number; event: PulseEvent }>;
export type Stream = readonly StreamEntry[];

export const pulseEvents = {
  viewedDashboard: (): PulseEvent => ({ name: 'Viewed Dashboard', properties: { prompt_version: DEMO_PROMPT_VERSION.value } }),
  appliedFilter: (channel: ChannelValue): PulseEvent => ({ name: 'Applied Filter', properties: { filter_type: 'channel', value: channel } }),
  changedDateRange: (range: RangeValue): PulseEvent => ({ name: 'Changed Date Range', properties: { range } }),
  viewedChartDetail: (chart: ChartKey): PulseEvent => ({ name: 'Viewed Chart Detail', properties: { chart } }),
  exportedReport: (): PulseEvent => ({ name: 'Exported Report', properties: { format: 'csv' } }),
  savedView: (): PulseEvent => ({ name: 'Saved View', properties: { view_name: VIEW_NAME } }),
  loadedSavedView: (): PulseEvent => ({ name: 'Loaded Saved View', properties: { view_name: VIEW_NAME } }),
} as const;

const SOURCE_VALUES: ReadonlySet<string> = new Set(['range', 'format']);

/** Where a property's value comes from: the source's own labels, or this copy. */
export function propertyRefs(key: string): readonly DerivedRef[] {
  if (key === 'prompt_version') return DEMO_PROMPT_VERSION.refs;
  return SOURCE_VALUES.has(key) ? ['source:pulse'] : ['simulated'];
}

/** The stream with `event` added: newest first, at most STREAM_LIMIT entries, each with its own key. */
export function appendEvent(stream: Stream, event: PulseEvent): Stream {
  const seq = (stream[0]?.seq ?? 0) + 1;
  return [{ seq, event }, ...stream].slice(0, STREAM_LIMIT);
}

const EMPTY: Stream = [];

/**
 * Subscribes the dashboard's stream to its bus and, on the mount's first connection only, sends
 * Viewed Dashboard. Returns the unsubscribe, for the effect's cleanup.
 */
export function connectDashboard(bus: PulseBus, update: (fn: (s: Stream) => Stream) => void, mounted: { current: boolean }): () => void {
  const off = bus.subscribe(
    (event) => update((s) => appendEvent(s, event)),
    () => update(() => EMPTY),
  );
  if (!mounted.current) {
    mounted.current = true;
    bus.emit(pulseEvents.viewedDashboard());
  }
  return off;
}

/** Reset: the stream empties, then one new Viewed Dashboard arrives. */
export function resetDashboard(bus: PulseBus): void {
  bus.clear();
  bus.emit(pulseEvents.viewedDashboard());
}
