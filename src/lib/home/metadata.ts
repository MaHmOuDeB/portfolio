// The Home page's metadata: the site's name and role line, the canonical address and nothing that
// keeps it out of search. It reads the site constants and the deployment's own host only, never the
// experiment's data, so the metadata is the same for both groups and in every state.
import type { Metadata } from 'next';
import type { ServerEnv } from '../env.ts';
import { SITE } from '../site.ts';

/**
 * The canonical "/" is named only where it can be absolute: on the production host (the deployment's
 * VERCEL_PROJECT_PRODUCTION_URL, as `metadataBase`), it is https://<host>/. A local, test or
 * Lighthouse build has no host to name, and a relative canonical is invalid, so it has none.
 */
export function homeMetadata(env: Pick<ServerEnv, 'productionHost'>): Metadata {
  return {
    ...(env.productionHost ? { metadataBase: new URL(`https://${env.productionHost}`), alternates: { canonical: '/' } } : {}),
    title: SITE.name,
    description: `${SITE.role} in ${SITE.city}.`,
  };
}
