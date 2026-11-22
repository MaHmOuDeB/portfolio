// The German Retention case study: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { RetentionCaseStudy } from '@/components/retention/RetentionPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/retention'), canonicalOrigin());

export default function GermanRetentionRoute() {
  return <RetentionCaseStudy locale="de" />;
}
