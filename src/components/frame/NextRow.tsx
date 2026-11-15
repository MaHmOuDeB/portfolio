// The previous and the next project as two quiet cards in one row (stacked on a phone), inside a
// navigation landmark. Each card is a link: a small kicker ("Previous", "Next") and the project's
// name. A lone next card keeps the second column. As a clickable card it turns its border ink and
// underlines the name on hover, focus and press, and rises 4 px where motion is allowed.
import type { ReactNode } from 'react';
import { FrameLink } from './FrameLink';

export type NextRowLink = { href: string; label: ReactNode; kicker?: ReactNode };

export type NextRowProps = {
  prev?: NextRowLink;
  next?: NextRowLink;
  /** The landmark's accessible name. */
  label?: string;
};

export function NextRow({ prev, next, label = 'More work' }: NextRowProps) {
  if (!prev && !next) return null;
  return (
    <nav aria-label={label} data-next-row="">
      {prev ? (
        <FrameLink href={prev.href} data-next="prev" data-touch-target="">
          <span data-next-kicker="">{prev.kicker ?? 'Previous'}</span>
          <span data-next-label="">{prev.label}</span>
        </FrameLink>
      ) : null}
      {next ? (
        <FrameLink href={next.href} data-next="next" data-touch-target="">
          <span data-next-kicker="">{next.kicker ?? 'Next'}</span>
          <span data-next-label="">{next.label}</span>
        </FrameLink>
      ) : null}
    </nav>
  );
}
