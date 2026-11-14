// A link drawn as a tile that rises on entry and leans toward a fine pointer. A server component:
// the lean itself is the one delegated listener in Lean. Extra data-* attributes go onto the link
// (the Home page puts its tracking attributes there). The link is named by its h3 alone and described
// by the paragraph, so a screen reader does not read the whole card as the link's name.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

export type LeanCardProps = DataAttributes & {
  href: string;
  title: ReactNode;
  /** Keeps the headline area at least this many lines tall, so cards in a row line up. */
  titleMinLines?: number;
  /** The sourced line under the description; a node so that a figure in it can be a <Fact>. */
  meta: ReactNode;
  children: ReactNode;
  size?: 'lg' | 'md';
  /** The prefix of the ids that name and describe the link; by default the slug of `href`, so it needs no hook. */
  idBase?: string;
  /** Links to the home page must not prefetch: pass false there. */
  prefetch?: boolean;
};

export function LeanCard({ href, title, titleMinLines, meta, children, size = 'lg', prefetch, idBase, ...rest }: LeanCardProps) {
  // A server component, and the Home tests call it as a plain function, so the ids come from the href
  // (each card on a page links to its own destination) rather than from useId.
  const id = idBase ?? `card-${href.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-depth-lean=""
      data-depth-rise=""
      data-tile=""
      data-size={size}
      {...rest}
    >
      <h3 id={titleId} style={titleMinLines ? { minHeight: `${titleMinLines}lh` } : undefined}>
        {title}
      </h3>
      <p id={descriptionId}>{children}</p>
      <span data-depth-meta="">{meta}</span>
      <span data-depth-go="" aria-hidden="true">
        +
      </span>
    </Link>
  );
}
