// The Redis commands one full seven-event view costs, sent as the beacon sends it (four requests).
// handler.test.ts measures it against the in-memory store; config.test.ts ties it, with the daily
// ceiling, to the store's free monthly command quota.
export const COMMANDS_PER_FULL_VIEW = 48;
/** Upstash's free tier: commands a month. */
export const MONTHLY_COMMAND_QUOTA = 500_000;

/**
 * Four ISR routes (`/v/a`, `/v/b`, `/experiment/data.json`, `/experiment`) every five minutes, two
 * reads each, 69,120 rounded up: 4 x 2 x 8,640 regenerations a month (30 days x 288 a day).
 */
export const MONTHLY_PAGE_READ_BUDGET = 70_000;

/** A ceiling-refused entry on an instance that has not yet seen the day full: the rate-limit
 * increment, the closed-marker read, the reservation and the ceiling increment, metered as the
 * store counts them. handler.test.ts ties it to the handler. */
export const REFUSED_ENTRY_COMMANDS = 8;
/**
 * Refused entries a day, at REFUSED_ENTRY_COMMANDS each, that the quota can absorb: an allowance
 * (120,000 a month: 500 x 8 x 30) inside the 142,000 left after the full views (288,000) and page
 * reads (70,000), not a measurement. The process-local ceiling memo cuts a refused lone entry to
 * nothing after the first one an instance sees; a refused batch that carries later events still
 * pays in full.
 */
export const REFUSED_ENTRIES_PER_DAY = 500;
