import 'server-only';
import { MARKETINGWS_DE } from '../../../content/de/marketingws';
import { MARKETINGWS_EN, type MarketingwsCopy } from '../../../content/marketingws';
import type { Locale } from '@/lib/i18n/locale';

/** The MarketingWS note's words in a language. Server only. */
export function marketingwsCopy(locale: Locale): MarketingwsCopy {
  return locale === 'de' ? MARKETINGWS_DE : MARKETINGWS_EN;
}
