// A link drawn as a button. Hover is a colour change only. Server-safe, no hooks.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { prefetchFor } from '@/lib/nav';
import { Icon, type IconName } from './Icon';

type Props = {
  href: string;
  variant: 'primary' | 'secondary';
  icon?: IconName;
  /** A file download: a plain anchor with the download attribute. */
  download?: boolean;
  /** Another site: a plain anchor with rel="noopener". */
  external?: boolean;
  /** Tighter side padding (12 px, not 16), for a crowded row such as the phone header. */
  compact?: boolean;
  children: ReactNode;
};

const BASE =
  'inline-flex min-h-(--size-target) max-w-full items-center justify-center gap-2 rounded-sm whitespace-normal text-sm font-medium transition-colors';
const VARIANT = {
  primary: 'bg-ink text-bg hover:bg-muted focus-visible:bg-muted',
  secondary: 'border border-muted text-ink hover:bg-line focus-visible:bg-line',
} as const;

/** The class list of a button, for a real `<button>` that must look like a ButtonLink. */
export function buttonClass(variant: keyof typeof VARIANT, compact = false): string {
  return cx(BASE, compact ? 'px-3' : 'px-4', VARIANT[variant]);
}

export function ButtonLink({ href, variant, icon, download, external, compact, children }: Props) {
  const className = buttonClass(variant, compact);
  const content = (
    <>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </>
  );
  if (download || external || !href.startsWith('/')) {
    return (
      <a
        href={href}
        className={className}
        data-touch-target
        download={download ? '' : undefined}
        rel={external ? 'noopener' : undefined}
      >
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetchFor(href)} className={className} data-touch-target>
      {content}
    </Link>
  );
}
