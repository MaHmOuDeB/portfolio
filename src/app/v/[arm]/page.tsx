// The home page, one static page per group. The proxy rewrites every request for / to /v/a or /v/b
// (drawn per request) and answers a direct /v/* with the 404 page (except a request carrying the
// revalidation header, which can never count); dynamicParams off makes any other group a 404 too.
// Both pages regenerate every 5 minutes from the store, like data.json.
//
// One snapshot read per render, projected into the Home model on the server; the beacon comes first,
// then the Home sections. The beacon, the headlines and the note live in this page segment, never in
// a layout, so a soft navigation away and back mounts a new view (which the beacon refuses as a
// second entry of the same document). The metadata reads no snapshot.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExperimentBeacon } from '@/components/experiment/ExperimentBeacon';
import { HomeSections } from '@/components/home/HomeSections';
import type { Arm } from '@/experiment.values';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { toHomeModel } from '@/lib/home/model';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const revalidate = 300;
export const dynamicParams = false;

// The same metadata for both groups: canonical /, indexable, no snapshot read.
export const metadata: Metadata = pageMetadata(seoEntry('/'), canonicalOrigin());

export function generateStaticParams(): { arm: Arm }[] {
  return [{ arm: 'a' }, { arm: 'b' }];
}

function isArm(value: string): value is Arm {
  return value === 'a' || value === 'b';
}

export default async function Home({ params }: PageProps<'/v/[arm]'>) {
  const { arm } = await params;
  if (!isArm(arm)) notFound();
  const model = toHomeModel(await getExperimentSnapshot(), arm);
  return (
    <>
      <ExperimentBeacon arm={arm} ns={model.namespace} />
      <div className="pb-section">
        <HomeSections model={model} />
      </div>
    </>
  );
}
