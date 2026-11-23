// The German About page: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { AboutPage } from '@/components/about/AboutPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/about'), canonicalOrigin());

export default function GermanAboutRoute() {
  return <AboutPage locale="de" />;
}
