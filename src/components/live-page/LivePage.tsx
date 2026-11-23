// The Live test page (/experiment): the site's experiment on its own visitors, as it stands. It
// follows the reading model of the inner pages. The first screen: what the page is for, the plain
// opening, the status card (the three steps and where the test stands) and four key points. Then the
// in-page links, the result so far with the decision and the end, the plan fixed before the start,
// the health checks (the split check and what this many views can detect), how views are counted,
// the data with the script that recomputes it, what the page shows about how I work, how the site is
// built, and the shared call to action. Method detail sits one click deeper, in native details rows,
// with its text unchanged.
//
// It renders the allowlisted display shape only (toLivePageDisplay): every count is a published
// cell, the state copy comes from StateExplanation and the next step from nextStepFor, and nothing
// here reads the snapshot. Every sentence about the test repeats the pre-registration or the page's
// own state copy, and is written to be true in every state: during the calibration both groups see
// group A, so the page says what the test compares and that the comparison starts after it.
// Server-safe, no client component of its own and no beacon: the page assigns no group and polls
// nothing. `runtime` forces a Figure runtime (no-JS, error) for the tests, as the kit's own forced
// states do.
//
// Refs: a value read from the published data uses the reader's refs (`live` on the site); a value
// committed with the configuration (the planning rate, the pre-registration's version, tag and hash)
// and a figure quoted from the plan uses `build`.
import type { ReactNode } from 'react';
import { FigureSheet, KeyPoints, LeadIn, MethodDetails, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { MIN_PER_GROUP, type FigureRuntime } from '@/lib/figure/states';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { CONTACT } from '@/lib/site';
import { FRAME_DE } from '../../../content/de/frame';
import { LIVE_EN } from '../../../content/live';
import { liveCopy } from './copy';
import { DetectableFigure } from './DetectableFigure';
import { FunnelExclusions, FunnelFigure, FunnelMethod } from './FunnelFigure';
import { ResultsFigure, resultsKind } from './ResultsFigure';
import { StatusCard, WITH_END, isRunning, stateWords } from './StatusCard';
import { BUILD, MarkedText, When } from './Values';

/** The h1, with its quiet second clause. */
export const LIVE_TEST_TITLE = LIVE_EN.head.title;
export const LIVE_TEST_QUIET = LIVE_EN.head.quiet;

/**
 * How often the German Live test page regenerates, in seconds: a fifth route that reads the store,
 * every ten minutes, so it stays under the 15-minute stale mark. The route file writes the same number
 * as a literal (Next reads `revalidate` statically); a unit test holds the two equal. The English
 * pages keep the pre-registered 300 seconds.
 */
export const DE_LIVE_REVALIDATE_SECONDS = 600;

/** The ruled sections after the first screen, in page order. The close sits between the last two. */
export const LIVE_SECTIONS = [
  { id: 'results', title: LIVE_EN.sections.results },
  { id: 'plan', title: LIVE_EN.sections.plan },
  { id: 'health', title: LIVE_EN.sections.health },
  { id: 'funnel', title: LIVE_EN.sections.funnel },
  { id: 'check-it-yourself', title: LIVE_EN.sections.checkItYourself },
] as const;

type SectionId = (typeof LIVE_SECTIONS)[number]['id'];
const SECTION_KEY = { results: 'results', plan: 'plan', health: 'health', funnel: 'funnel', 'check-it-yourself': 'checkItYourself' } as const;

const TEXT = 'max-w-text';
const P = `${TEXT} text-base`;
const H3 = `${TEXT} text-lg font-semibold`;
const REPO = `${CONTACT.github}/portfolio`;

/** The frame parts' own labels: their English defaults, and the German ones on a German page. */
function frameLabels(locale: Locale) {
  return locale === 'de'
    ? {
        sectionNav: { label: FRAME_DE.sectionNav },
        keyPoints: { label: FRAME_DE.keyPoints },
        leadIn: { label: FRAME_DE.leadIn },
        takeaway: { label: FRAME_DE.takeaway },
        method: { summary: FRAME_DE.methodDetails },
        close: { title: FRAME_DE.pageClose },
      }
    : { sectionNav: {}, keyPoints: {}, leadIn: {}, takeaway: {}, method: {}, close: {} };
}

function Section({ id, title, locale, children }: { id: SectionId; title?: string; locale: Locale; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`}>
        {title ?? liveCopy(locale).sections[SECTION_KEY[id]]}
      </h2>
      {children}
    </section>
  );
}

/** A number quoted from the plan (the pre-registration's v1 text): fixed, so its ref is `build`. */
const N = ({ v, locale }: { v: number; locale: Locale }) => <Derived value={v} unit="count" refs={BUILD} locale={locale} />;
/** "<5" as text, marked: the label a count from 1 to 4 is printed as. */
const SmallLabel = () => (
  <span data-num="" {...derivedAttr(BUILD)}>
    &lt;5
  </span>
);
/** A status word in semibold, as on the Retention page; the word carries the meaning, never a colour. */
const Status = ({ children }: { children: string }) => (
  <span data-status="" className="font-semibold sm:whitespace-nowrap">
    {children}
  </span>
);
/** The design hash: it may break between any two characters, but its last 8 stay together, so no line holds a lone stub. */
const Hash = ({ value }: { value: string }) => (
  <data value={value} className="break-all" {...derivedAttr(BUILD)}>
    {value.slice(0, -8)}
    <span className="whitespace-nowrap">{value.slice(-8)}</span>
  </data>
);
/** The design hash's first 12 characters in a code chip; the full value is in the pre-registration record. */
const ShortHash = ({ value }: { value: string }) => (
  <code className="rounded-sm border border-hairline-strong bg-surface px-1.5 py-0.5 text-sm whitespace-nowrap">
    <data value={value} {...derivedAttr(BUILD)}>
      {value.slice(0, 12)}
    </data>
  </code>
);

/** The result's heading: "so far" until a decision is recorded. */
const resultTitle = (d: LivePageDisplay, locale: Locale) =>
  d.outcome !== null ? liveCopy(locale).sections.resultsDecided : liveCopy(locale).sections.results;

/**
 * What a reader with two minutes must take away. The second card follows the state; the others are
 * the design, so they hold in every state. While the configuration is in the calibration, the first
 * card says that the comparison has not started.
 */
function keyPoints(d: LivePageDisplay, locale: Locale) {
  const t = liveCopy(locale).keyPoints;
  const n = (v: number) => <N v={v} locale={locale} />;
  const standing: ReactNode =
    d.outcome === 'inconclusive'
      ? t.standing.inconclusive
      : d.outcome !== null
        ? t.standing.decided
        : !isRunning(d)
          ? t.standing.notRunning
          : d.configPhase === 'calibration'
            ? t.standing.calibration
            : t.standing.running;
  return [
    {
      id: 'tested',
      title: t.tested.title,
      body: (
        <>
          {t.tested.body}
          {d.configPhase === 'calibration' && d.outcome === null ? t.tested.calibrationExtra : null}
        </>
      ),
    },
    {
      id: 'standing',
      title: t.standing.title,
      body: <>{t.standing.body({ status: <Status>{stateWords(d, locale)}</Status>, standing })}</>,
    },
    {
      id: 'expect',
      title: d.outcome !== null ? t.expect.titleDecided : t.expect.title,
      body: <>{t.expect.body({ cap: n(225), lift: n(15), eight: n(8), ten: n(10) })}</>,
    },
    {
      id: 'why',
      title: t.why.title,
      body: t.why.body,
    },
  ];
}

/** The result so far: the lead-in for what is drawn, the Figure on its sheet, what it means, the decision and the end. */
function Result({ d, runtime, locale }: { d: LivePageDisplay; runtime?: FigureRuntime; locale: Locale }) {
  const t = liveCopy(locale).result;
  const f = frameLabels(locale);
  const kind = resultsKind(d);
  const range = t.range;
  const open = d.outcome === null && !d.countingClosed && d.mode !== 'held';
  const collecting = kind === 'hollow' && isRunning(d) && !(typeof d.counts.smaller === 'number' && d.counts.smaller >= MIN_PER_GROUP);
  const target = <N v={MIN_PER_GROUP} locale={locale} />;
  return (
    <>
      {kind === 'none' ? (
        <div className="mt-4">
          <ResultsFigure display={d} runtime={runtime} locale={locale} />
        </div>
      ) : (
        <>
          <LeadIn {...f.leadIn}>
            {kind === 'hollow' ? t.hollow(range) : d.configPhase === 'calibration' ? t.calibrationBar(range) : t.bar(range, open)}
          </LeadIn>
          <FigureSheet>
            <ResultsFigure display={d} runtime={runtime} locale={locale} />
          </FigureSheet>
          {collecting ? <Takeaway {...f.takeaway}>{t.collecting(target)}</Takeaway> : null}
        </>
      )}
      <Decision d={d} locale={locale} />
    </>
  );
}

function Plan({ d, locale }: { d: LivePageDisplay; locale: Locale }) {
  const t = liveCopy(locale).plan;
  const n = (v: number) => <N v={v} locale={locale} />;
  const prereg = d.public.prereg;
  const commit = prereg.commit;
  return (
    <>
      <p className={`${P} mt-4`}>{t.meaning}</p>
      <p className={`${P} mt-3`}>{t.fixes}</p>
      <div id="plan-planning" className="mt-3 space-y-3">
        <p className={P}>{t.planning({ cap: n(225), eight: n(8), ten: n(10), lift: n(15), small: n(5), one: n(1), twenty: n(20) })}</p>
        <p className={P}>{t.guardrail({ secs: n(5), margin: n(10), low: n(390), high: n(470) })}</p>
        <p className={P}>{t.views}</p>
      </div>
      <p id="plan-prereg-short" className={`${P} mt-4`}>
        {t.short({ version: <MarkedText value={prereg.version} refs={BUILD} />, hash: <ShortHash value={prereg.configSha256} /> })}
      </p>
      <div className={TEXT}>
        <TextLink href={`${REPO}/blob/${prereg.tag}/docs/experiment/prereg.md`} external standalone>
          {t.readLink}
        </TextLink>
      </div>
      <MethodDetails summary={t.recordSummary}>
        <p id="plan-prereg" className="wrap-anywhere">
          {t.record({
            version: <MarkedText value={prereg.version} refs={BUILD} />,
            tag: <MarkedText value={prereg.tag} refs={BUILD} />,
            hash: <Hash value={prereg.configSha256} />,
          })}
        </p>
        {/* No line when the build recorded no commit: an empty value would read as a fault. */}
        {commit !== null ? (
          <p id="plan-build">{t.build({ commit: <MarkedText value={commit} shown={commit.slice(0, 7)} refs={BUILD} /> })}</p>
        ) : null}
      </MethodDetails>
    </>
  );
}

function SplitCheck({ d, locale }: { d: LivePageDisplay; locale: Locale }) {
  const t = liveCopy(locale).health.split;
  const lead = (
    <p className={`${P} mt-3`}>{t.lead({ one: <N v={1} locale={locale} />, three: <N v={3} locale={locale} /> })}</p>
  );
  let status: ReactNode;
  if (d.public.source === 'unavailable') status = <p className={`${P} mt-3`}>{t.noData}</p>;
  else if (d.mode === 'held') {
    status = <p className={`${P} mt-3`}>{d.split ? t.heldFailed : t.heldNotReported}</p>;
  } else {
    status = (
      <ul className={`${TEXT} mt-3 space-y-2 text-base`}>
        <li>{t.entry(<Status>{t.checks[d.splitStatus.entry]}</Status>)}</li>
        <li>{t.analysed(<Status>{t.checks[d.splitStatus.analysed]}</Status>)}</li>
      </ul>
    );
  }
  return (
    <>
      {lead}
      {status}
      {d.afterDecisionSrm ? <p className={`${P} mt-3`}>{t.later}</p> : null}
    </>
  );
}

/** A decision can still come: the test has not stopped for good and no stop is confirmed. */
const DECISION_AHEAD = new Set(['not-started', 'before-data', 'calibration', 'ab', 'paused']);

function Decision({ d, locale }: { d: LivePageDisplay; locale: Locale }) {
  const t = liveCopy(locale).decision;
  const configRefs: readonly DerivedRef[] = d.refs.includes('simulated') ? ['simulated'] : BUILD;
  const showEnd = d.public.source !== 'unavailable' && WITH_END.includes(d.mode);
  const ahead = DECISION_AHEAD.has(d.mode) && !(d.countingClosed && d.closedConfirmed);
  return (
    <div id="decision" className="mt-6">
      <p id="decision-line" className={`${P} font-semibold`}>
        {d.outcome === null
          ? ahead
            ? t.none.ahead
            : t.none.shown
          : t.decided({
              word: liveCopy(locale).status.decisionWords[d.outcome],
              when: d.decidedOn !== null ? <When iso={d.decidedOn} refs={d.refs} locale={locale} /> : null,
            })}
      </p>
      {showEnd ? (
        <p id="decision-end" className={`${P} mt-3`}>
          {t.end({ earliest: d.plannedEndKind === 'earliest', when: <When iso={d.plannedEnd} refs={configRefs} locale={locale} /> })}
        </p>
      ) : null}
    </div>
  );
}

function CheckItYourself({ d, host, locale }: { d: LivePageDisplay; host: string | null; locale: Locale }) {
  const t = liveCopy(locale).check;
  const source = d.public.source;
  return (
    <>
      <p className={`${P} mt-4`}>
        <a
          href="/experiment/data.json"
          download="data.json"
          data-touch-target=""
          className="inline-flex min-h-(--size-target) items-center text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
        >
          {t.download}
        </a>
      </p>
      <p className={`${P} mt-3`}>
        {t.data({ one: <N v={1} locale={locale} />, four: <N v={4} locale={locale} />, small: <SmallLabel /> })}
      </p>
      {host !== null ? <p className={`${P} mt-3`}>{t.recomputeHost}</p> : <p className={`${P} mt-3`}>{t.recomputeNoHost}</p>}
      <pre
        className="mt-3 max-w-figure overflow-x-auto rounded-md border border-hairline-strong bg-surface p-3 text-sm"
        tabIndex={0}
        role="region"
        aria-label={t.commands}
      >
        <code>
          {host !== null ? (
            <>
              {'curl --fail --silent --show-error https://'}
              <MarkedText value={host} refs={BUILD} />
              {'/experiment/data.json -o data.json\n'}
            </>
          ) : null}
          {'python3 scripts/verify_experiment.py data.json'}
        </code>
      </pre>
      <MethodDetails summary={t.scriptSummary}>
        <p>{t.script1}</p>
        <p>{t.script2(<SmallLabel />)}</p>
      </MethodDetails>
      {source === 'fixture' ? (
        <p className={`${P} mt-3`}>{t.fixture}</p>
      ) : source === 'local' ? (
        <p className={`${P} mt-3`}>{t.local}</p>
      ) : null}
      <div className={`${TEXT} mt-3`}>
        <TextLink href={`${REPO}/blob/${d.public.prereg.commit ?? d.public.prereg.tag}/scripts/verify_experiment.py`} external standalone>
          {t.readScript}
        </TextLink>
      </div>
    </>
  );
}

type Props = {
  display: LivePageDisplay;
  /** The production host for the download command; null names "the address of this page" instead. */
  host: string | null;
  runtime?: FigureRuntime;
  /** The page's language; omitted, English. */
  locale?: Locale;
};

export function LivePage({ display: d, host, runtime, locale = 'en' }: Props): ReactNode {
  const t = liveCopy(locale);
  const f = frameLabels(locale);
  const n = (v: number) => <N v={v} locale={locale} />;
  const preregHref = `${REPO}/blob/${d.public.prereg.tag}/docs/experiment/prereg.md`;
  return (
    <article aria-labelledby="live-test-title">
      <CaseHead
        id="live-test-title"
        chip={t.head.chip}
        title={t.head.title}
        quiet={t.head.quiet}
        intro={<p>{t.head.intro}</p>}
      />

      <StatusCard d={d} locale={locale} />
      <KeyPoints items={keyPoints(d, locale)} {...f.keyPoints} />

      <SectionNav
        {...f.sectionNav}
        items={[
          { href: '#results', label: resultTitle(d, locale) },
          { href: '#plan', label: t.nav.plan },
          { href: '#health', label: t.sections.health },
          { href: '#funnel', label: t.sections.funnel },
          { href: '#check-it-yourself', label: t.sections.checkItYourself },
        ]}
      />

      <Section id="results" title={resultTitle(d, locale)} locale={locale}>
        <Result d={d} runtime={runtime} locale={locale} />
      </Section>

      <Section id="plan" locale={locale}>
        <Plan d={d} locale={locale} />
      </Section>

      <Section id="health" locale={locale}>
        <div id="split-check" className="mt-6">
          <h3 className={H3}>{t.health.splitTitle}</h3>
          <SplitCheck d={d} locale={locale} />
        </div>
        <div id="detectable" className="mt-10">
          <h3 className={H3}>{t.health.detectableTitle}</h3>
          <LeadIn {...f.leadIn}>{t.health.detectableLead({ eight: n(8), ten: n(10) })}</LeadIn>
          <FigureSheet>
            <DetectableFigure
              data={d.public}
              refs={d.refs}
              phase={d.configPhase}
              smaller={d.counts.smaller}
              hideCurrentSize={d.mode === 'srm-suppressed'}
              runtime={runtime}
              locale={locale}
            />
          </FigureSheet>
          <Takeaway {...f.takeaway}>{t.health.detectableTakeaway}</Takeaway>
          <MethodDetails summary={t.health.detectableSummary}>
            <p>{t.detectable.method}</p>
          </MethodDetails>
        </div>
      </Section>

      <Section id="funnel" locale={locale}>
        <LeadIn {...f.leadIn}>{t.funnel.lead}</LeadIn>
        <FigureSheet>
          <FunnelFigure data={d.public} refs={d.refs} runtime={runtime} locale={locale} />
        </FigureSheet>
        <MethodDetails {...f.method}>
          <FunnelMethod locale={locale} />
        </MethodDetails>
        <MethodDetails summary={t.funnel.reasonsSummary}>
          <FunnelExclusions data={d.public} refs={d.refs} locale={locale} />
        </MethodDetails>
      </Section>

      <Section id="check-it-yourself" locale={locale}>
        <CheckItYourself d={d} host={host} locale={locale} />
      </Section>

      <PageClose
        {...f.close}
        links={[
          { href: localHref(locale, '/lab'), label: t.close.lab },
          { href: preregHref, label: t.close.prereg, external: true },
        ]}
      >
        <p>{t.close.body}</p>
      </PageClose>

      <PageCallToAction locale={locale} />
    </article>
  );
}
