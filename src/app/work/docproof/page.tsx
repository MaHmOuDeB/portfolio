// The Docproof build note. A plain static page: prose, one diagram and one recorded run, all from
// content/docproof.tsx; nothing on it is live.
import type { Metadata } from 'next';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/docproof'), canonicalOrigin());

export default function DocproofRoute() {
  return <DocproofPage />;
}
