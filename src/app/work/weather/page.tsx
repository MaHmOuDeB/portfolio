// The Weather build note. A plain static page: the composition reads only the vendored weather
// export at build time and has no island.
import type { Metadata } from 'next';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/work/weather'), canonicalOrigin());

export default function WeatherRoute() {
  return <WeatherPage />;
}
