// The title of an entry in a list of destinations (Work, the interview page's Lab links): a link in
// ink with the muted underline, so the title is the row's first read and the line under it, in muted
// grey, comes second. The kit's TextLink is muted, for links inside running text and rows of links.
// A 44 px target. Server-safe, no hooks; site paths go through next/link with the site's prefetch rule.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { prefetchFor } from '@/lib/nav';

export const TITLE_LINK =
  'inline-flex min-h-(--size-target) min-w-(--size-target) max-w-full items-center wrap-anywhere text-ink underline decoration-muted hover:decoration-ink focus-visible:decoration-ink';

export function TitleLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} prefetch={prefetchFor(href)} className={TITLE_LINK} data-touch-target="">
      {children}
    </Link>
  );
}
