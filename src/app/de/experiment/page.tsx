// The German Live test page: the English page's twin. Static and regenerated every 10 minutes (a fifth
// route that reads the store: DE_LIVE_REVALIDATE_SECONDS is 600, and Next needs the literal below, so a
// unit test holds the two equal). One snapshot read per render, projected at once on the server into
// the display shape (published cells only), then rendered with no client island and no polling. This
// page assigns no group and is never counted. At run time a failed read throws, so the regeneration
// fails and the last good page stays.
import type { Metadata } from 'next';
import { LivePage } from '@/components/live-page/LivePage';
import { serverEnv } from '@/lib/env';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { seoEntryFor } from '@/lib/seo/entries';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { toLivePageDisplay, toLivePageModel } from '@/lib/live-page/model';

export const revalidate = 600;

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/experiment'), canonicalOrigin());

export default async function GermanLiveTestRoute() {
  const env = serverEnv();
  const display = toLivePageDisplay(toLivePageModel(await getExperimentSnapshot(), { commit: env.gitCommit ?? null }));
  return <LivePage display={display} host={env.productionHost ?? null} locale="de" />;
}
