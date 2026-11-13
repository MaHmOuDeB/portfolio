// The Lab. A plain static page: the composition draws each Figure's preset on the server, and each
// Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { LabPage } from '@/components/lab/LabPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/lab'), canonicalOrigin());

export default function LabRoute() {
  return <LabPage />;
}
