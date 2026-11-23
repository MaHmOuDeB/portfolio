// The German N8n build note: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { N8nPage } from '@/components/n8n/N8nPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/n8n'), canonicalOrigin());

export default function GermanN8nRoute() {
  return <N8nPage locale="de" />;
}
