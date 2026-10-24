// The Redis commands one full seven-event view costs, sent as the beacon sends it (four requests).
// handler.test.ts measures it against the in-memory store; config.test.ts ties it, with the daily
// ceiling, to the store's free monthly command quota.
export const COMMANDS_PER_FULL_VIEW = 39;
/** Upstash's free tier: commands a month. */
export const MONTHLY_COMMAND_QUOTA = 500_000;
