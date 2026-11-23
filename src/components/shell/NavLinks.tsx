'use client';

// The four page links, labelled and addressed by the server (the Menu adds the CV and Contact buttons after them). A client component only for usePathname, which marks the current page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import { isCurrent, prefetchFor } from '@/lib/nav';

export type NavItem = { label: string; href: string };

export function NavLinks({ items, className }: { items: readonly NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {items.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={prefetchFor(item.href)}
              aria-current={current ? 'page' : undefined}
              data-touch-target
              className={cx(
                'inline-flex min-h-(--size-target) min-w-(--size-target) items-center text-sm font-medium transition-colors hover:text-ink focus-visible:text-ink',
                current ? 'text-ink' : 'text-muted',
              )}
            >
              <span className={cx('border-b-2 py-0.5', current ? 'border-ink' : 'border-transparent')}>
                {item.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
