'use client';

// The compact Menu (under lg): a <details>, so it opens and closes without JavaScript. Open, it is a
// sheet under the header, as wide as the screen: the details is not positioned, so the panel is placed
// against the header (relative where it does not stick, sticky from md on a tall screen; both count). With JavaScript, Escape
// and any navigation close it; Escape also returns focus to the summary.
// A reader can open the Menu before the page has hydrated (the <details> works from the first
// paint). Hydration must not close it under them: only a change of path does, never the first
// render. `data-ready` marks the Menu once its handlers are attached, so a test that checks what
// JavaScript adds (closing on a keyboard exit, Escape) can wait for it.
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Icon } from '@/components/kit/Icon';

const noSubscription = () => () => {};
/** How long a press released on a Menu link waits for its click before it ends. */
const LINK_CLICK_GRACE_MS = 1000;

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
    let settle: number | undefined;
    const closeUnlessFocusedWithin = () => {
      const el = details.current;
      if (el && !el.contains(el.ownerDocument.activeElement)) el.open = false;
    };
    const release = (event: PointerEvent) => {
      if (linkPress.current !== event.pointerId) return;
      const el = details.current;
      const outside = !(event.target instanceof Node) || !el?.contains(event.target);
      if (outside || event.type === 'pointercancel') {
        linkPress.current = null;
        closeUnlessFocusedWithin();
        return;
      }
      // Released on the link. On a touch screen WebKit (iOS Safari) fires the compatibility mousedown,
      // which blurs the summary, and then the click only after pointerup, so the press must outlast
      // pointerup or the blur closes the Menu and the click lands on the page underneath. The click
      // ends the press; if none comes, the press ends a moment later as a release elsewhere would.
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (linkPress.current !== event.pointerId) return;
        linkPress.current = null;
        closeUnlessFocusedWithin();
      }, LINK_CLICK_GRACE_MS);
    };
    const clicked = () => {
      window.clearTimeout(settle);
      linkPress.current = null;
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    window.addEventListener('click', clicked, true);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', release, true);
      window.removeEventListener('click', clicked, true);
    };
  }, []);

  return (
    <details
      ref={details}
      data-ready={ready ? '' : undefined}
      className="group lg:hidden"
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
        className="inline-flex min-h-(--size-target) min-w-(--size-target) cursor-pointer list-none items-center justify-center gap-1 rounded-md border border-hairline-strong bg-surface px-3 text-sm font-medium text-ink transition-colors group-open:border-ink marker:hidden [&::-webkit-details-marker]:hidden"
      >
        <span className="hidden xs:inline-flex">
          <Icon name="menu" />
        </span>
        Menu
      </summary>
      <nav
        aria-label="Menu"
        className="absolute inset-x-0 top-full z-(--z-menu) mt-px border-b border-hairline bg-bg px-4 pt-2 pb-6 md:px-8"
      >
        {children}
      </nav>
    </details>
  );
}
