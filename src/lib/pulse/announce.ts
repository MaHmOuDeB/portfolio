// The Pulse dashboard's polite announcements: one message per committed action, with the action's
// value in it where it has one, and an announcer that makes an identical repeat heard again.
//
// The Figure renders the announcement as the text of a polite live region. React writes nothing when a
// new string equals the old one, so a screen reader would stay silent the second time an action
// repeats (Export CSV twice, Reset twice). The announcer clears the region first and sets the message
// again on the next frame, so the text changes and is read. A newer, different message cancels a
// pending repeat, and `dispose` cancels a pending frame when the island unmounts. Pure and
// client-safe: the island passes React's setter and requestAnimationFrame with cancelAnimationFrame.
import { fill } from '@/lib/i18n/template';
import { channelPhrase, chartLabel, type ChannelValue, type ChartKey, type DashboardView, type RangeValue } from '@/lib/pulse/dashboard';
import { EN_PULSE, type PulseText } from '@/lib/pulse/text';

/** The message each committed action announces, in the words' language. */
export function messagesFor(text: PulseText) {
  const m = text.messages;
  const over = (view: DashboardView) => ({ channel: channelPhrase(view.channel, text), range: view.range });
  return {
    filter: (channel: ChannelValue) => fill(m.filter, { channel: channelPhrase(channel, text) }),
    range: (range: RangeValue) => fill(m.range, { range }),
    detail: (chart: ChartKey) => fill(m.detail, { chart: chartLabel(chart, text) }),
    exported: () => m.exported,
    saved: (view: DashboardView) => fill(m.saved, over(view)),
    loaded: (view: DashboardView) => fill(m.loaded, over(view)),
    reset: () => m.reset,
  } as const;
}

/** The message each committed action announces. */
export const pulseMessages = messagesFor(EN_PULSE);

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
