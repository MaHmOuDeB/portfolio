// A link drawn as a button. Hover is a colour change only. Server-safe, no hooks.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

type Props = {
  href: string;
  variant: 'primary' | 'secondary';
  icon?: IconName;
  /** A file download: a plain anchor with the download attribute. */
  download?: boolean;
  /** Another site: a plain anchor with rel="noopener". */
  external?: boolean;
  children: ReactNode;
};

const BASE =
  'inline-flex min-h-(--size-target) items-center justify-center gap-2 rounded-sm px-4 whitespace-nowrap text-sm font-medium transition-colors';
const VARIANT = {
  primary: 'bg-ink text-bg hover:bg-muted focus-visible:bg-muted',
  secondary: 'border border-muted text-ink hover:bg-line focus-visible:bg-line',
} as const;

/** The class list of a button, for a real `<button>` that must look like a ButtonLink. */
export function buttonClass(variant: keyof typeof VARIANT): string {
  return cx(BASE, VARIANT[variant]);
}

export function ButtonLink({ href, variant, icon, download, external, children }: Props) {
  const className = buttonClass(variant);
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
    <Link href={href} className={className} data-touch-target>
      {content}
    </Link>
  );
}
