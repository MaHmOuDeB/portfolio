// The Home hero, the same for every visitor: the name across the page, then (from lg) the identity
// in 7 of 12 columns and the evidence slot, the sample-size planner, in the other 5. On phones the
// name is 44 px and the role line 20 px, and the CV link stays in the header instead of repeating
// here. "El Bergui" is joined by a non-breaking space, so the surname never splits. Server-safe.
import { HOME_HERO } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT, CV_LINK, SITE } from '@/lib/site';
import { HeroSimulator } from './HeroSimulator';
import { Parts } from './Parts';

const NAME = SITE.name.replace('El Bergui', 'El\u00a0Bergui');

export function Hero() {
  return (
    <section data-hero="" aria-labelledby="hero-name" className="pt-8 md:pt-12">
      <h1 id="hero-name" className="text-display-sm font-semibold md:text-display">
        {NAME}
      </h1>
      <div data-hero-columns="" className="mt-6 grid gap-y-8 lg:grid-cols-12 lg:gap-x-8">
        <div data-hero-identity="" className="lg:col-span-7">
          <p data-hero-role="" className="text-lg font-semibold md:text-xl">
            {HOME_HERO.role}
          </p>
          <p data-hero-place="" className="mt-1 text-base text-muted">
            {HOME_HERO.place}
          </p>
          <p data-hero-proof="" className="mt-4 max-w-text text-base">
            <Parts parts={HOME_HERO.proof} />{' '}
            <span className="whitespace-nowrap">
              <TextLink href={HOME_LINKS.whySoMany}>{HOME_HERO.whySoMany}</TextLink>
            </span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={HOME_LINKS.lab} variant="primary">
              {HOME_HERO.lab}
            </ButtonLink>
            <div data-hero-cv="" className="hidden md:block">
              <ButtonLink href={CV_LINK.href} variant="secondary">
                {CV_LINK.label}
              </ButtonLink>
            </div>
            <ButtonLink href={CONTACT.linkedin} variant="secondary" external>
              {HOME_HERO.linkedin}
            </ButtonLink>
          </div>
        </div>
        <div data-hero-evidence="" className="min-w-0 border-t border-line pt-6 lg:col-span-5">
          <HeroSimulator />
        </div>
      </div>
    </section>
  );
}
