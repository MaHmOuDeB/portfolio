'use client';

// The per-Figure error boundary and its fallback. When a Figure's client code throws, only that
// Figure changes: its own title stays (the Figure renders it), and in place of the chart comes the
// build-time preview, one sentence and the open table. The sentence never shows error.message, and
// there are no page links inside a Figure: the table is the only action.
//
// The preview is meant to be the build-time chart (server-rendered, so it cannot throw again). It
// still sits in its own guard: if it throws too, it is left out, and the sentence and the open table
// always show.
//
// Focus moves to the sentence only if it was lost: when focus was inside this Figure as the
// fallback rendered (so the failed part may have taken it with it), and once the fallback is in
// place it is on <body>, or on an element of this Figure that is no longer shown (the control row
// and the Figure's own tables are hidden while a fallback shows, globals.css). A pointer-triggered
// failure, a failure while focus is elsewhere and a fallback shown at load time never move it.
import { catchError } from 'next/error';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DataTable, type TableData } from './DataTable';

/** Chart kind without live axes, chart kind with live axes, diagram kind. */
export type FallbackBody = 'static' | 'live' | 'diagram';

// The fallback sentences. They say where the numbers are, without a status code. The first sentence
// is the status, so it is set in warn and semibold (a word, with colour only repeating it).
const SENTENCE: Record<FallbackBody, readonly [status: string, rest: string]> = {
  static: ['This chart could not load.', ' The numbers are in the table below.'],
  live: ['This chart could not load.', ' The numbers for both groups are in the table below.'],
  diagram: ['This diagram could not load.', ' The text around it describes the same steps.'],
};

export type FigureErrorFallbackProps = {
  id: string;
  body: FallbackBody;
  /** The build-time chart, for the chart kinds: server-rendered, never the client code that threw. */
  preview?: ReactNode;
  /** Absent for 'diagram'. */
  table?: TableData;
  /** The table's accessible caption; the Figure passes its title when the title is plain text. */
  tableCaption?: string;
};

/** Read while the fallback renders: the failed subtree is still in the DOM then. */
function focusIsInside(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const figure = document.getElementById(id);
  return figure !== null && figure.contains(document.activeElement);
}

/** Focus is lost: on <body>, or on an element of this Figure that is no longer rendered visibly. */
function focusIsLost(id: string): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body) return true;
  const figure = document.getElementById(id);
  if (figure === null || !figure.contains(active) || !(active instanceof HTMLElement)) return false;
  return typeof active.checkVisibility === 'function' ? !active.checkVisibility() : active.getClientRects().length === 0;
}

// A preview that throws is left out; the sentence and the table do not depend on it.
const PreviewGuard = catchError(function PreviewFailed() {
  return null;
});

export function FigureErrorFallback({ id, body, preview, table, tableCaption }: FigureErrorFallbackProps) {
  const sentence = useRef<HTMLParagraphElement>(null);
  const [hadFocus] = useState(() => focusIsInside(id));
  useEffect(() => {
    if (hadFocus && focusIsLost(id)) sentence.current?.focus();
  }, [hadFocus, id]);
  const chart = body !== 'diagram';
  return (
    <div data-figure-fallback={body}>
      {chart && preview ? (
        <div data-figure-preview="">
          <PreviewGuard>{preview}</PreviewGuard>
        </div>
      ) : null}
      <p ref={sentence} role="status" tabIndex={-1} className="mt-3 max-w-text text-base">
        <span className="font-semibold text-warn">{SENTENCE[body][0]}</span>
        {SENTENCE[body][1]}
      </p>
      {chart && table ? (
        <div className="mt-3">
          <DataTable id={`${id}-fallback-table`} caption={tableCaption ?? 'The numbers in this chart'} table={table} mode="open" />
        </div>
      ) : null}
    </div>
  );
}

function FigureFailed(props: FigureErrorFallbackProps) {
  // The error itself is reported by React; the visitor reads only the ruled sentence.
  return <FigureErrorFallback {...props} />;
}

/** Wraps a Figure's children. Takes the fallback's props; renders the fallback when they throw. */
export const FigureErrorBoundary = catchError(FigureFailed);
