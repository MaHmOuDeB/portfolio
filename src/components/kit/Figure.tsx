// The frame for every chart and every interactive part: title, an optional lead, control row,
// result line, the chart (inside a per-Figure error boundary), the caption with its provenance badge,
// and the table fallback. One contract, so a new Figure is a content task. Shared: no hooks, so the
// server renders static Figures and an island renders its interactive one with the same markup.
//
// - The table is drawn once (DataTable's disclosure mode): open without JavaScript, under "Controls
//   need JavaScript." (said only when there are controls), and folded behind "Show the numbers as a
//   table" with it. The unlayered JS-flag rules in globals.css pick the view; the HTML and the
//   island's payload carry the numbers once.
// - A forced runtime (kitchen sink, tests): `no-js` renders the no-JS view ungated, with no controls
//   and no disclosure; `error` renders the error fallback in place of the chart, with no controls,
//   no lead, no result and no table of its own (the fallback has one). A real error caught by the boundary looks the same:
//   globals.css hides the lead, controls, result and tables of a Figure that holds a fallback. The
//   fallback's preview is `preview`, else the children: an island Figure passes the server's preset
//   chart.
// - The announcement region is polite and starts empty: the state a page loads in is plain text and
//   is not announced. The island sets `announcement` on commit only (slider release, toggle, Reset).
//   It carries the table's refs, so the truth audit covers the numbers it speaks.
// - figcaption is the figure's last child, as HTML requires, so the table sits inside it, after the
//   caption and the badge ("Show the numbers as a table" ends the caption).
import type { ReactNode } from 'react';
import { resolveFigureBody, type FigureState } from '@/lib/figure/states';
import { assertFigureId } from '@/lib/figure/url-state';
import { DataTable, type TableData } from './DataTable';
import { derivedAttr } from './Derived';
import {
  FigureErrorBoundary,
  FigureErrorFallback,
  type FallbackBody,
  type FigureErrorFallbackProps,
} from './FigureErrorBoundary';
import { UpdatedLabel } from './LiveLabels';
import { ProvenanceBadge, type Provenance } from './ProvenanceBadge';

export { FigureErrorFallback, type FallbackBody, type FigureErrorFallbackProps };

export type FigureProps = {
  /** URL namespace (?id.param), the figure's element id and the base of its aria-labelledby. */
  id: string;
  /** A finding (static) or a relationship (interactive); may hold a <Fact>. */
  title: ReactNode;
  /** The axes in src/lib/figure/states.ts; defaults to the static default. */
  state?: FigureState;
  /** What is drawn, the source, the seed. */
  caption: ReactNode;
  /** The ChartFrame or the diagram. */
  children: ReactNode;
  /** Heading level of the title, default 3. */
  titleLevel?: 2 | 3 | 4;
} & (
  | {
      kind?: 'chart';
      provenance: Provenance;
      table: TableData;
      /**
       * Drawn between the title and the control row (a chart Figure only): a readout that must be
       * seen before the controls. Shown in the default and no-JS states, never beside a fallback.
       * Like the controls and the result line it sits outside the Figure's error boundary, so it
       * must not throw; its changes are not announced (the island sets `announcement` for that).
       */
      lead?: ReactNode;
      /** Slider / Segmented / Reset. */
      controls?: ReactNode;
      /** The live sentence; it marks its own numbers with data-derived. */
      result?: ReactNode;
      /**
       * Build-time chart for the error fallback; default: children. The default is safe only when
       * the children are server-rendered. An island that renders its own Figure must pass the
       * server's preset chart here: its client children are what threw, and would throw again.
       */
      preview?: ReactNode;
      /** Polite live text, set by the island on commit only. */
      announcement?: string;
    }
  | { kind: 'diagram' }
);

const TITLE = 'text-xl font-semibold';
const NO_JS_NOTE = 'Controls need JavaScript.';

function Title({ id, level, children }: { id: string; level: 2 | 3 | 4; children: ReactNode }) {
  const Heading = `h${level}` as const;
  return (
    <Heading id={id} className={TITLE}>
      {children}
    </Heading>
  );
}

