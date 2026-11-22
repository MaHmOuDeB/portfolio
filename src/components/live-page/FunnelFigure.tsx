// The visitor funnel of the Live test page, from the published data only: beacons received, after
// the bot filter, counted entry views, cards in view. The first two totals are not published (a
// total of published cells would undo the "<5" rule), so they say "Not published"; the last two are
// the published per-group cells. The exclusions are given by reason, as published, with the
// structural preview row (always 0: a preview never writes). Stages are a list, not a Sankey: no
// width stands for a total that is not published. A placeholder (no data) shows no count at all.
// The stages read left to right as one row of joined cells from md, and as a column on a phone.
// Three parts, so the page can put the method one click deeper: the Figure (FunnelFigure), the
// paragraph on what a beacon is and who sends none (FunnelMethod), and the entries turned away by
// reason with their footnote (FunnelExclusions). Server-safe.
import type { TableData } from '@/components/kit/DataTable';
import { TextTable } from '../tables/TextTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import type { RejectReason } from '@/lib/experiment/events';
import type { FigureRuntime } from '@/lib/figure/states';
import type { Locale } from '@/lib/i18n/locale';
import type { LivePagePublic } from '@/lib/live-page/model';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { liveCopy } from './copy';
import { BUILD, Count, provenanceOf } from './Values';

const P = 'max-w-text text-base';

const ORDER: readonly RejectReason[] = ['bot', 'internal', 'self', 'forced', 'not_entry', 'rate_limited', 'ceiling'];

type Props = { data: LivePagePublic; refs: readonly DerivedRef[]; runtime?: FigureRuntime; locale?: Locale };

export function FunnelFigure({ data, refs, runtime, locale = 'en' }: Props) {
  const t = liveCopy(locale).funnelFigure;
  const placeholder = data.source === 'unavailable';
  const c = data.current;
  const cell = (v: number | '<5') => (placeholder ? t.noData : v);
  const table: TableData = {
    columns: [t.columns.stage, t.columns.a, t.columns.b],
    rows: [
      [t.stages.beacons, t.notPublished, t.notPublished],
      [t.stages.bot, t.notPublished, t.notPublished],
      [t.stages.entry, cell(c.a.entry), cell(c.b.entry)],
      [t.stages.inview, cell(c.a.inview), cell(c.b.inview)],
    ],
    formats: ['number', 'count', 'count'],
    note: t.note,
    refs,
  };
  const pair = (a: number | '<5', b: number | '<5') =>
    placeholder ? (
      t.noData
    ) : (
      t.pair({ a: <Count value={a} refs={refs} locale={locale} />, b: <Count value={b} refs={refs} locale={locale} /> })
    );
  return (
    <Figure
      id="live-funnel"
      title={t.title}
      state={runtime === undefined ? undefined : { runtime }}
      caption={t.caption}
      provenance={provenanceOf(refs)}
      table={table}
      {...(locale === 'de' ? { text: KIT_TEXT_DE } : {})}
    >
      <ol data-funnel="" className="grid divide-y divide-hairline-strong rounded-md border border-hairline-strong text-base md:grid-cols-4 md:divide-x md:divide-y-0">
        {[
          [t.stages.beacons, t.notPublished],
          [t.stages.bot, t.notPublished],
          [t.stages.entry, pair(c.a.entry, c.b.entry)],
          [t.stages.inview, pair(c.a.inview, c.b.inview)],
        ].map(([name, value], i) => (
          <li key={i} className="p-3 md:p-4">
            <span className="font-semibold">{name}</span>
            <br />
            <span className="text-muted">{value}</span>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/** What a beacon is, and who sends none: the method behind the stages. */
export function FunnelMethod({ locale = 'en' }: { locale?: Locale }) {
  return <p className={P}>{liveCopy(locale).funnelFigure.method}</p>;
}

/** The entries turned away, by reason, with the structural preview row and the footnote. */
export function FunnelExclusions({ data, refs, locale = 'en' }: { data: LivePagePublic; refs: readonly DerivedRef[]; locale?: Locale }) {
  const t = liveCopy(locale).funnelFigure;
  const placeholder = data.source === 'unavailable';
  const zero = <Derived value={0} unit="count" refs={BUILD} locale={locale} />;
  return (
    <div>
      {placeholder ? (
        <p className={P}>{t.noCounts}</p>
      ) : (
        <div id="live-exclusions" className="max-w-figure">
          {/* A text table: the meanings are sentences, so they wrap instead of scrolling sideways. */}
          <TextTable
            id="live-exclusions-table"
            caption={t.exclusionsCaption}
            locale={locale}
            table={{
              columns: [...t.exclusionsColumns],
              rows: ORDER.map((r) => [t.reasons[r][0], data.funnel.excluded[r], t.reasons[r][1]]),
              formats: ['number', 'count', 'number'],
              refs,
            }}
          />
        </div>
      )}
      <p id="live-preview-row" className={`${P} mt-3`}>
        {t.preview(zero)}
      </p>
      <p className={`${P} mt-3`}>{t.footnote}</p>
    </div>
  );
}
