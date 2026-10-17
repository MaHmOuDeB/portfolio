'use client';

// The per-Figure error boundary and its fallback. When a Figure's client code throws, only that
// Figure changes: its own title stays (the Figure renders it), and in place of the chart comes the
// build-time preview, one sentence and the open table. The sentence never shows error.message, and
// there are no page links inside a Figure: the table is the only action.
//
// Focus moves to the sentence only if it was lost: when focus was inside this Figure as the
// fallback rendered (so the failed part may have taken it with it) and is on <body> once the
// fallback is in place. A pointer-triggered failure, a failure while focus is elsewhere and a
// fallback shown at load time never move it.
import { catchError } from 'next/error';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DataTable, type TableData } from './DataTable';

/** Chart kind without live axes, chart kind with live axes, diagram kind. */
export type FallbackBody = 'static' | 'live' | 'diagram';

// RULING-home-and-errors item 2, verbatim.
const SENTENCE: Record<FallbackBody, string> = {
  static: 'This chart could not load. The numbers are in the table below.',
  live: 'This chart could not load. The numbers for both groups are in the table below.',
  diagram: 'This diagram could not load. The text around it describes the same steps.',
};

export type FigureErrorFallbackProps = {
  id: string;
  body: FallbackBody;
  /** The build-time chart, for the chart kinds. */
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

export function FigureErrorFallback({ id, body, preview, table, tableCaption }: FigureErrorFallbackProps) {
  const sentence = useRef<HTMLParagraphElement>(null);
  const [hadFocus] = useState(() => focusIsInside(id));
  useEffect(() => {
    const active = document.activeElement;
    if (hadFocus && (active === null || active === document.body)) sentence.current?.focus();
  }, [hadFocus]);
  const chart = body !== 'diagram';
  return (
    <div data-figure-fallback={body}>
      {chart && preview ? <div data-figure-preview="">{preview}</div> : null}
      <p ref={sentence} role="status" tabIndex={-1} className="mt-3 max-w-text text-base">
        {SENTENCE[body]}
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
