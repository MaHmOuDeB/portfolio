// The Home hero scene: the headline, the sub line and three buttons on the left, the evidence field
// on the right. The scene is the section the field turns in as it scrolls away; its text block
// recedes with it. The h1 has no animation attribute (it is the largest contentful paint); the sub
// line and the buttons settle in order once on load. The primary button follows a fine pointer a
// few pixels (the magnet). The same for every visitor. Server-safe.
import type { CSSProperties, ReactNode } from 'react';
import { HOME_HERO, WORK_ANCHOR } from '../../../content/home.ts';
import { EvidenceField } from '@/components/depth/EvidenceField';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { CONTACT_HREF, CV_LINK } from '@/lib/site';

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

export function Hero() {
  return (
    <section data-hero="" data-depth-scene="" aria-labelledby="hero-title" className="grid items-center gap-y-10 pt-8 md:pt-12 lg:grid-cols-12 lg:gap-x-8">
      <div data-hero-text="" data-depth-recede="" className="lg:col-span-6">
        <h1 id="hero-title" className="text-display-sm font-semibold md:text-display lg:text-display-lg">
          {HOME_HERO.title}
        </h1>
        <p data-hero-sub="" data-depth-load="" style={order(0)} className="mt-6 max-w-text text-lg text-muted md:text-xl">
          {HOME_HERO.sub}
        </p>
        <div data-hero-actions="" className="mt-8 flex flex-wrap gap-3">
          <Step d={1} magnet>
            <ButtonLink href={`#${WORK_ANCHOR}`} variant="primary">
              {HOME_HERO.evidence}
            </ButtonLink>
          </Step>
          <Step d={2}>
            <ButtonLink href={CV_LINK.href} variant="secondary">
              {HOME_HERO.cv}
            </ButtonLink>
          </Step>
          <Step d={3}>
            <ButtonLink href={CONTACT_HREF} variant="secondary">
              {HOME_HERO.contact}
            </ButtonLink>
          </Step>
        </div>
      </div>
      <div data-hero-field="" className="min-w-0 lg:col-span-6">
        <EvidenceField />
      </div>
    </section>
  );
}
