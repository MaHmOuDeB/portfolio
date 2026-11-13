// The Audible method page. A plain static page: the composition reads only the profile facts at
// build time, and the ship-rule Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/audible'), canonicalOrigin());

export default function AudibleRoute() {
  return <AudiblePage />;
}
