// The Lab's peeking example on its own page, for a direct link such as `?peeking.preset=interview`.
// A plain static page: the server draws the preset, and the Figure's island reads the URL state in
// the browser.
import type { Metadata } from 'next';
import { LabPeekingPage } from '@/components/lab/LabPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/lab/peeking'), canonicalOrigin());

export default function LabPeekingRoute() {
  return <LabPeekingPage />;
}
