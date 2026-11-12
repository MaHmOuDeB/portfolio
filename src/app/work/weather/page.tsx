// The Weather build note. A plain static page: the composition reads only the vendored weather
// export at build time and has no island.
import type { Metadata } from 'next';
import { WEATHER_TITLE, WeatherPage } from '@/components/weather/WeatherPage';

export const metadata: Metadata = {
  title: WEATHER_TITLE,
  description:
    'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
};

export default function WeatherRoute() {
  return <WeatherPage />;
}
