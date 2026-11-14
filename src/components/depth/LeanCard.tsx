// A link drawn as a tile that rises on entry and leans toward a fine pointer. A server component:
// the lean itself is the one delegated listener in Lean. Extra data-* attributes go onto the link
// (the Home page puts its tracking attributes there).
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

export type LeanCardProps = DataAttributes & {
  href: string;
  title: ReactNode;
  /** Keeps the headline area at least this many lines tall, so cards in a row line up. */
  titleMinLines?: number;
  meta: string;
  children: ReactNode;
  size?: 'lg' | 'md';
  /** Links to the home page must not prefetch: pass false there. */
  prefetch?: boolean;
};

export function LeanCard({ href, title, titleMinLines, meta, children, size = 'lg', prefetch, ...rest }: LeanCardProps) {
  return (
    <Link href={href} prefetch={prefetch} data-depth-lean="" data-depth-rise="" data-tile="" data-size={size} {...rest}>
      <h3 style={titleMinLines ? { minHeight: `${titleMinLines}lh` } : undefined}>{title}</h3>
      <p>{children}</p>
      <span data-depth-meta="">{meta}</span>
      <span data-depth-go="" aria-hidden="true">
        +
      </span>
    </Link>
  );
}
