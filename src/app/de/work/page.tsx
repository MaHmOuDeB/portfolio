// The German Work directory: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { WorkPage } from '@/components/work/WorkPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work'), canonicalOrigin());

export default function GermanWorkRoute() {
  return <WorkPage locale="de" />;
}
