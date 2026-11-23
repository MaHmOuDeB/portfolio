// The German Audible case study: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/audible'), canonicalOrigin());

export default function GermanAudibleRoute() {
  return <AudiblePage locale="de" />;
}