export function Figure(p: FigureProps) {
  assertFigureId(p.id);
  const state = p.state ?? {};
  const runtime = state.runtime ?? 'default';
  const titleId = `${p.id}-title`;
  const root = {
    id: p.id,
    'data-figure': p.id,
    'data-body': resolveFigureBody(state),
    'data-runtime': runtime,
    'aria-labelledby': titleId,
    className: 'max-w-figure',
  };
  const title = (
    <Title id={titleId} level={p.titleLevel ?? 3}>
      {p.title}
    </Title>
  );

  if (p.kind === 'diagram') {
    return (
      <figure {...root}>
        {title}
        <div data-figure-body="" className="mt-4">
          {runtime === 'error' ? (
            <FigureErrorFallback id={p.id} body="diagram" />
          ) : (
            <FigureErrorBoundary id={p.id} body="diagram">
              {p.children}
            </FigureErrorBoundary>
          )}
        </div>
        <figcaption className="mt-3 max-w-text text-sm text-muted">{p.caption}</figcaption>
      </figure>
    );
  }

  const failed = runtime === 'error';
  const noJs = runtime === 'no-js';
  const fallback: FigureErrorFallbackProps = {
    id: p.id,
    body: state.live ? 'live' : 'static',
    preview: p.preview ?? p.children,
    table: p.table,
    tableCaption: typeof p.title === 'string' ? p.title : undefined,
  };
  const caption = fallback.tableCaption ?? 'The numbers in this chart';
  const freshness = state.live?.freshness;
  const tableId = `${p.id}-table`;

  return (
    <figure {...root}>
      {title}
      {p.lead && !failed ? (
        <div data-figure-lead="" className="mt-4">
          {p.lead}
        </div>
      ) : null}
      {p.controls && !failed && !noJs ? (
        <div
          data-js-only=""
          data-figure-controls=""
          role="group"
          aria-label="Controls"
          className="mt-4 flex flex-col gap-4 xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
        >
          {p.controls}
        </div>
      ) : null}
      {p.result && !failed ? (
        <p data-figure-result="" className="mt-4 max-w-text text-base">
          {p.result}
        </p>
      ) : null}
      {!failed && !noJs ? (
        <p data-figure-announcement="" aria-live="polite" className="sr-only" {...derivedAttr(p.table.refs)}>
          {p.announcement ?? ''}
        </p>
      ) : null}
      <div data-figure-body="" className="mt-4">
        {failed ? (
          <FigureErrorFallback {...fallback} />
        ) : (
          <FigureErrorBoundary {...fallback}>{p.children}</FigureErrorBoundary>
        )}
      </div>
      <figcaption className="mt-3 text-sm">
        <p className="max-w-text text-muted">{p.caption}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ProvenanceBadge kind={p.provenance} />
          {freshness?.kind === 'stale' ? (
            <UpdatedLabel updatedAt={freshness.updatedAt} renderedAt={freshness.renderedAt} refs={p.table.refs} />
          ) : null}
        </div>
        {failed ? null : noJs ? (
          <div data-figure-tables="" className="mt-3">
            {p.controls ? <p className="text-sm">{NO_JS_NOTE}</p> : null}
            <div className="mt-2">
              <DataTable id={tableId} caption={caption} table={p.table} mode="open" />
            </div>
          </div>
        ) : (
          <div data-figure-tables="" className="mt-1">
            <DataTable
              id={tableId}
              caption={caption}
              table={p.table}
              mode="disclosure"
              noJsNote={p.controls ? NO_JS_NOTE : undefined}
            />
          </div>
        )}
      </figcaption>
    </figure>
  );
}

/**
 * Runs `apply` (a state change) with the Figure's marks held still, so the change lands at once:
 * Reset restores the preset instantly. The flag lasts until two frames after the change.
 */
export function instantly(figureId: string, apply: () => void): void {
  const figure = document.getElementById(figureId);
  figure?.setAttribute('data-instant', '');
  apply();
  requestAnimationFrame(() => requestAnimationFrame(() => figure?.removeAttribute('data-instant')));
}
