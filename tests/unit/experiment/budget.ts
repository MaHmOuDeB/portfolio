// The Redis commands one full seven-event view costs, sent as the beacon sends it (four requests).
// handler.test.ts measures it against the in-memory store; config.test.ts ties it, with the daily
// ceiling, to the store's free monthly command quota.
export const COMMANDS_PER_FULL_VIEW = 48;
/** Upstash's free tier: commands a month. */
export const MONTHLY_COMMAND_QUOTA = 500_000;

/** Three ISR routes every five minutes, two reads each, rounded up for the month. */
export const MONTHLY_PAGE_READ_BUDGET = 55_000;

/** A ceiling-refused entry on an instance that has not yet seen the day full: the rate-limit
 * increment, the closed-marker read, the reservation and the ceiling increment, metered as the
 * store counts them. handler.test.ts ties it to the handler. */
export const REFUSED_ENTRY_COMMANDS = 8;
/**
 * Refused entries a day that cost REFUSED_ENTRY_COMMANDS each. The process-local ceiling memo cuts
 * a refused entry-only request to nothing after the first one an instance sees, so this is the
 * worst case where it never helps (every request on a cold instance), not the expected one.
 */
export const REFUSED_ENTRIES_PER_DAY = 650;
