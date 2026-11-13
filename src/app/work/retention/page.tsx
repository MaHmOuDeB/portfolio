// The Retention case study. A plain static page: the composition reads only the vendored exports at
// build time, and each Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { RetentionCaseStudy } from '@/components/retention/RetentionPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/retention'), canonicalOrigin());

export default function RetentionRoute() {
  return <RetentionCaseStudy />;
}
