// The German Marketingws build note: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/marketingws'), canonicalOrigin());

export default function GermanMarketingwsRoute() {
  return <MarketingwsPage locale="de" />;
}
