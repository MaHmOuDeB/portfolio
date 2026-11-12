// The MarketingWS build note. A plain static page: no data, no query and nothing interactive.
import type { Metadata } from 'next';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/marketingws'), canonicalOrigin());

export default function MarketingwsRoute() {
  return <MarketingwsPage />;
}
