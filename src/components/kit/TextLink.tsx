// An inline link: muted with a muted underline, ink on hover and focus. Server-safe, no hooks.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { prefetchFor } from '@/lib/nav';
import { Icon, type IconName } from './Icon';

type Props = {
  href: string;
  /** On its own line or in a row of links: at least 44 × 44 CSS px. */
  standalone?: boolean;
  /** Another site: rel="noopener" and the external icon (unless `icon` already marks the link). */
  external?: boolean;
  /** A leading icon, for a link whose icon names it (mail, LinkedIn, GitHub). */
  icon?: IconName;
  /** Overrides the accessible name when the visible text is shorter than the full action. */
  'aria-label'?: string;
  children: ReactNode;
};

const BASE = 'text-muted underline decoration-muted hover:text-ink focus-visible:text-ink';
const STANDALONE = 'inline-flex min-h-(--size-target) min-w-(--size-target) max-w-full items-center gap-2 wrap-anywhere';

export function TextLink({ href, standalone, external, icon, children, 'aria-label': ariaLabel }: Props) {
  const className = cx(BASE, standalone && STANDALONE);
  // Preflight draws an svg as a block, which would break a link in running text over three lines; a
  // standalone link is inline-flex already, so only the inline one wraps its icon.
  const mark = (name: IconName) =>
    standalone ? (
      <Icon name={name} />
    ) : (
      <span className="inline-flex align-middle">
        <Icon name={name} />
      </span>
    );
  const content = (
    <>
      {icon ? mark(icon) : null}
      {children}
      {external && !icon ? mark('external') : null}
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
        aria-label={ariaLabel}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetchFor(href)} className={className} data-touch-target={standalone ? '' : undefined} aria-label={ariaLabel}>
      {content}
    </Link>
  );
}
