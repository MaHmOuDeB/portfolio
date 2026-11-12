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
// - The root carries `data-island="idle" | "ready" | "failed"`.
import { catchError } from 'next/error';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode, type RefObject } from 'react';

const IDLE_TIMEOUT_MS = 2000;

/**
 * Keeps `box` at least `height` tall until its last child (the island just inserted) has been laid
 * out: the island's first ResizeObserver callback, which comes after that layout and before the paint,
 * lets it go. Writes only; it reads no style or layout.
 */
function reserveUntilLaidOut(box: HTMLElement, height: number) {
  const island = box.lastElementChild;
  if (island === null || height <= 0 || typeof ResizeObserver !== 'function') return;
  box.style.minHeight = `${height}px`;
  const release = new ResizeObserver(() => {
    release.disconnect();
    box.style.minHeight = '';
  });
  release.observe(island);
}

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

  // The preview's height as the browser last laid it out, kept by a ResizeObserver while the preview
  // is on screen (an observer reads sizes after layout, so it never forces one). If the island is asked
  // for before the browser has rendered once since hydration, the observer has not reported yet, and
  // `load` reads the height itself: the island is not in the page yet, so a layout that read forces
  // is one of the page as it stands.
  const previewHeight = useRef(0);

  const load = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.id && root.current?.contains(active)) focusedId.current = active.id;
    if (previewHeight.current === 0 && root.current) previewHeight.current = root.current.getBoundingClientRect().height;
    setLoading(true);
  }, [root]);

  useEffect(() => {
    const box = root.current;
    if (ready || box === null || typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) previewHeight.current = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [ready, root]);

  // Runs in the commit where the island first appears, while the preview is still in place; the next
  // render removes the preview. Until the island has been laid out, the root keeps the preview's
  // height as its minimum, so the page is never shorter than it was. WebKit lays the page out midway
  // through the island's style, to evaluate container queries (every chart is a query container);
  // without the reserved height that half-built page is shorter than the scroll position of a reader
  // who followed a link to a section further down, WebKit clamps the position and drops its scroll
  // anchor, and the view ends at the page end. The reservation is released in the island's first
  // ResizeObserver callback, after that layout and before the paint, so no frame shows it.
  // Nothing here reads style or layout: an island must not force layout in its own mount effects. A
  // forced layout here lays out the preview and the island one above the other; Chromium picks its
  // scroll anchor inside that stacked page, and when the preview leaves, the anchor moves up by the
  // preview's height and the view follows it.
  const arrive = useCallback(() => {
    if (root.current) reserveUntilLaidOut(root.current, previewHeight.current);
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
