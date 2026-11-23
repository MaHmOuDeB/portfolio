// The German Docproof build note: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/docproof'), canonicalOrigin());

export default function GermanDocproofRoute() {
  return <DocproofPage locale="de" />;
}
