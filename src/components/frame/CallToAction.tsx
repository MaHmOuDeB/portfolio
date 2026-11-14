// The ink panel that ends a page: an h2 with an optional quiet clause, one line, a primary and a
// secondary button (the on-ink variants) and an optional media slot at the right, such as the
// portrait. With media the panel is a pointer scene: the media drifts in from the top right, and on a
// fine pointer the media and the text shift a little in opposite directions. All text comes from the
// caller.
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { Quiet } from './Quiet';

type Action = { label: ReactNode; href: string; external?: boolean };

export type CallToActionProps = {
  id: string;
  title: ReactNode;
  quiet?: ReactNode;
  line: ReactNode;
  primary: Action;
  secondary: Action;
  media?: ReactNode;
};

export function CallToAction({ id, title, quiet, line, primary, secondary, media }: CallToActionProps) {
  return (
    <section data-cta="" data-ink="" data-depth-follow={media ? '' : undefined} aria-labelledby={id} className="rounded-xl bg-ink text-on-ink">
      <div data-cta-text="">
        <h2 id={id} className="text-h2-sm text-surface md:text-h2">
          {title}
          {quiet ? (
            <>
              {' '}
              <Quiet>{quiet}</Quiet>
            </>
          ) : null}
        </h2>
        <p className="mt-3.5 max-w-[30em]">{line}</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <ButtonLink href={primary.href} variant="primary" external={primary.external} onInk>
            {primary.label}
          </ButtonLink>
          <ButtonLink href={secondary.href} variant="secondary" external={secondary.external} onInk>
            {secondary.label}
          </ButtonLink>
        </div>
      </div>
      {media ? (
        <div data-cta-media="" data-depth-drift="tr">
          {media}
        </div>
      ) : null}
    </section>
  );
}
