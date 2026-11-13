// The About page. A plain static page: the story, the timeline, the tools, the languages and the CV.
import type { Metadata } from 'next';
import { AboutPage } from '@/components/about/AboutPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/about'), canonicalOrigin());

export default function AboutRoute() {
  return <AboutPage />;
}
