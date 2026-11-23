// The German Weather build note: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/weather'), canonicalOrigin());

export default function GermanWeatherRoute() {
  return <WeatherPage locale="de" />;
}
