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
//   in its no-JS form (states.md: no-js covers "failed to load"): `data-island="failed"` hides the
//   [data-js-only] parts and shows the [data-nojs-only] ones (globals.css). The static HTML is never
//   broken.
// - The root carries `data-island="idle" | "ready" | "failed"`.
import { catchError } from 'next/error';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';

const IDLE_TIMEOUT_MS = 2000;

/** Commits with the island, never before it: tells the root to drop the preview. */
function Arrived({ onArrive }: { onArrive: () => void }) {
  useLayoutEffect(onArrive, [onArrive]);
  return null;
}

function Island({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  // `loading`: intent seen, the island is rendering (its code may still be on the way).
  // `ready`: the island has committed and the preview is gone.
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const focusedId = useRef<string | null>(null);

  const load = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.id && root.current?.contains(active)) focusedId.current = active.id;
    setLoading(true);
  }, []);
  const arrive = useCallback(() => setReady(true), []);

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

function IslandFailed({ preview }: { preview: ReactNode }) {
  return <div data-island="failed">{preview}</div>;
}

const Guard = catchError(IslandFailed);

export function LoadOnIntent({ preview, children }: { preview: ReactNode; children: ReactNode /* the lazy island */ }) {
  return (
    <Guard preview={preview}>
      <Island preview={preview}>{children}</Island>
    </Guard>
  );
}
