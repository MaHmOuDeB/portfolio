// Shared by playwright.config.ts and the specs. Not a secret: it only unlocks the exclusion cookie of
// the throwaway server Playwright starts. The server treats a token under 32 characters as unset.
export const E2E_EXCLUDE_TOKEN = 'e2e-exclude-token-0f3a9c1d-throwaway';

// The local fake of the Upstash REST API that the e2e server reads and writes (scripts/fake-upstash.ts).
// Throwaway tokens of a loopback server, never a real store's.
export const E2E_FAKE_UPSTASH_PORT = 8079;
export const E2E_FAKE_UPSTASH_URL = `http://127.0.0.1:${E2E_FAKE_UPSTASH_PORT}`;
export const E2E_KV_WRITE_TOKEN = 'e2e-fake-upstash-write-token-throwaway';
export const E2E_KV_READ_TOKEN = 'e2e-fake-upstash-read-token-throwaway';

/**
 * The instant the e2e servers' clock starts at. Outside production every entry is refused as
 * not-started until the fixture start, so the e2e run moves the server clock (Next and the fake
 * store together) to a midday after it: a run never starts before the experiment and never crosses
 * a Berlin midnight. The offset is honoured only by the loopback fake store outside production.
 */
export const E2E_CLOCK_AT = '2026-11-03T12:00:00+01:00';

/** The offset that puts the server clock at E2E_CLOCK_AT now. */
export function e2eClockOffsetMs(nowMs: number = Date.now()): number {
  return Date.parse(E2E_CLOCK_AT) - nowMs;
}

// The contact form's sender in the e2e run: the fake Resend endpoint on the same loopback fake
// (scripts/fake-upstash.ts), a throwaway key, and a placeholder inbox. Never a real key or address.
export const E2E_RESEND_KEY = 'e2e-fake-resend-key-throwaway';
export const E2E_RESEND_URL = `${E2E_FAKE_UPSTASH_URL}/resend/emails`;
export const E2E_CONTACT_TO = 'inbox@example.test';
