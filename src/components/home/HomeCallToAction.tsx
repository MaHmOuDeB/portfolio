// The dark call to action that ends Home: the shared ink panel's words (the same as on every other
// page) with the About page's portrait at the right, loaded lazily. Server-safe.
import Image from 'next/image';
import { aboutPhoto } from '../../../content/about-photo';
import { CallToAction } from '@/components/frame';
import { PAGE_CTA } from '@/components/shell/PageCallToAction';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';
import { homeCopy } from './copy';

/** The rendered width of the portrait in CSS px; the optimiser serves it at this and twice this. */
const PHOTO_WIDTH = 480;

export function HomeCallToAction({ locale = 'en' }: { locale?: Locale } = {}) {
  const copy = homeCopy(locale);
  const cta = copy.cta ?? PAGE_CTA;
  return (
    <div data-home-cta="" data-rule="" className="pb-12 pt-12 md:pb-16 md:pt-16">
      <CallToAction
        id="cta-title"
        title={cta.title}
        quiet={cta.quiet}
        line={cta.line}
        primary={{ label: cta.write, href: localHref(locale, CONTACT_HREF) }}
        secondary={{ label: cta.cv, href: localHref(locale, CV_LINK.href) }}
        tertiary={{ label: cta.linkedin, href: CONTACT.linkedin, external: true }}
        media={
          // The focus pull: the frame opens from a smaller inset while the photo settles from a little
          // larger, so the portrait comes into focus without a blur.
          <div data-depth-focus="" className="ml-auto w-full max-w-90 rounded-xl">
            <Image
              src={aboutPhoto.src}
              alt={copy.photoAlt ?? aboutPhoto.alt}
              width={PHOTO_WIDTH}
              height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
              loading="lazy"
              className="h-auto w-full rounded-xl"
            />
          </div>
        }
      />
    </div>
  );
}
