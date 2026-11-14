// The decision band: "Your call.", what I am looking for, three buttons and the About page's
// photograph (its image data, loaded lazily). The heading scales in from depth; the photograph
// drifts against the scroll. Server-safe.
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { HOME_DECISION } from '../../../content/home.ts';
import { aboutPhoto } from '../../../content/about-photo';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';

/** The rendered width of the photograph in CSS px; the optimiser serves it at this and twice this. */
const PHOTO_WIDTH = 480;

export function DecisionBand() {
  return (
    <section id="decide" data-home-decision="" aria-labelledby="decision-title" className="mt-12 md:mt-section grid items-center gap-10 md:grid-cols-12 md:gap-8">
      <div className="md:col-span-7">
        <h2 id="decision-title" data-depth-scale="" className="text-display-lg font-semibold">
          {HOME_DECISION.title}
        </h2>
        <p className="mt-6 max-w-text text-lg">{HOME_DECISION.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={CONTACT_HREF} variant="primary">
            {HOME_DECISION.write}
          </ButtonLink>
          <ButtonLink href={CV_LINK.href} variant="secondary">
            {HOME_DECISION.cv}
          </ButtonLink>
          <ButtonLink href={CONTACT.linkedin} variant="secondary" external>
            {HOME_DECISION.linkedin}
          </ButtonLink>
        </div>
      </div>
      <div data-depth-parallax="" style={{ '--p': 32 } as CSSProperties} className="md:col-span-5">
        <Image
          src={aboutPhoto.src}
          alt={aboutPhoto.alt}
          width={PHOTO_WIDTH}
          height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
          loading="lazy"
          className="h-auto w-full max-w-120 rounded-xl"
        />
      </div>
    </section>
  );
}
