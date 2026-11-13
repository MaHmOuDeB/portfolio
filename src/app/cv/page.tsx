// The CV as a printable page. A plain static page; the PDF is linked when the build has a checked one.
import type { Metadata } from 'next';
import { CvPage } from '@/components/about/CvPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/cv'), canonicalOrigin());

export default function CvRoute() {
  return <CvPage />;
}
