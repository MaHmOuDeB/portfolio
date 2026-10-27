'use client';

// The phone Menu: a <details>, so it opens and closes without JavaScript. With JavaScript, Escape
// and any navigation close it; Escape also returns focus to the summary.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/kit/Icon';

export function MenuDisclosure({ children }: { children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (details.current) details.current.open = false;
  }, [pathname]);

  return (
    <details
      ref={details}
      className="relative md:hidden"
      onBlur={(event) => {
        const el = event.currentTarget;
        const next = event.relatedTarget;
        if (next instanceof Node) {
          if (!el.contains(next)) el.open = false;
          return;
        }
        // A blur with no destination can precede another focus move in the same turn.
        queueMicrotask(() => {
          if (el.isConnected && !el.contains(el.ownerDocument.activeElement)) el.open = false;
        });
      }}
      onKeyDown={(event) => {
        const el = details.current;
        if (event.key !== 'Escape' || !el?.open) return;
        el.open = false;
        el.querySelector('summary')?.focus();
      }}
      onClick={(event) => {
        // A link to the page already open does not change the pathname, so close on any link.
        if (event.target instanceof Element && event.target.closest('a') && details.current) {
          details.current.open = false;
        }
      }}
    >
      <summary
        data-touch-target
        className="inline-flex min-h-(--size-target) min-w-(--size-target) cursor-pointer list-none items-center justify-center gap-1 rounded-sm px-2 text-sm font-medium text-ink marker:hidden [&::-webkit-details-marker]:hidden"
      >
        <span className="hidden xs:inline-flex">
          <Icon name="menu" />
        </span>
        Menu
      </summary>
      <nav
        aria-label="Menu"
        className="absolute top-full right-0 z-(--z-menu) mt-2 min-w-48 rounded-md border border-line bg-bg px-4 py-2"
      >
        {children}
      </nav>
    </details>
  );
}
