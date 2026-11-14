// A link drawn as a button: a compact rectangle with an 8 px radius (the framed look), still at least
// 44 px high. Hover is a colour change only. Server-safe, no hooks.
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
  /** Tighter side padding (12 px, not 14), for a crowded row such as the header. */
  compact?: boolean;
  /** On an ink panel: the primary is white with ink text, the secondary clear with a hairline on ink. */
  onInk?: boolean;
  children: ReactNode;
};

const BASE =
  'inline-flex min-h-(--size-target) max-w-full items-center justify-center gap-2 rounded-md whitespace-normal text-sm font-medium transition-colors';
const VARIANT = {
  primary: 'border border-ink bg-ink text-surface hover:border-muted hover:bg-muted focus-visible:border-muted focus-visible:bg-muted',
  secondary: 'border border-hairline-strong bg-surface text-ink hover:border-ink focus-visible:border-ink',
} as const;
const ON_INK = {
  primary: 'border border-surface bg-surface text-ink hover:border-line hover:bg-line focus-visible:border-line focus-visible:bg-line',
  secondary: 'border border-rule-on-ink text-surface hover:border-surface focus-visible:border-surface',
} as const;

/** The class list of a button, for a real `<button>` that must look like a ButtonLink. */
export function buttonClass(variant: keyof typeof VARIANT, compact = false, onInk = false): string {
  return cx(BASE, compact ? 'px-3' : 'px-3.5', (onInk ? ON_INK : VARIANT)[variant]);
}

export function ButtonLink({ href, variant, icon, download, external, compact, onInk, children }: Props) {
  const className = buttonClass(variant, compact, onInk);
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
