// The canonical origin and the metadata of every public page. Both are read at build time from the
// build's environment and the content data; nothing here reads a request or the experiment's data,
// so a page's metadata is the same for every visitor and both Home groups.
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module.
import type { Metadata } from 'next';
import { shareTitle, type SeoEntry } from '../../../content/seo.ts';
import { serverEnv, type ServerEnv } from '../env.ts';
import { SITE } from '../site.ts';
import { OG_HEIGHT, OG_WIDTH } from './og-template.ts';

/** The fixed test origin's host: the reserved .invalid top-level domain, never a real host. */
export const TEST_ORIGIN_HOST = 'canonical.invalid';

/** A build that cannot name its canonical origin. The name is what a failed build prints. */
export class CanonicalOriginError extends Error {
  override name = 'CanonicalOriginError';
}

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

const isTestHost = (host: string) => host === 'invalid' || host.endsWith('.invalid');

/**
 * The site's canonical origin, `https://` plus a validated bare hostname.
 *
 * - Production (`VERCEL_ENV=production`): `VERCEL_PROJECT_PRODUCTION_URL`. A missing or invalid
 *   value, a `.invalid` host or any `SEO_TEST_ORIGIN_HOST` throws CanonicalOriginError, so the
 *   production build fails rather than publish a wrong canonical.
 * - Anything else (a local or CI build, a preview, e2e): `SEO_TEST_ORIGIN_HOST` if set, else the
 *   fixed test origin https://canonical.invalid. The production hostname is never used there.
 */
export function canonicalOrigin(
  env: Pick<ServerEnv, 'vercelEnv' | 'productionHost' | 'seoTestOriginHost'> = serverEnv(),
): URL {
  if (env.vercelEnv === 'production') {
    if (env.seoTestOriginHost !== undefined) {
      throw new CanonicalOriginError('SEO_TEST_ORIGIN_HOST is a test override; a production build refuses it');
    }
    if (env.productionHost === undefined) {
      throw new CanonicalOriginError('VERCEL_PROJECT_PRODUCTION_URL is missing; a production build needs the canonical hostname');
    }
    const host = bareHostname(env.productionHost);
    if (host === undefined) {
      throw new CanonicalOriginError('VERCEL_PROJECT_PRODUCTION_URL is not a bare hostname (no scheme, port, path or trailing dot)');
    }
    if (isTestHost(host)) {
      throw new CanonicalOriginError('VERCEL_PROJECT_PRODUCTION_URL is a .invalid test host; a production build refuses it');
    }
    return new URL(`https://${host}`);
  }
  if (env.seoTestOriginHost !== undefined) {
    const host = bareHostname(env.seoTestOriginHost);
    if (host === undefined) {
      throw new CanonicalOriginError('SEO_TEST_ORIGIN_HOST is not a bare hostname (no scheme, port, path or trailing dot)');
    }
    return new URL(`https://${host}`);
  }
  return new URL(`https://${TEST_ORIGIN_HOST}`);
}

/**
 * A public page's metadata: its title and description, one absolute canonical, and the Open Graph
 * and Twitter fields (with the page's share title) and its 1200 x 630 sharing image. Every URL is absolute on `origin`. There is
 * no robots field, so the page is indexable and followed.
 */
export function pageMetadata(entry: SeoEntry, origin: URL): Metadata {
  const url = new URL(entry.path, origin).href;
  const image = new URL(entry.image, origin).href;
  const title = shareTitle(entry);
  return {
    metadataBase: origin,
    title: entry.title,
    description: entry.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      url,
      title,
      description: entry.description,
      images: [{ url: image, width: OG_WIDTH, height: OG_HEIGHT, alt: entry.imageAlt, type: 'image/png' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: entry.description,
      images: [{ url: image, alt: entry.imageAlt }],
    },
  };
}
