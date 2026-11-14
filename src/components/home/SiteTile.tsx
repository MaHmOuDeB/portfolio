// "This site is part of the evidence": the sentence, then the note on what the live test is doing
// (the existing LiveNote, unchanged, which the privacy text refers to), then the two buttons.
// Server-safe: it takes the Home model only to hand it to the note.
import { HOME_SITE } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { Tile } from '@/components/depth/Tile';
import { ButtonLink } from '@/components/kit/ButtonLink';
import type { HomeModel } from '@/lib/home/model';
import { LiveNote } from './LiveNote';

export function SiteTile({ model }: { model: HomeModel }) {
  // Called as a function so an absent note (before the start) leaves no empty box in the page.
  const note = LiveNote({ model });
  return (
    <Tile data-home-site="" data-depth-rise="">
      <h3 className="max-w-text text-display-sm font-semibold">{HOME_SITE.title}</h3>
      <p className="mt-4 max-w-text text-lg">{HOME_SITE.text}</p>
      {note !== null ? (
        <div data-home-note="" className="mt-6 max-w-text">
          {note}
        </div>
      ) : null}
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
