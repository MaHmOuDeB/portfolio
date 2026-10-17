'use client';

// A Figure's parameters, read from the URL once and written back as the visitor changes them.
//
// - The initial state comes from useSearchParams(). On a static page that call bails out of
//   prerendering up to the nearest <Suspense>, so the caller sits inside one whose fallback
//   renders the default preset: the server HTML shows the preset, and the client renders the URL's
//   state in place of the fallback, with no hydration of that subtree and so no mismatch.
// - While the visitor interacts, local state is the source; the URL only follows it.
// - Writes go through window.history.replaceState (Next.js syncs its router with it), debounced to
//   URL_DEBOUNCE_MS so a slider drag leaves one history entry, not forty. A pending write is
//   flushed on pagehide and dropped on unmount (after a navigation it would land on the next URL).
// - Each write starts from the current location, so other Figures' keys and the hash are kept.
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertFigureId,
  readFigureParams,
  resetFigureParams,
  URL_DEBOUNCE_MS,
  writeFigureParams,
  type ParamSchema,
  type ParamValues,
  type Presets,
} from '@/lib/figure/url-state';

type Write = (search: URLSearchParams) => URLSearchParams;

function applyToUrl(write: Write) {
  const { pathname, search, hash } = window.location;
  const query = write(new URLSearchParams(search)).toString();
  const url = `${pathname}${query ? `?${query}` : ''}${hash}`;
  if (url !== `${pathname}${search}${hash}`) window.history.replaceState(null, '', url);
}

export function useFigureParams<S extends ParamSchema>(
  id: string,
  schema: S,
  presets: Presets<S>,
): {
  values: ParamValues<S>;
  preset: string;
  set: <K extends keyof S>(key: K, value: ParamValues<S>[K]) => void;
  reset: () => void;
} {
  assertFigureId(id);
  const search = useSearchParams();
  // Read once: later URL changes are this hook's own writes, or another Figure's.
  const [initial] = useState(() => readFigureParams(search, id, schema, presets));
  const [values, setValues] = useState(initial.values);
  const latest = useRef(initial.values);
  const pending = useRef<Write | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const write = pending.current;
    pending.current = null;
    if (write) applyToUrl(write);
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
    };
  }, [flush]);

  const set = useCallback(
    <K extends keyof S>(key: K, value: ParamValues<S>[K]) => {
      const next = { ...latest.current, [key]: value };
      latest.current = next;
      setValues(next);
      pending.current = (s) => writeFigureParams(s, id, next);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(flush, URL_DEBOUNCE_MS);
    },
    [flush, id],
  );

  const reset = useCallback(() => {
    const restored = presets[initial.preset]!;
    latest.current = restored;
    setValues(restored);
    // At once, replacing any pending write, so a late debounced write cannot bring keys back.
    pending.current = (s) => resetFigureParams(s, id, initial.preset);
    flush();
  }, [flush, id, initial.preset, presets]);

  return { values, preset: initial.preset, set, reset };
}
