// The Pulse case study. A plain static page: the composition reads the Pulse export at build time,
// and the dashboard's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { PulsePage } from '@/components/pulse/PulsePage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/pulse'), canonicalOrigin());

export default function PulseRoute() {
  return <PulsePage />;
}
