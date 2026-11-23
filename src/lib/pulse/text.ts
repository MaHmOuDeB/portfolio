// The Pulse dashboard Figure's words, as plain data (strings, templates and sentences, no functions
// and no elements), so the server can hand them to the island as props. English is the default
// (EN_PULSE); the other language is in content/de/pulse.tsx, typed by PulseText, and a client file
// never imports it. A sentence's pieces are exactly the children of the English JSX it replaced, so the
// English markup is the same. The event names, their property keys and values, and the date-range
// labels are the source's own and are never in these words.
import type { Template } from '@/lib/i18n/template';
import { EN_LAB_KIT, type LabKit } from '@/lib/lab/text-common';
import { slot, type Sentence } from '@/lib/retention/sentence';
import type { ChannelValue, ChartKey } from './dashboard';

export type PulseText = {
  kit: LabKit;
  /** An interactive Figure's title states the relationship. */
  title: string;
  /** Each channel's name as a label, and as it reads inside a sentence. */
  channels: Record<ChannelValue, { label: string; phrase: string }>;
  /** Each chart's name as a heading, and as it reads inside a sentence. */
  charts: Record<ChartKey, { label: string; inline: string }>;
  controls: { channel: string; range: string };
  /** The result line. Slots: channel, range. */
  result: Sentence;
  /** A chart's accessible name. Placeholders: chart (inline), channel (phrase). */
  chartName: Template<'chart' | 'channel'>;
  axis: { x: string; y: Template<'chart'> };
  dashboard: {
    title: string;
    detail: string;
    /** "Detail: {chart}". */
    detailLabel: Template<'chart'>;
    actions: string;
    export: string;
    save: string;
    load: string;
    /** Slots: channel, range. */
    saved: Sentence;
    savePrompt: string;
    /** The detail under a chart. Slots: total, peak, day. */
    summary: Sentence;
  };
  stream: {
    title: string;
    /** Slot: count. */
    last: Sentence;
    /** Slot: version. */
    prompt: Sentence;
    empty: string;
    needsJs: string;
  };
  table: { day: string; note: string };
  caption: string;
  /** What each committed action announces. */
  messages: {
    filter: Template<'channel'>;
    range: Template<'range'>;
    detail: Template<'chart'>;
    exported: string;
    saved: Template<'channel' | 'range'>;
    loaded: Template<'channel' | 'range'>;
    reset: string;
  };
};

export const EN_PULSE: PulseText = {
  kit: EN_LAB_KIT,
  title: 'Each dashboard action with a product question behind it sends one event',
  channels: {
    all: { label: 'All channels', phrase: 'all channels' },
    email: { label: 'Email', phrase: 'Email' },
    search: { label: 'Search', phrase: 'Search' },
    social: { label: 'Social', phrase: 'Social' },
  },
  charts: {
    sign_ups: { label: 'Sign-ups', inline: 'sign-ups' },
    trials_started: { label: 'Trials started', inline: 'trials started' },
  },
  controls: { channel: 'Channel', range: 'Date range' },
  result: ['Showing ', slot('channel'), ' over the last ', slot('range'), '.'],
  chartName: 'Made-up {chart} per day for {channel}, over the chosen range',
  axis: { x: 'Day of the range', y: '{chart} per day' },
  dashboard: {
    title: 'Dashboard',
    detail: 'Detail',
    detailLabel: 'Detail: {chart}',
    actions: 'Dashboard actions',
    export: 'Export CSV',
    save: 'Save view',
    load: 'Load saved view',
    saved: ['Saved view: ', slot('channel'), ' over the last ', slot('range'), '.'],
    savePrompt: 'Save a view first; then Load saved view brings it back.',
    summary: ['Over the range: ', slot('total'), ' in all, and ', slot('peak'), ' on the busiest day, day ', slot('day'), '.'],
  },
  stream: {
    title: 'Events sent',
    last: ['The last ', slot('count'), ' events this dashboard sent, newest first.'],
    prompt: ['Local demo prompt version: ', slot('version'), ". It is this copy's own value, not the original's."],
    empty: 'No events yet. Viewed Dashboard arrives as soon as the dashboard has loaded.',
    needsJs: 'The list needs JavaScript: without it, this copy sends no events.',
  },
  table: { day: 'Day', note: 'Made-up numbers per day for the channel and range shown, oldest day first.' },
  caption:
    "A copy of the Pulse dashboard, with its own charts and channels and made-up numbers for a made-up product. Each action that sends an event adds it to the list, newest first. The events stay in this page and are not part of this site's own experiment.",
  messages: {
    filter: 'Applied Filter sent. Showing {channel}.',
    range: 'Changed Date Range sent. Showing the last {range}.',
    detail: 'Viewed Chart Detail sent. The {chart} detail is open.',
    exported: 'Exported Report sent. The CSV file of the made-up numbers is downloading.',
    saved: 'Saved View sent. The saved view is {channel} over the last {range}.',
    loaded: 'Loaded Saved View sent. Showing {channel} over the last {range}.',
    reset: 'Dashboard reset. Viewed Dashboard sent.',
  },
};
