// The sitemap: every page in the SEO manifest (content/seo.ts), on the canonical origin, and the German
// twin of each page in the German registry, with the hreflang alternates of both. The excluded pages,
// the per-group Home pages, the API, data.json and the kitchen sink are never in it. Built once at
// build time; it reads no request.
import type { MetadataRoute } from 'next';
import { canonicalOrigin } from '@/lib/seo/metadata';
import { sitemapEntries } from '@/lib/seo/sitemap';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries(canonicalOrigin());
}
