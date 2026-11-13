'use client';

// Shows a Figure's server-rendered preview and swaps in its interactive island on intent: the
// first pointer entering it, focus moving into it, or idle time after the page has loaded (with a
// 2 s timeout). The island is a lazy component, so its code is fetched only then and never delays
// the largest paint.
//
// - The preview stays on screen while the island's code loads: the island mounts beside it, inside
//   its own Suspense boundary with no fallback, and in the commit where it appears a layout effect
//   removes the preview, before the browser paints. The preview is never remounted, so nothing
//   flickers, and the static HTML has no Suspense boundary of its own (the preview is inline, once).
//   A control in the preview that had focus hands it to the island's control with the same id.
// - If the island cannot load or throws outside its Figure's own boundary, the preview comes back
//   in its no-JS form (the no-js runtime state covers "failed to load"): `data-island="failed"` hides the
//   [data-js-only] parts and shows the [data-nojs-only] ones (globals.css). The static HTML is never
//   broken. Focus that was inside the island goes to the open table.
// - `eager` loads the island right after hydration, without waiting for intent or idle time (for a
//   Figure that is the first thing a visitor sees). It goes through the same `load` as the other
//   triggers, so the preview handover, the focus handling and the failure fallback are the same. The
//   server renders the same preview and fetches nothing: the island's code is requested by the browser.
// - Intent shown before hydration counts too: focus already inside the preview, or an entry in one of
//   its inputs (a typed number, a moved range, a picked radio) made before these listeners existed.
//   The island loads at once, and its Slider and Segmented take the entry over from the preview.
// - The root carries `data-island="idle" | "ready" | "failed"`.
import { catchError } from 'next/error';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from 'react';
import { hasEntry } from '@/lib/figure/early-entry';

const IDLE_TIMEOUT_MS = 2000;

/** Commits with the island, never before it: tells the root to drop the preview. */
function Arrived({ onArrive }: { onArrive: () => void }) {
  useLayoutEffect(onArrive, [onArrive]);
  return null;
}

function Island({
  preview,
  children,
  root,
  eager,
}: {
  preview: ReactNode;
  children: ReactNode;
  root: RefObject<HTMLDivElement | null>;
  eager: boolean;
}) {
  // `loading`: intent seen, the island is rendering (its code may still be on the way).
  // `ready`: the island has committed and the preview is gone.
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const focusedId = useRef<string | null>(null);

  const load = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.id && root.current?.contains(active)) focusedId.current = active.id;
    setLoading(true);
  }, [root]);
  // Runs in the commit where the island first appears, while the preview is still in place. Reading a
  // computed style of the island's new element makes the browser resolve the island's style now, in
  // this task, before the next render removes the preview. WebKit lays the page out midway through
  // style resolution to evaluate container queries (every chart is a query container); if the preview
  // had already gone, that half-built page is shorter than the scroll position of a reader who followed
  // a link to a section further down, WebKit clamps the position and drops its scroll anchor, and the
  // view ends at the page end once the rest is built. With the preview in place the page never gets
  // shorter. Style only, no layout: a forced layout here would let scroll anchoring move the view.
  const arrive = useCallback(() => {
    const island = root.current?.lastElementChild;
    if (island) void getComputedStyle(island).display;
    setReady(true);
  }, [root]);

  // Eager: load once the page is interactive. `load` is stable and setting `loading` again is a
  // no-op, so turning `eager` on later never loads twice. It runs in a microtask, not in the effect
  // body itself (a state change there would render twice in one commit); a cleanup that comes first,
  // such as a strict-mode remount, cancels it.
  useEffect(() => {
    if (!eager) return;
    let live = true;
    queueMicrotask(() => {
      if (live) load();
    });
    return () => {
      live = false;
    };
  }, [eager, load]);

  // Intent before hydration: focus that moved into the preview, or an entry made in it, before the
  // listeners below existed. Loaded as eager is, in a microtask.
  useEffect(() => {
    const box = root.current;
    if (box === null) return;
    const active = document.activeElement;
    const focused = active !== null && active !== document.body && box.contains(active);
    if (!focused && ![...box.querySelectorAll('input')].some(hasEntry)) return;
    let live = true;
    queueMicrotask(() => {
      if (live) load();
    });
    return () => {
      live = false;
    };
  }, [root, load]);

  useEffect(() => {
    if (loading) return;
    let cancel = () => {};
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function') {
        const handle = window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
        cancel = () => window.cancelIdleCallback(handle);
      } else {
        // WebKit has no idle callbacks: load at the latest moment the timeout allows.
        const handle = window.setTimeout(load, IDLE_TIMEOUT_MS);
        cancel = () => window.clearTimeout(handle);
      }
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      cancel();
    };
  }, [loading, load]);

  // The preview left with the commit before this one: give focus to the island's control with the
  // same id, if the preview took it with it.
  useLayoutEffect(() => {
    if (!ready) return;
    const id = focusedId.current;
    const active = document.activeElement;
    if (id && (active === null || active === document.body)) document.getElementById(id)?.focus();
  }, [ready]);

  const remember = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target.id) focusedId.current = event.target.id;
    load();
  };

  return (
    <div
      ref={root}
      data-island={ready ? 'ready' : 'idle'}
      onPointerEnter={loading ? undefined : load}
      onFocus={ready ? undefined : remember}
    >
      {ready ? null : preview}
      {loading ? (
        <Suspense fallback={null}>
          {children}
          <Arrived onArrive={arrive} />
        </Suspense>
      ) : null}
    </div>
  );
}

type FailedProps = { preview: ReactNode; root: RefObject<HTMLDivElement | null> };

// The failed island's preview, in its no-JS form. If focus was inside the island (a focus-triggered
// load, or a control of the island itself), the remount drops it on <body>; it goes to the open
// table, the one thing in the no-JS view a keyboard can reach and the next step it offers.
function FailedPreview({ preview, root }: FailedProps) {
  const box = useRef<HTMLDivElement>(null);
  // Read while this renders: the island that failed is still in the DOM then.
  const [hadFocus] = useState(() => focusWasIn(root));
  useEffect(() => {
    const active = document.activeElement;
    if (!hadFocus || (active !== null && active !== document.body)) return;
    box.current?.querySelector<HTMLElement>('[data-nojs-only] [role="region"]')?.focus();
  }, [hadFocus]);
  return (
    <div ref={box} data-island="failed">
      {preview}
    </div>
  );
}

function focusWasIn(root: RefObject<HTMLDivElement | null>): boolean {
  return typeof document !== 'undefined' && (root.current?.contains(document.activeElement) ?? false);
}

const Guard = catchError(function IslandFailed(props: FailedProps) {
  return <FailedPreview {...props} />;
});

export function LoadOnIntent({
  preview,
  children,
  eager = false,
}: {
  preview: ReactNode;
  children: ReactNode /* the lazy island */;
  /** Load the island after hydration instead of on intent or idle time. Default false. */
  eager?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  return (
    <Guard preview={preview} root={root}>
      <Island preview={preview} root={root} eager={eager}>
        {children}
      </Island>
    </Guard>
  );
}
