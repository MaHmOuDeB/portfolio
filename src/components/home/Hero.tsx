// The Home hero, centred: the chip, the site's line in two tones as the h1, the sub line with two
// inline chips, two buttons and one muted proof line with a quiet link to the work (the CV page, quiet; Contact, primary). The h1 has no animation
// attribute (it is the largest contentful paint); the sub line and the buttons settle in order once
// on load, and the primary button follows a fine pointer a few pixels (the magnet). The band with the
// stack follows it. The same for every visitor. Server-safe.
import type { CSSProperties, ReactNode } from 'react';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { StackBand } from '@/components/depth/StackBand';
import { Chip } from '@/components/frame/Chip';
import { Quiet } from '@/components/frame/Quiet';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT_HREF, CV_LINK } from '@/lib/site';
import { homeCopy } from './copy';
import { Parts } from './Parts';

const order = (d: number): CSSProperties => ({ '--d': d }) as CSSProperties;

function Step({ d, children, magnet = false }: { d: number; children: ReactNode; magnet?: boolean }) {
  return (
    <span data-depth-load="" style={order(d)} className="inline-flex">
      {magnet ? (
        <span data-depth-magnet="" className="inline-flex">
          {children}
        </span>
      ) : (
        children
      )}
    </span>
  );
}

export function Hero({ locale = 'en' }: { locale?: Locale } = {}) {
  const hero = homeCopy(locale).hero;
  const { sub } = hero;
  return (
    <>
      <section data-hero="" aria-labelledby="hero-title">
        <Chip dot="ok">{hero.chip}</Chip>
        <h1 id="hero-title" className="text-display-sm xs:text-display md:text-display-lg">
          {hero.headline.lead} <Quiet>{hero.headline.quiet}</Quiet>
        </h1>
        <p data-hero-sub="" data-depth-load="" style={order(0)}>
          {sub.lead}
          <Chip inline>{sub.chips[0]}</Chip>
          {sub.join}
          {/* The second chip and the words up to the first comma never break apart (from sm up; a phone
              wraps freely); the rest of the sentence wraps as text. */}
          <span data-hero-tail="">
            <Chip inline>{sub.chips[1]}</Chip>
            {sub.end}
          </span>
          {sub.rest}
        </p>
        <div data-hero-actions="">
          <Step d={1}>
            <ButtonLink href={localHref(locale, CV_LINK.href)} variant="secondary">
              {hero.cv}
            </ButtonLink>
          </Step>
          <Step d={2} magnet>
            <ButtonLink href={localHref(locale, CONTACT_HREF)} variant="primary">
              {hero.contact}
            </ButtonLink>
          </Step>
        </div>
        {/* Proof under the buttons: small and muted, so it never outweighs the h1. */}
        <p data-hero-proof="">
          <Parts parts={hero.proof} locale={locale} /> <TextLink href={localHref(locale, HOME_LINKS.work)}>{hero.work}</TextLink>
        </p>
      </section>
      <StackBand copy={homeCopy(locale).band} />
    </>
  );
}
