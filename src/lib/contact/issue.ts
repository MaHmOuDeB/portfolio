// The time the server issued the form, carried in a hidden field. A message sent sooner than the
// minimum fill time after it is refused (lib/contact/handle.ts).
import 'server-only';

/** The server's clock, in milliseconds, when the form is rendered. */
export function issueTimestamp(): number {
  return Date.now();
}
