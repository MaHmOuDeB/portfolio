// The German Pulse case study: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { PulsePage } from '@/components/pulse/PulsePage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/pulse'), canonicalOrigin());

export default function GermanPulseRoute() {
  return <PulsePage locale="de" />;
}
