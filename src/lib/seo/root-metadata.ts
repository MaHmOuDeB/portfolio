// The defaults every page starts from, shared by the root layouts. canonicalOrigin() runs at build
// time and fails a production build that cannot name its canonical origin. There is no canonical
// here: each public page sets its own (content/seo.ts), and a page without one (the 404 page,
// /exclude) has none.
import type { Metadata } from 'next';
import { ogCard } from '../../../content/seo.ts';
import { SITE } from '../site.ts';
import { OG_LOCALE } from './alternates.ts';
import { canonicalOrigin } from './metadata.ts';
import { OG_HEIGHT, OG_WIDTH, ogAlt } from './og-template.ts';

export function rootMetadata(): Metadata {
  const origin = canonicalOrigin();
  const siteImage = { url: new URL('/og/site.png', origin).href, alt: ogAlt(ogCard('site')) };
  return {
    metadataBase: origin,
    title: SITE.name,
    description: 'AI automation and experimentation analyst in Berlin.',
    openGraph: {
      type: 'website',
      siteName: SITE.name,
      locale: OG_LOCALE.en,
      images: [{ ...siteImage, width: OG_WIDTH, height: OG_HEIGHT, type: 'image/png' }],
    },
    twitter: { card: 'summary_large_image', images: [siteImage] },
  };
}
