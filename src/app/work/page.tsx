// The Work directory: every case study and build note on the site. A plain static page: the
// composition reads only the content data at build time.
import type { Metadata } from 'next';
import { WorkPage } from '@/components/work/WorkPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work'), canonicalOrigin());

export default function WorkRoute() {
  return <WorkPage />;
}
