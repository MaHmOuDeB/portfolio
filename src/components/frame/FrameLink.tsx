// A plain link of the frame: a site path goes through next/link, anything else (an in-page anchor,
// another site) is a plain anchor. Extra attributes go onto the link.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { prefetchFor } from '@/lib/nav';

type Props = { href: string; children: ReactNode; [attr: `data-${string}`]: string | undefined };

export function FrameLink({ href, children, ...rest }: Props) {
  if (!href.startsWith('/')) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetchFor(href)} {...rest}>
      {children}
    </Link>
  );
}
