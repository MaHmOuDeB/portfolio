// The sitemap's entries: every English page in the SEO manifest on the canonical origin and, for a page
// in the German registry, its /de twin, each with the hreflang alternates of both. An unregistered page
// has no twin and no alternates, so the sitemap never lists a German page that does not exist.
import type { MetadataRoute } from 'next';
import { SEO_PAGES, type SeoEntry } from '../../../content/seo.ts';
import { DE_PAGES } from '../i18n/pages.ts';
import { germanPath, hasTwin, languageAlternates } from './alternates.ts';

export function sitemapEntries(
  origin: URL,
  pages: readonly string[] = DE_PAGES,
  entries: readonly SeoEntry[] = SEO_PAGES,
): MetadataRoute.Sitemap {
  return entries.flatMap((entry) => {
    const english = { url: new URL(entry.path, origin).href };
    if (!hasTwin(entry.path, pages)) return [english];
    const alternates = { languages: languageAlternates(entry.path, origin) };
    return [
      { ...english, alternates },
      { url: new URL(germanPath(entry.path), origin).href, alternates },
    ];
  });
}
