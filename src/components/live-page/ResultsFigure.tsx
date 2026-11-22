// The Live test page's results under the confidence sequence. Server-safe.
//
// - The kit's ConfidenceChart is used only when every count it would print is 0 or at least 5
//   (`kitSafe`) and its own copy is true for the state: while the test runs, or once a pause or a
//   decision has an interval to show. It never gets the reader's own-view mark: this page assigns no
//   group.
// - Otherwise the page draws its own Figure, from the display shape only: the last interval drawn
//   (the kit's Now row, labelled "last" for a test that stopped or paused, "final" once a stop is
//   confirmed), or the difference axis with the hollow mark and a sentence that says why no estimate
//   is shown. Its table prints published cells.
// - With no data (a placeholder), a failed split check or a failed calibration, no result is shown,
//   and only a sentence says so.
import { ChartFrame } from '@/components/kit/ChartFrame';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, type DerivedRef } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { NowRow } from '@/components/kit/NowRow';
import { intervalDigits, liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import { formatNumber, formatSignedNumber } from '@/lib/figure/format';
import { GLYPH_LENGTH, glyphGeometry } from '@/lib/figure/glyph';
import { MIN_PER_GROUP, resolveFigureBody, type FigureRuntime } from '@/lib/figure/states';
import type { HomeMode } from '@/lib/home/model';
import type { Locale } from '@/lib/i18n/locale';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { liveCopy } from './copy';
import { reasonIn } from './StateExplanation';
import { BUILD, Count, provenanceOf } from './Values';

const ID = 'live-results';
const P = 'mt-2 max-w-text text-sm';
const GLYPH = glyphGeometry('large');
const AXIS_HEIGHT = { narrow: 80, wide: 120 } as const;
const RUNNING: readonly HomeMode[] = ['before-data', 'calibration', 'ab'];
const WITH_INTERVAL: readonly HomeMode[] = ['paused', 'ship-b', 'stop-for-harm', 'inconclusive'];

/**
 * The snapshot the kit draws: the page's own, without a reader's view mark or a next-step line. On the
 * German page the stored reasons of a pause or a stopped calibration go in as their German twins (the
 * kit prints them inside its own sentence); the owner's own note stays as written.
 */
function kitView(s: LiveSnapshot, locale: Locale): LiveSnapshot {
  const reason = (r: string) => (locale === 'en' ? r : twin(r, locale));
  return {
    phase: s.phase,
    freshness: s.freshness.kind === 'paused' ? { ...s.freshness, reason: reason(s.freshness.reason) } : s.freshness,
    nA: s.nA,
    nB: s.nB,
    series: s.series,
    capPerArm: s.capPerArm,
    projectedHalfWidthAtCap: s.projectedHalfWidthAtCap,
    plannedEnd: s.plannedEnd,
    plannedEndKind: s.plannedEndKind,
    ...(s.decidedOn === undefined ? {} : { decidedOn: s.decidedOn }),
    ...(s.abStartedOn === undefined ? {} : { abStartedOn: s.abStartedOn }),
    ...(s.guardrail === undefined ? {} : { guardrail: s.guardrail }),
    ...(s.aaFailed === undefined ? {} : { aaFailed: { ...s.aaFailed, reason: reason(s.aaFailed.reason) } }),
    ...(s.ruledOutAbove === undefined ? {} : { ruledOutAbove: s.ruledOutAbove }),
  };
}

/** A stored reason as the German twin the site wrote, or the owner's own words unchanged. */
function twin(r: string, locale: Locale): string {
  const node = reasonIn(r, locale);
  return typeof node === 'string' ? node : r.replace(/[.\s]+$/, '');
}

/**
 * The drawn looks, with published counts. Before the first look is drawn there is no interval to
 * list, so the table holds the analysed views per group so far, as the no-estimate Figure's does:
 * a table with headers and no row would tell a reader without the chart nothing.
 */
function seriesTable(d: LivePageDisplay, locale: Locale): TableData {
  const t = liveCopy(locale).results;
  if (d.series.length === 0) {
    return {
      caption: t.seriesCaption,
      columns: [...t.seriesColumns],
      rows: [[t.groups.a, d.counts.a], [t.groups.b, d.counts.b]],
      formats: ['number', 'count'],
      note: t.seriesNote,
      refs: d.refs,
    };
  }
  return {
    columns: [...t.columns],
    rows: d.series.map((p) => [p.nA, p.nB, p.lower, p.estimate, p.upper]),
    formats: ['count', 'count', 'signedPoints', 'signedPoints', 'signedPoints'],
    rowDigits: d.series.map((p) => intervalDigits(p.lower, p.upper)),
    note: t.note,
    refs: d.refs,
  };
}

/** Why no estimate is shown, in a state with no interval drawn. */
function noEstimate(d: LivePageDisplay, closedNoDecision: boolean, locale: Locale) {
  const t = liveCopy(locale).results;
  const target = <Derived value={MIN_PER_GROUP} unit="count" refs={BUILD} locale={locale} />;
  if (closedNoDecision) {
    return <p className={P}>{d.closedConfirmed ? t.closedConfirmed : t.beingConfirmed}</p>;
  }
  switch (d.mode) {
    case 'paused':
      return <p className={P}>{t.paused}</p>;
    case 'settings-unreadable':
      return <p className={P}>{t.settings}</p>;
    case 'held':
      return <p className={P}>{t.held}</p>;
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return <p className={P}>{t.decision}</p>;
    default: {
      const reached = typeof d.counts.smaller === 'number' && d.counts.smaller >= MIN_PER_GROUP;
      return reached ? (
        <p className={P}>{t.reached(target)}</p>
      ) : (
        <>
          <p className={P}>{t.progress({ smaller: <Count value={d.counts.smaller} refs={d.refs} locale={locale} />, target })}</p>
          <p className={P}>{t.appear(target)}</p>
        </>
      );
    }
  }
}

/** The difference axis with the hollow mark on zero: no estimate, no observed mark. */
function HollowAxis({ label, locale }: { label: string; locale: Locale }) {
  const t = liveCopy(locale).results;
  const zero = locale === 'de' ? KIT_TEXT_DE.zero : { noDifference: 'no difference', higher: 'B higher', lower: 'B lower' };
  return (
    <ChartFrame
      id={`${ID}-axis`}
      ariaLabel={label}
      height={AXIS_HEIGHT}
      x={{ domain: [0, MIN_PER_GROUP], ticks: { narrow: [], wide: [] }, format: (v) => formatNumber(v, 0, { locale }), label: t.xLabel, refs: BUILD }}
      y={{
        domain: [-1, 1],
        ticks: { narrow: [0], wide: [0] },
        format: (v) => formatSignedNumber(v, 0, { locale }),
        label: t.yLabel,
        refs: BUILD,
        zeroLabel: zero.noDifference,
        aboveLabel: zero.higher,
        belowLabel: zero.lower,
      }}
      marks={() => null}
      overlays={(ctx) => (
        <svg data-results-glyph="" x="50%" y={ctx.yPx(0) - GLYPH.height / 2} width={1} height={GLYPH.height} overflow="visible">
          <g transform={`translate(${-GLYPH_LENGTH.large / 2} 0)`}>
            <IntervalGlyph size="large" variant="hollow" estimateAt={0.5} />
          </g>
        </svg>
      )}
    />
  );
}

/**
 * What the results part draws in this state: nothing but a sentence (no data, a failed split check, a
 * failed calibration), the hollow mark in place of an interval, or an interval.
 */
export function resultsKind(d: LivePageDisplay): 'none' | 'hollow' | 'interval' {
  if (d.public.source === 'unavailable' || d.mode === 'srm-suppressed' || d.mode === 'aa-failed') return 'none';
  return d.series.length > 0 ? 'interval' : 'hollow';
}

export function ResultsFigure({ display: d, runtime, locale = 'en' }: { display: LivePageDisplay; runtime?: FigureRuntime; locale?: Locale }) {
  const t = liveCopy(locale).results;
  const kitText = locale === 'de' ? { text: KIT_TEXT_DE } : {};
  const P_BASE = 'max-w-text text-base';
  if (d.public.source === 'unavailable') return <p className={P_BASE}>{t.unavailable}</p>;
  if (d.mode === 'srm-suppressed') return <p className={P_BASE}>{t.srm}</p>;
  if (d.mode === 'aa-failed') return <p className={P_BASE}>{t.aaFailed}</p>;

  const closedNoDecision = d.outcome === null && d.countingClosed;
  const refs: readonly DerivedRef[] = d.refs;
  const forced = runtime === undefined ? {} : { runtime };
  const kit =
    d.kitSafe && !closedNoDecision && (RUNNING.includes(d.mode) || (WITH_INTERVAL.includes(d.mode) && d.series.length > 0)) ? d.kitSnapshot : null;

  if (kit !== null) {
    const snapshot = kitView(kit, locale);
    const state = liveFigureState(snapshot);
    return (
      <Figure
        id={ID}
        title={t.figureTitle}
        state={{ ...state, ...forced }}
        caption={t.caption}
        provenance={provenanceOf(refs)}
        table={seriesTable(d, locale)}
        {...kitText}
      >
        <ConfidenceChart id={`${ID}-cs`} snapshot={snapshot} body={resolveFigureBody(state)} refs={refs} {...kitText} />
      </Figure>
    );
  }

  const last = d.series[d.series.length - 1];
  if (last !== undefined) {
    const stoppedEarly = d.mode === 'held' || d.mode === 'paused' || d.mode === 'settings-unreadable';
    // "final" only once the stop is confirmed: a derived decision is still being confirmed.
    const final = d.closedConfirmed && (d.outcome !== null || closedNoDecision);
    const label = stoppedEarly ? 'last' : final ? 'final' : 'now';
    const title =
      d.mode === 'held'
        ? t.titles.held
        : d.mode === 'paused'
          ? t.titles.paused
          : d.mode === 'settings-unreadable'
            ? t.titles.settings
            : final
              ? t.titles.final
              : closedNoDecision || d.outcome !== null
                ? t.titles.confirming
                : t.titles.latest;
    const reach = Math.max(1, Math.abs(last.lower), Math.abs(last.upper)) * 1.15;
    return (
      <Figure id={ID} title={title} state={forced} caption={t.caption} provenance={provenanceOf(refs)} table={seriesTable(d, locale)} {...kitText}>
        <NowRow domain={[-reach, reach]} interval={{ lower: last.lower, upper: last.upper, estimate: last.estimate }} label={label} refs={refs} {...kitText} />
      </Figure>
    );
  }

  const running = RUNNING.includes(d.mode) && !closedNoDecision;
  const title = running ? t.titles.none : t.titles.noneShown;
  return (
    <Figure
      id={ID}
      title={title}
      state={forced}
      caption={t.noEstimateCaption}
      provenance={provenanceOf(refs)}
      table={{ columns: [...t.seriesColumns], rows: [[t.groups.a, d.counts.a], [t.groups.b, d.counts.b]], formats: ['number', 'count'], refs }}
      {...kitText}
    >
      <HollowAxis label={title} locale={locale} />
      {noEstimate(d, closedNoDecision, locale)}
    </Figure>
  );
}
