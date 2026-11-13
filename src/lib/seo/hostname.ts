// The bare-hostname rule for the canonical origin. A leaf module (no imports) so that scripts run with
// plain Node, such as scripts/seo-origin-check.ts, can use it without reaching the server-only env.

// A bare hostname: two or more dot-separated labels of letters, digits and inner hyphens, ending in a
// label that starts with a letter (so no IP address). No scheme, userinfo, port, path, query,
// trailing dot or whitespace.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const TLD = '[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?';
const BARE_HOSTNAME = new RegExp(`^(?=.{1,253}$)(?:${LABEL}\\.)+${TLD}$`);

/** The hostname in lower case, or undefined when the value is not a bare hostname. */
export function bareHostname(value: string): string | undefined {
  const host = value.toLowerCase();
  return BARE_HOSTNAME.test(host) ? host : undefined;
}
