// Which views count as entry views. The browser decides from signals the client component reads;
// this module only classifies them, so it is pure and has no DOM access.
import type { ClientReject } from './events.ts';

export type EntrySignals = {
  /** navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' */
  optOut: boolean;
  /** The navigation timing entry's type: 'navigate', 'reload', 'back_forward' or 'prerender'. */
  navigationType: string | undefined;
  /** The path of the document's first load (a soft navigation keeps the old one). */
  entryPath: string | undefined;
  referrer: string;
  origin: string;
  prerendered: boolean;
  restoredFromCache: boolean;
  forced: boolean;
  webdriver: boolean;
};

function sameOrigin(referrer: string, origin: string): boolean {
  if (referrer === '') return false;
  try {
    return new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

function isFreshEntry(s: EntrySignals): boolean {
  return (
    s.navigationType === 'navigate' &&
    s.entryPath === '/' &&
    !s.prerendered &&
    !s.restoredFromCache &&
    !sameOrigin(s.referrer, s.origin)
  );
}

/**
 * Opt-out first (a GPC or DNT view sends nothing at all), then the client rejects in attribution
 * order (bot, forced, not_entry), then the entry rules: a fresh navigation to / from outside the
 * site, neither prerendered nor restored from the back/forward cache.
 */
export function classifyEntry(s: EntrySignals): 'entry' | 'opt_out' | ClientReject {
  if (s.optOut) return 'opt_out';
  if (s.webdriver) return 'bot';
  if (s.forced) return 'forced';
  if (!isFreshEntry(s)) return 'not_entry';
  return 'entry';
}
