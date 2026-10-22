'use client';

// The four page links. A client component only for usePathname, which marks the current page.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/cx';
import { isCurrent, prefetchFor } from '@/lib/nav';
import { NAV } from '@/lib/site';

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {NAV.map((item) => {
        const current = isCurrent(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={prefetchFor(item.href)}
              aria-current={current ? 'page' : undefined}
              data-touch-target
              className={cx(
                'inline-flex min-h-(--size-target) items-center text-sm font-medium transition-colors hover:text-ink focus-visible:text-ink',
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
