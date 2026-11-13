// The made-up data of the Pulse dashboard copy and its URL state: `?pulse.channel=email&pulse.range=7d`.
// Client-safe and pure: no facts, no sources, no React. The numbers are generated here from a fixed
// seed, so every visitor sees the same made-up history; nothing is measured.
//
// - Channels and charts are this copy's own (simulated). The date ranges are the source's own labels
//   ("7d / 30d / 90d toggle changed"), and a range's days are read from its label.
// - The history is the longest range's days per channel; a shorter range shows the end of it, and
//   "all channels" is the sum of the others, day by day.
// - The table, the CSV and the detail summary all come from the same rows: what the charts draw.
import type { TableData } from '@/components/kit/DataTable';
import { niceTicks } from '@/lib/figure/scales';
import type { Presets } from '@/lib/figure/url-state';

export const PULSE_ID = 'pulse';

const CHANNEL_VALUES = ['all', 'email', 'search', 'social'] as const;
export type ChannelValue = (typeof CHANNEL_VALUES)[number];

export const CHANNELS: readonly { value: ChannelValue; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'email', label: 'Email' },
  { value: 'search', label: 'Search' },
  { value: 'social', label: 'Social' },
];

/** The source's date-range labels, in its order. */
export const RANGES = ['7d', '30d', '90d'] as const;
export type RangeValue = (typeof RANGES)[number];

export const CHARTS = [
  { key: 'sign_ups', label: 'Sign-ups' },
  { key: 'trials_started', label: 'Trials started' },
] as const;
export type ChartKey = (typeof CHARTS)[number]['key'];

export type DashboardView = { channel: ChannelValue; range: RangeValue };

export const PULSE_SCHEMA = {
  channel: { kind: 'enum', values: CHANNEL_VALUES },
  range: { kind: 'enum', values: RANGES },
} as const;

export const PULSE_PRESETS: Presets<typeof PULSE_SCHEMA> = { default: { channel: 'all', range: '30d' } };

/** The days a range covers, read from its label ("30d" is 30). */
export function rangeDays(range: RangeValue): number {
  return Number.parseInt(range, 10);
}

export function channelLabel(channel: ChannelValue): string {
  const found = CHANNELS.find((c) => c.value === channel);
  if (!found) throw new RangeError(`pulse: no channel ${channel}`);
  return found.label;
}

/** The channel as it reads inside a sentence: "all channels", or the channel's name. */
export function channelPhrase(channel: ChannelValue): string {
  return channel === 'all' ? 'all channels' : channelLabel(channel);
}

export function chartLabel(chart: ChartKey): string {
  return CHARTS.find((c) => c.key === chart)!.label;
}

type Source = Exclude<ChannelValue, 'all'>;
const SOURCES: readonly Source[] = ['email', 'search', 'social'];
/** Typical sign-ups per day of each channel, before the noise and the slow rise. */
const BASE: Record<Source, number> = { email: 18, search: 26, social: 11 };
const HISTORY = Math.max(...RANGES.map(rangeDays));

/** A uniform number in [0, 1) from one integer seed (mulberry32, one step). */
function unit(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

type Day = { sign_ups: number; trials_started: number };

/** The made-up history of one channel: HISTORY days, oldest first. */
function history(channel: Source): Day[] {
  const c = SOURCES.indexOf(channel) + 1;
  return Array.from({ length: HISTORY }, (_, i) => {
    const sign_ups = Math.round(BASE[channel] * (0.7 + 0.6 * unit(c * 1000 + i)) * (1 + i / (2 * HISTORY)));
    const trials_started = Math.round(sign_ups * (0.22 + 0.16 * unit(c * 1000 + 500 + i)));
    return { sign_ups, trials_started };
  });
}

const HISTORIES: Record<Source, Day[]> = { email: history('email'), search: history('search'), social: history('social') };

export type DashboardRow = { day: number } & Day;

/** The rows the dashboard shows: one per day of the range, oldest first, day 1 being the first. */
export function dashboardRows({ channel, range }: DashboardView): DashboardRow[] {
  const days = rangeDays(range);
  const from = HISTORY - days;
  const channels = channel === 'all' ? SOURCES : [channel];
  return Array.from({ length: days }, (_, i) => {
    const day = (key: keyof Day) => channels.reduce((sum, c) => sum + HISTORIES[c][from + i]![key], 0);
    return { day: i + 1, sign_ups: day('sign_ups'), trials_started: day('trials_started') };
  });
}

/**
 * The top of a chart's value axis for the view shown: the busiest day rounded up to the next step of
 * the chart's own wide ticks (four, from zero), so a filtered view fills its chart and the top is a
 * labelled gridline. The axis always starts at zero.
 */
export function chartTop(chart: ChartKey, view: DashboardView): number {
  const max = Math.max(1, ...dashboardRows(view).map((r) => r[chart]));
  const ticks = niceTicks([0, max], 4);
  const step = ticks.length > 1 ? ticks[1]! - ticks[0]! : max;
  return Math.ceil(max / step) * step;
}

export function dashboardTable(view: DashboardView): TableData {
  return {
    columns: ['Day', ...CHARTS.map((c) => c.label)],
    rows: dashboardRows(view).map((r) => [r.day, r.sign_ups, r.trials_started]),
    formats: ['count', 'count', 'count'],
    note: 'Made-up numbers per day for the channel and range shown, oldest day first.',
    refs: ['simulated'],
  };
}

/** The CSV the Export CSV button saves: the rows shown, never the events the visitor sent. */
export function dashboardCsv(view: DashboardView): string {
  const header = ['channel', 'range', 'day', ...CHARTS.map((c) => c.key)].join(',');
  return [header, ...dashboardRows(view).map((r) => [view.channel, view.range, r.day, r.sign_ups, r.trials_started].join(','))].join('\n');
}

/** A chart's detail: its total over the rows shown and its busiest day (the first, on a tie). */
export function chartSummary(view: DashboardView, chart: ChartKey): { total: number; peak: number; peakDay: number } {
  const rows = dashboardRows(view);
  const peak = Math.max(...rows.map((r) => r[chart]));
  return { total: rows.reduce((s, r) => s + r[chart], 0), peak, peakDay: rows.find((r) => r[chart] === peak)!.day };
}
