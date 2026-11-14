'use client';

// The compact Menu (under lg): a <details>, so it opens and closes without JavaScript. With JavaScript, Escape
// and any navigation close it; Escape also returns focus to the summary.
// A reader can open the Menu before the page has hydrated (the <details> works from the first
// paint). Hydration must not close it under them: only a change of path does, never the first
// render. `data-ready` marks the Menu once its handlers are attached, so a test that checks what
// JavaScript adds (closing on a keyboard exit, Escape) can wait for it.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from '@/components/kit/Icon';

const noSubscription = () => () => {};

export function MenuDisclosure({ children }: { children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const linkPress = useRef<number | null>(null);
  const pathname = usePathname();
  // The path the Menu was last shown for: the first effect after hydration sees no change.
  const shownFor = useRef(pathname);
  // False on the server and while hydrating, true once this component runs in the browser.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);

  useEffect(() => {
    if (shownFor.current === pathname) return;
    shownFor.current = pathname;
    if (details.current) details.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (linkPress.current !== event.pointerId) return;
      linkPress.current = null;
      const el = details.current;
      const outside = !(event.target instanceof Node) || !el?.contains(event.target);
      if (el && (outside || event.type === 'pointercancel') && !el.contains(el.ownerDocument.activeElement)) {
        el.open = false;
      }
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => {
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
    };
  }, []);

  return (
    <details
      ref={details}
      data-ready={ready ? '' : undefined}
      className="relative lg:hidden"
      onPointerDown={(event) => {
        if (event.button === 0 && event.target instanceof Element && event.target.closest('a')) {
          linkPress.current = event.pointerId;
        }
      }}
      onBlur={(event) => {
        // WebKit can blur the summary without focusing the pressed link. Keep it clickable.
        if (linkPress.current !== null) return;
        const el = event.currentTarget;
        const next = event.relatedTarget;
        if (next instanceof Node) {
          if (!el.contains(next)) el.open = false;
          return;
        }
        // A blur with no destination can precede another focus move in the same turn.
        queueMicrotask(() => {
          if (linkPress.current === null && el.isConnected && !el.contains(el.ownerDocument.activeElement)) el.open = false;
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
        className="absolute top-full right-0 z-(--z-menu) mt-2 w-48 max-w-[calc(100vw_-_8*var(--spacing))] rounded-md border border-line bg-bg px-4 py-2"
      >
        {children}
      </nav>
    </details>
  );
}
