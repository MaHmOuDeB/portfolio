// The sitemap: every page in the SEO manifest (content/seo.ts), on the canonical origin. The
// excluded pages, the per-group Home pages, the API, data.json and the kitchen sink are never in it.
// Built once at build time; it reads no request.
import type { MetadataRoute } from 'next';
import { canonicalOrigin } from '@/lib/seo/metadata';
import { SEO_PAGES } from '../../content/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = canonicalOrigin();
  return SEO_PAGES.map((entry) => ({ url: new URL(entry.path, origin).href }));
}
