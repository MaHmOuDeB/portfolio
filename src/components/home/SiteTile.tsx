// "This site is part of the evidence": the sentence, then the two buttons. The note on what the live
// test is doing sits once, in the tag above the experiment cards, so this tile holds no second copy.
// The same for every visitor and every state. Server-safe.
import { HOME_SITE } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { Tile } from '@/components/depth/Tile';
import { ButtonLink } from '@/components/kit/ButtonLink';

export function SiteTile() {
  return (
    <Tile data-home-site="" data-depth-rise="">
      <h3 className="max-w-text text-display-sm font-semibold">{HOME_SITE.title}</h3>
      <p className="mt-4 max-w-text text-lg">{HOME_SITE.text}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href={HOME_LINKS.experiment} variant="primary">
          {HOME_SITE.live}
        </ButtonLink>
        <ButtonLink href={HOME_LINKS.lab} variant="secondary">
          {HOME_SITE.lab}
        </ButtonLink>
      </div>
    </Tile>
  );
}
