// The visitor funnel of the Live test page, from the published data only: beacons received, after
// the bot filter, counted entry views, cards in view. The first two totals are not published (a
// total of published cells would undo the "<5" rule), so they say "Not published"; the last two are
// the published per-group cells. The exclusions are given by reason, as published, with the
// structural preview row (always 0: a preview never writes). Stages are a list, not a Sankey: no
// width stands for a total that is not published. A placeholder (no data) shows no count at all.
// Server-safe.
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import type { RejectReason } from '@/lib/experiment/events';
import type { FigureRuntime } from '@/lib/figure/states';
import type { LivePagePublic } from '@/lib/live-page/model';
import { BUILD, provenanceOf } from './Values';

const NOT_PUBLISHED = 'Not published';
const NO_DATA = 'No data';
const P = 'max-w-text text-base';

/** Each reason as the pre-registration lists it, and what it means. */
const REASONS: Record<RejectReason, [string, string]> = {
  bot: ['Known bots', 'A bot user agent, or a browser driven by automation'],
  internal: ['Automated test and Lighthouse runs', 'Requests carrying the site’s own test header'],
  self: ['My own devices', 'Browsers I excluded on the exclusion page'],
  forced: ['Forced demo views', 'A group asked for in the address'],
  not_entry: ['Not an entry view', 'A view that is not a fresh arrival on the home page'],
  rate_limited: ['Over the rate limit', 'Too many requests from one network address in a minute'],
  ceiling: ['After the daily ceiling', 'Entries after the day’s limit was reached'],
};
const ORDER: readonly RejectReason[] = ['bot', 'internal', 'self', 'forced', 'not_entry', 'rate_limited', 'ceiling'];

type Props = { data: LivePagePublic; refs: readonly DerivedRef[]; runtime?: FigureRuntime };

export function FunnelFigure({ data, refs, runtime }: Props) {
  const placeholder = data.source === 'unavailable';
  const c = data.current;
  const cell = (v: number | '<5') => (placeholder ? NO_DATA : v);
  const table: TableData = {
    columns: ['Stage', 'Group A', 'Group B'],
    rows: [
      ['Beacons received', NOT_PUBLISHED, NOT_PUBLISHED],
      ['After the bot filter', NOT_PUBLISHED, NOT_PUBLISHED],
      ['Counted entry views', cell(c.a.entry), cell(c.b.entry)],
      ['Cards in view (analysed views)', cell(c.a.inview), cell(c.b.inview)],
    ],
    formats: ['number', 'count', 'count'],
    note: 'Views per group. A count from one to four is shown as less than five.',
    refs,
  };
  const pair = (a: number | '<5', b: number | '<5') =>
    placeholder ? (
      NO_DATA
    ) : (
      <>
        group A <PublishedCountText value={a} refs={refs} />, group B <PublishedCountText value={b} refs={refs} />
      </>
    );
  return (
    <div>
      <p className={P}>
        The beacon on the home page sends events, and the server decides which of them count. These are beacons received, not
        visitors: one person can send many. Nothing comes from bots that never run JavaScript, or from visitors whose browser
        sends Global Privacy Control or Do Not Track, so they are in no count.
      </p>
      <div className="mt-8">
        <Figure
          id="live-funnel"
          title="Only the last two stages are published"
          state={runtime === undefined ? undefined : { runtime }}
          caption="Each stage keeps what the one before it let through. The first two totals are not published, because a total could give away a count that is shown only as less than five."
          provenance={provenanceOf(refs)}
          table={table}
        >
          <ol data-funnel="" className="grid gap-3 text-base sm:grid-cols-2">
            {[
              ['Beacons received', NOT_PUBLISHED],
              ['After the bot filter', NOT_PUBLISHED],
              ['Counted entry views', pair(c.a.entry, c.b.entry)],
              ['Cards in view (analysed views)', pair(c.a.inview, c.b.inview)],
            ].map(([name, value], i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <span className="font-semibold">{name}</span>
                <br />
                <span className="text-muted">{value}</span>
              </li>
            ))}
          </ol>
        </Figure>
      </div>
      <h3 className="mt-8 max-w-text text-xl font-semibold">Why views were not counted</h3>
      {placeholder ? (
        <p className={`${P} mt-3`}>No counts are shown: this page has no data.</p>
      ) : (
        <div id="live-exclusions" className="mt-3 max-w-figure">
          <DataTable
            id="live-exclusions-table"
            caption="Entries turned away, by reason"
            mode="open"
            table={{
              columns: ['Reason', 'Entries', 'What it means'],
              rows: ORDER.map((r) => [REASONS[r][0], data.funnel.excluded[r], REASONS[r][1]]),
              formats: ['number', 'count', 'number'],
              refs,
            }}
          />
        </div>
      )}
      <p id="live-preview-row" className={`${P} mt-3`}>
        Preview deployments: <Derived value={0} unit="count" refs={BUILD} />. A preview never writes to the store, so this is
        always <Derived value={0} unit="count" refs={BUILD} />.
      </p>
      <p className={`${P} mt-3`}>
        Each row counts entries turned away for one reason, with two exceptions: “Over the rate limit” counts at most one per
        network address a minute, and “After the daily ceiling” counts one for each day the limit was reached. Once a day is full,
        later entries are turned away without being counted under any reason. The rows are not visitors lost and do not add up:
        one visitor can appear under several reasons, and some visits never reach the server at all.
      </p>
    </div>
  );
}
