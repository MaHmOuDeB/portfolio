// The Pulse dashboard's polite announcements: one message per committed action, with the action's
// value in it where it has one, and an announcer that makes an identical repeat heard again.
//
// The Figure renders the announcement as the text of a polite live region. React writes nothing when a
// new string equals the old one, so a screen reader would stay silent the second time an action
// repeats (Export CSV twice, Reset twice). The announcer clears the region first and sets the message
// again on the next frame, so the text changes and is read. A newer, different message cancels a
// pending repeat, and `dispose` cancels a pending frame when the island unmounts. Pure and
// client-safe: the island passes React's setter and requestAnimationFrame with cancelAnimationFrame.
import { channelPhrase, chartLabel, type ChannelValue, type ChartKey, type DashboardView, type RangeValue } from '@/lib/pulse/dashboard';

const over = (view: DashboardView) => `${channelPhrase(view.channel)} over the last ${view.range}`;

/** The message each committed action announces. */
export const pulseMessages = {
  filter: (channel: ChannelValue) => `Applied Filter sent. Showing ${channelPhrase(channel)}.`,
  range: (range: RangeValue) => `Changed Date Range sent. Showing the last ${range}.`,
  detail: (chart: ChartKey) => `Viewed Chart Detail sent. The ${chartLabel(chart)} detail is open.`,
  exported: () => 'Exported Report sent. The CSV file of the made-up numbers is downloading.',
  saved: (view: DashboardView) => `Saved View sent. The saved view is ${over(view)}.`,
  loaded: (view: DashboardView) => `Loaded Saved View sent. Showing ${over(view)}.`,
  reset: () => 'Dashboard reset. Viewed Dashboard sent.',
} as const;

/** How the announcer asks for, and cancels, the next frame. */
export type FrameScheduler = {
  request: (fn: () => void) => number;
  cancel: (id: number) => void;
};

export type Announcer = {
  /** A message that differs from the last one is set at once; an identical one clears the region and is set again on the next frame. */
  announce: (said: string) => void;
  /** Cancels a pending frame: the island calls it on unmount. */
  dispose: () => void;
};

export function createAnnouncer(set: (said: string) => void, frames: FrameScheduler): Announcer {
  let last = '';
  let pending: number | null = null;
  const dispose = () => {
    if (pending !== null) frames.cancel(pending);
    pending = null;
  };
  return {
    announce: (said) => {
      dispose();
      if (said === last) {
        set('');
        pending = frames.request(() => {
          pending = null;
          set(said);
        });
      } else {
        set(said);
      }
      last = said;
    },
    dispose,
  };
}
