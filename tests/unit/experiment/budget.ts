// The Redis commands one full seven-event view costs, sent as the beacon sends it (four requests).
// handler.test.ts measures it against the in-memory store; config.test.ts ties it, with the daily
// ceiling, to the store's free monthly command quota.
export const COMMANDS_PER_FULL_VIEW = 48;
/** Upstash's free tier: commands a month. */
export const MONTHLY_COMMAND_QUOTA = 500_000;

/** Three ISR routes every five minutes, two reads each, rounded up for the month. */
export const MONTHLY_PAGE_READ_BUDGET = 55_000;
