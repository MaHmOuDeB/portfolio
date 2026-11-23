// The German Lab: a plain static page, the English one's twin. The composition draws each Figure's
// preset on the server, and each Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { LabPage } from '@/components/lab/LabPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/lab'), canonicalOrigin());

export default function GermanLabRoute() {
  return <LabPage locale="de" />;
}
