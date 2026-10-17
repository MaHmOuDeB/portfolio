// An inline link: muted with a muted underline, ink on hover and focus. Server-safe, no hooks.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

type Props = {
  href: string;
  /** On its own line or in a row of links: at least 44 px tall. */
  standalone?: boolean;
  /** Another site: rel="noopener" and the external icon (unless `icon` already marks the link). */
  external?: boolean;
  /** A leading icon, for a link whose icon names it (mail, LinkedIn, GitHub). */
  icon?: IconName;
  children: ReactNode;
};

const BASE = 'text-muted underline decoration-muted hover:text-ink focus-visible:text-ink';
const STANDALONE = 'inline-flex min-h-(--size-target) items-center gap-2';

export function TextLink({ href, standalone, external, icon, children }: Props) {
  const className = cx(BASE, standalone && STANDALONE);
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {external && !icon ? <Icon name="external" /> : null}
    </>
  );
  // mailto:, https:// and other schemes are plain anchors; only site paths go through next/link.
  if (external || !href.startsWith('/')) {
    return (
      <a
        href={href}
        className={className}
        data-touch-target={standalone ? '' : undefined}
        rel={external ? 'noopener' : undefined}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className} data-touch-target={standalone ? '' : undefined}>
      {content}
    </Link>
  );
}
