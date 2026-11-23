// The Weather build note: a public dataset rebuilt in 2026 as a tested SQL pipeline. The frame is
// the build-note outline (../build-notes/BuildNote.tsx); the prose comes from content/weather.tsx
// (German: content/de/weather.tsx, picked by `locale`); the evidence is the pipeline diagram and the
// open table of checks by level, whose counts the source adapter reads from the vendored export
// (src/lib/weather/checks.ts). Static, server only.
import type { ReactNode } from 'react';
import { DataTable } from '@/components/kit/DataTable';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import { Derived } from '@/components/kit/Derived';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { KIT_TEXT_EN } from '@/components/kit/text';
import type { Locale } from '@/lib/i18n/locale';
import { checkLevels, sparsePlaceThreshold, weatherProvenance } from '@/lib/weather/checks';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { RebuildYear, WEATHER_REPO, WEATHER_TITLE, WeatherSources, type WeatherCopy, type WeatherSlots } from '../../../content/weather';
import {
  BUILD_NOTE_SECTIONS,
  BuildNote,
  DiagramConnector,
  DiagramStep,
  NoteList,
  Paragraphs,
  TEXT,
} from '../build-notes/BuildNote';
import { buildNoteText } from '../build-notes/copy';
import { NoteShot } from '../build-notes/NoteShot';
import { keyed, noteSlots, numberLocale } from '../build-notes/slots';
import { weatherCopy } from './copy';

export { WEATHER_TITLE };
export const WEATHER_SECTIONS = BUILD_NOTE_SECTIONS;

/** The stages as an ordered list, so the diagram is its own text alternative. */
function PipelineDiagram({ copy, slots, locale }: { copy: WeatherCopy; slots: WeatherSlots; locale: Locale }) {
  return (
    <Figure
      kind="diagram"
      id="weather-pipeline"
      title={copy.pipeline.title}
      caption={copy.pipeline.caption}
      text={locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN}
    >
      <ol className="grid max-w-text gap-0">
        {copy.pipeline.stages(slots).map((stage, i) => (
          <li key={stage.id} data-stage={stage.id}>
            {i > 0 ? <DiagramConnector /> : null}
            <div className={stage.nodes.length > 1 ? 'grid gap-3 xs:grid-cols-2' : ''}>
              {/* Stacked under xs, a stage's other nodes are indented: a branch, not the next step. */}
              {stage.nodes.map((n, j) => (
                <DiagramStep key={n.name} name={n.name} detail={n.detail} className={j > 0 ? 'max-xs:ml-6' : undefined} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/** The checks at each level and what a failure does: a sourced table with its heading and badge. */
function CheckLevelsTable({ copy, locale }: { copy: WeatherCopy; locale: Locale }) {
  const { levels } = copy;
  const table = {
    columns: [...levels.columns],
    rows: checkLevels().map(({ level, count }) => [levels.copy[level].name, count, levels.copy[level].onFail]),
    formats: ['number', 'count', 'number'] as ('number' | 'count')[],
    refs: ['weather.checks.error_count', 'weather.checks.count', 'source:weather'] as const,
  };
  const kit = locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN;
  return (
    <div className="max-w-figure">
      <h3 id="check-levels-heading" className={`${TEXT} text-xl font-semibold`}>
        {levels.title}
      </h3>
      <div className="mt-3">
        <div className="[&_table]:w-full">
          <DataTable id="check-levels" caption={levels.title} table={table} mode="open" text={kit} />
        </div>
      </div>
      <div className="mt-2">
        <ProvenanceBadge kind={weatherProvenance()} text={kit.badge} />
      </div>
    </div>
  );
}

export function WeatherPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = weatherCopy(locale);
  const text = buildNoteText(locale);
  const slots: WeatherSlots = {
    ...noteSlots(locale),
    threshold: (
      <Derived value={sparsePlaceThreshold()} unit="count" refs={['source:weather']} locale={numberLocale(locale)} />
    ),
    year: <RebuildYear />,
  };
  const code = `${WEATHER_REPO.base}/tree/${WEATHER_REPO.commit}`;
  return (
    <BuildNote
      slug="weather"
      locale={locale}
      title={copy.h1}
      quiet={copy.quiet}
      intro={copy.intro(slots)}
      actions={[{ href: code, label: text.github, icon: 'github', external: true }]}
      glance={copy.glance(slots)}
      sections={{
        problem: <Paragraphs items={keyed(copy.problem(slots))} />,
        architecture: (
          <>
            <Paragraphs items={keyed(copy.architecture(slots))} />
            <LeadIn label={text.leadIn}>{copy.pipeline.leadIn}</LeadIn>
            <FigureSheet>
              <PipelineDiagram copy={copy} slots={slots} locale={locale} />
            </FigureSheet>
            <Takeaway label={text.takeaway}>{copy.pipeline.takeaway(slots)}</Takeaway>
          </>
        ),
        'how-i-checked-this': (
          <>
            <Paragraphs items={keyed(copy.checks(slots))} />
            <FigureSheet label={text.screenshot}>
              <NoteShot shot="weatherChecks" locale={locale} />
            </FigureSheet>
            <FigureSheet>
              <CheckLevelsTable copy={copy} locale={locale} />
            </FigureSheet>
            <MethodDetails summary={copy.tests.summary}>
              <Paragraphs items={keyed(copy.tests.body(slots))} />
            </MethodDetails>
          </>
        ),
        outcome: <Paragraphs items={keyed(copy.outcome(slots))} />,
        limits: (
          <div className={TEXT}>
            <NoteList items={keyed(copy.limits(slots))} />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <WeatherSources copy={copy.sources} />
          </div>
        ),
      }}
      close={{ body: <p>{copy.close}</p>, links: [{ href: code, label: text.github, external: true }] }}
    />
  );
}
