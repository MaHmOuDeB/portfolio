import 'server-only';
import { WEATHER_DE } from '../../../content/de/weather';
import { WEATHER_EN, type WeatherCopy } from '../../../content/weather';
import type { Locale } from '@/lib/i18n/locale';

/** The Weather note's words in a language. Server only. */
export function weatherCopy(locale: Locale): WeatherCopy {
  return locale === 'de' ? WEATHER_DE : WEATHER_EN;
}
