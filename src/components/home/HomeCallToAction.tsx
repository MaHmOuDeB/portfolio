// The dark call to action that ends Home: the shared ink panel's words (the same as on every other
// page) with the About page's portrait at the right, loaded lazily. Server-safe.
import Image from 'next/image';
import { aboutPhoto } from '../../../content/about-photo';
import { CallToAction } from '@/components/frame';
import { PAGE_CTA } from '@/components/shell/PageCallToAction';
import { CONTACT_HREF, CV_LINK } from '@/lib/site';

/** The rendered width of the portrait in CSS px; the optimiser serves it at this and twice this. */
const PHOTO_WIDTH = 480;

export function HomeCallToAction() {
  return (
    <div data-home-cta="" data-rule="" className="pb-12 pt-12 md:pb-16 md:pt-16">
      <CallToAction
        id="cta-title"
        title={PAGE_CTA.title}
        quiet={PAGE_CTA.quiet}
        line={PAGE_CTA.line}
        primary={{ label: PAGE_CTA.write, href: CONTACT_HREF }}
        secondary={{ label: PAGE_CTA.cv, href: CV_LINK.href }}
        media={
          <Image
            src={aboutPhoto.src}
            alt={aboutPhoto.alt}
            width={PHOTO_WIDTH}
            height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
            loading="lazy"
            className="ml-auto h-auto w-full max-w-90 rounded-xl"
          />
        }
      />
    </div>
  );
}
