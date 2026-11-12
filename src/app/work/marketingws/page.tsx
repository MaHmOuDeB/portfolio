// The MarketingWS build note. A plain static page: no data, no query and nothing interactive.
import type { Metadata } from 'next';
import { MARKETINGWS_TITLE, MarketingwsPage } from '@/components/marketingws/MarketingwsPage';

export const metadata: Metadata = {
  title: MARKETINGWS_TITLE,
  description:
    "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app: how it works, how I checked it and its limits.",
};

export default function MarketingwsRoute() {
  return <MarketingwsPage />;
}
