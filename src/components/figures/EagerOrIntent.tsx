'use client';

// Loads an interactive Figure's island at once when the page was opened with that Figure's URL
// state, and on intent otherwise. A shared link such as `?peeking.looks=20` asks for a view
// the server could not draw (the static HTML holds the preset), so the island loads right after
// hydration instead of waiting for a pointer, focus or idle time. Any key in one of `ids`'
// namespaces counts; another Figure's keys do not.
//
// The loader is the kit's LoadOnIntent: its `eager` prop goes through the same load, so the preview
// handover, the focus handoff and the failure fallback are the same in both cases.
//
// The query is read from the browser's location, never with useSearchParams. On a static page
// useSearchParams renders up to its Suspense boundary on the client only: the server sends the
// fallback, and hydration deletes it and inserts a fresh copy. Swapping both Figures of a page that way
// moved the view in WebKit after a link to a section near the end of the page: WebKit lays the page out
// midway through the new copy's style (for the charts' container queries), finds it shorter than the
// scroll position, clamps it and drops its scroll anchor. Here the server snapshot is "not eager", so
// the static HTML and the first client render are the same and hydrate in place. The location is read
// right after hydration and then turns `eager` on (the loader's eager effect loads once, however late
// it turns on). After a client navigation the read is repeated once the router has written the new
// URL, so a link with this Figure's keys still loads it at once.
import { useSyncExternalStore, type ReactNode } from 'react';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';

type Props = {
  /** The Figure ids whose URL keys load the island at once (both, for a paired Figure). */
  ids: readonly string[];
  preview: ReactNode;
  /** The lazy island. */
  children: ReactNode;
};

/** Whether any key of `search` is in one of the `${id}.` namespaces. */
export function hasFigureKeys(search: { keys(): Iterable<string> }, ids: readonly string[]): boolean {
  const prefixes = ids.map((id) => `${id}.`);
  for (const key of search.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) return true;
  }
  return false;
}

// The location only matters for the first load, so nothing needs to subscribe to it.
const noSubscription = () => () => {};

export function EagerOrIntent({ ids, preview, children }: Props) {
  const eager = useSyncExternalStore(
    noSubscription,
    () => hasFigureKeys(new URLSearchParams(window.location.search), ids),
    () => false,
  );
  return (
    <LoadOnIntent eager={eager} preview={preview}>
      {children}
    </LoadOnIntent>
  );
}
