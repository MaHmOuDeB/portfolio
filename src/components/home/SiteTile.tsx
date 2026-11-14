// The site band: "This site is part of the evidence." as a white card on the frame, with the chip
// "Live test", the sentence, two buttons and a tilted sketch of a confidence chart at the right (an
// illustration, decorative). The note on what the live test is doing sits once, in the live bar at
// the top of the page, so this band holds no second copy. The same for every visitor and every
// state. Server-safe.
import { HOME_SITE, HOME_SITE_HEAD } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { Tile } from '@/components/depth/Tile';
import { Chip, Quiet } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { ConfidenceSketch } from '@/components/frame/sketches';

const TITLE_ID = 'site-title';

export function SiteTile() {
  return (
    <section data-home-site="" data-rule="" aria-labelledby={TITLE_ID} className="py-2.5">
      <Tile>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Chip dot="live">{HOME_SITE_HEAD.chip}</Chip>
            <h2 id={TITLE_ID} className="mt-4.5 text-h2-sm text-balance md:text-h2">
              {HOME_SITE_HEAD.title} <Quiet>{HOME_SITE_HEAD.quiet}</Quiet>
            </h2>
            <p data-home-site-text="" className="mt-3.5 max-w-[30em] text-muted">
              {HOME_SITE.text}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <ButtonLink href={HOME_LINKS.experiment} variant="primary">
                {HOME_SITE.live}
              </ButtonLink>
              <ButtonLink href={HOME_LINKS.lab} variant="secondary">
                {HOME_SITE.lab}
              </ButtonLink>
            </div>
          </div>
          <div className="overflow-clip rounded-xl border border-hairline lg:transform-[perspective(56rem)_rotateY(-14deg)_rotateX(6deg)] [&>[data-vignette]]:h-60 [&>[data-vignette]]:border-t-0">
            <ConfidenceSketch />
          </div>
        </div>
      </Tile>
    </section>
  );
}
