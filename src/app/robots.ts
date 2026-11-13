// robots.txt: the whole site may be crawled except the API, and the sitemap is named on the canonical
// origin. Pages kept out of search (/exclude, /demo) say so in their own robots meta tag, which a
// crawler can only read if it may fetch them. Built once at build time; it reads no request.
import type { MetadataRoute } from 'next';
import { canonicalOrigin } from '@/lib/seo/metadata';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: new URL('/sitemap.xml', canonicalOrigin()).href,
  };
}
