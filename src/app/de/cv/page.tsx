// The German CV page: a plain static page, the English one's twin. The PDF it links stays English.
import type { Metadata } from 'next';
import { CvPage } from '@/components/about/CvPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/cv'), canonicalOrigin());

export default function GermanCvRoute() {
  return <CvPage locale="de" />;
}
