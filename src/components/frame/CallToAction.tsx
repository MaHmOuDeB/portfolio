// The ink panel that ends a page: an h2 with an optional quiet clause, one line, a primary and a
// secondary button (the on-ink variants), an optional quiet text link after them (on a phone it takes
// its own row under the buttons) and an optional media slot at the right, such as the
// portrait. With media the panel is a pointer scene: the media drifts in from the top right, and on a
// fine pointer the media and the text shift a little in opposite directions. All text comes from the
// caller.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { prefetchFor } from '@/lib/nav';
import { Quiet } from './Quiet';

type Action = { label: ReactNode; href: string; external?: boolean };

export type CallToActionProps = {
  id: string;
  title: ReactNode;
  quiet?: ReactNode;
  line: ReactNode;
  primary: Action;
  /** Left out where the second button would link to the page it is on. */
  secondary?: Action;
  /** A quiet text link after the two buttons, such as LinkedIn. */
  tertiary?: Action;
  media?: ReactNode;
};

// The on-ink link tone of the footer (8.27:1 on ink), a quiet underline, light on hover and focus; a
// 44 px target. On a phone it takes the full row, so it sits under the buttons.
const QUIET_LINK =
  'inline-flex min-h-(--size-target) min-w-(--size-target) basis-full items-center text-on-ink underline decoration-on-ink-muted transition-colors hover:text-surface focus-visible:text-surface sm:basis-auto sm:ml-2';

function QuietLink({ label, href, external }: Action) {
  return external ? (
    <a href={href} rel="noopener" data-cta-quiet-link="" data-touch-target="" className={QUIET_LINK}>
      {label}
    </a>
  ) : (
    <Link href={href} prefetch={prefetchFor(href)} data-cta-quiet-link="" data-touch-target="" className={QUIET_LINK}>
      {label}
    </Link>
  );
}

export function CallToAction({ id, title, quiet, line, primary, secondary, tertiary, media }: CallToActionProps) {
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
        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <ButtonLink href={primary.href} variant="primary" external={primary.external} onInk>
            {primary.label}
          </ButtonLink>
          {secondary ? (
            <ButtonLink href={secondary.href} variant="secondary" external={secondary.external} onInk>
              {secondary.label}
            </ButtonLink>
          ) : null}
          {tertiary ? <QuietLink {...tertiary} /> : null}
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
