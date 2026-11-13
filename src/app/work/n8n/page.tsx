// The n8n build note. A plain static page with no island.
import type { Metadata } from 'next';
import { N8nPage } from '@/components/n8n/N8nPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/n8n'), canonicalOrigin());

export default function N8nRoute() {
  return <N8nPage />;
}
