// The Home page's metadata: the site's name and role line, the canonical address "/" and nothing that
// keeps it out of search. It reads the site constants and the deployment's own host only, never the
// experiment's data, so the metadata is the same for both groups and in every state.
import type { Metadata } from 'next';
import type { ServerEnv } from '../env.ts';
import { SITE } from '../site.ts';

/**
 * `metadataBase` makes the canonical "/" absolute on the production host (the deployment's
 * VERCEL_PROJECT_PRODUCTION_URL); without one (a local or test build) the link stays the relative "/".
 */
export function homeMetadata(env: Pick<ServerEnv, 'productionHost'>): Metadata {
  return {
    ...(env.productionHost ? { metadataBase: new URL(`https://${env.productionHost}`) } : {}),
    title: SITE.name,
    description: `${SITE.role} in ${SITE.city}.`,
    alternates: { canonical: '/' },
  };
}
