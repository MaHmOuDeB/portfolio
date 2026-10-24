// Cookieless assignment for a request to /. Nothing about the visitor is stored or used to pick the
// group: it is a fresh random draw per request. ?variant= forces a group for demos (counted as
// forced), and bots always get group a (rejected as bot by the event route).
import { isbot } from 'isbot';
import type { Arm } from '../../experiment.values.ts';

/** isbot@5.2.2's list. An empty or missing user agent is not a bot. */
export function isBotUserAgent(ua: string | null): boolean {
  return isbot(ua ?? '');
}

export function assignArm(o: { search: URLSearchParams; userAgent: string | null; random: () => number }): {
  arm: Arm;
  forced: boolean;
  bot: boolean;
} {
  if (isBotUserAgent(o.userAgent)) return { arm: 'a', forced: false, bot: true };
  const variant = o.search.get('variant');
  if (variant === 'a' || variant === 'b') return { arm: variant, forced: true, bot: false };
  return { arm: o.random() < 0.5 ? 'a' : 'b', forced: false, bot: false };
}
