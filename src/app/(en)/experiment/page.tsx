// The Live test page. Static and regenerated every 5 minutes, like the home pages and data.json:
// one snapshot read per render, projected at once on the server into the page's display shape
// (published cells only), then rendered with no client island, no beacon and no polling. At run
// time a failed read throws, so the regeneration fails and the last good page stays.
import type { Metadata } from 'next';
import { LivePage } from '@/components/live-page/LivePage';
import { serverEnv } from '@/lib/env';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';
import { toLivePageDisplay, toLivePageModel } from '@/lib/live-page/model';

export const revalidate = 300;

export const metadata: Metadata = pageMetadata(seoEntry('/experiment'), canonicalOrigin());

export default async function LiveTestRoute() {
  const env = serverEnv();
  const display = toLivePageDisplay(toLivePageModel(await getExperimentSnapshot(), { commit: env.gitCommit ?? null }));
  return <LivePage display={display} host={env.productionHost ?? null} />;
}
