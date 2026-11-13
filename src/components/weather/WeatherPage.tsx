// The Weather build note: a public dataset rebuilt in 2026 as a tested SQL pipeline. The frame is
// the build-note outline (../build-notes/BuildNote.tsx); the prose comes from content/weather.tsx;
// the evidence is the pipeline diagram and the open table of checks by level, whose counts the
// source adapter reads from the vendored export (src/lib/weather/checks.ts). Static, server only.
import type { ReactNode } from 'react';
import { DataTable } from '@/components/kit/DataTable';
import { Figure } from '@/components/kit/Figure';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { checkLevels, weatherProvenance } from '@/lib/weather/checks';
import {
  CHECK_LEVEL_COPY,
  CHECK_LEVELS_TITLE,
  WEATHER_ARCHITECTURE,
  WEATHER_CHECKS,
  WEATHER_LIMITS,
  WEATHER_OUTCOME,
  WEATHER_PIPELINE,
  WEATHER_PIPELINE_CAPTION,
  WEATHER_PIPELINE_TITLE,
  WEATHER_PROBLEM,
  WEATHER_TESTS,
  WEATHER_TITLE,
  WeatherIntro,
  WeatherRole,
  WeatherSources,
} from '../../../content/weather';
import {
  BUILD_NOTE_SECTIONS,
  BuildNote,
  DiagramConnector,
  DiagramStep,
  EVIDENCE,
  NoteList,
  Paragraphs,
  TEXT,
} from '../build-notes/BuildNote';
import { NoteShot } from '../build-notes/NoteShot';

export { WEATHER_TITLE };
export const WEATHER_SECTIONS = BUILD_NOTE_SECTIONS;

/** The stages as an ordered list, so the diagram is its own text alternative. */
function PipelineDiagram() {
  return (
    <Figure kind="diagram" id="weather-pipeline" title={WEATHER_PIPELINE_TITLE} caption={WEATHER_PIPELINE_CAPTION}>
      <ol className="grid max-w-text gap-0">
        {WEATHER_PIPELINE.map((stage, i) => (
          <li key={stage.id} data-stage={stage.id}>
            {i > 0 ? <DiagramConnector /> : null}
            <div className={stage.nodes.length > 1 ? 'grid gap-3 xs:grid-cols-2' : ''}>
              {stage.nodes.map((n) => (
                <DiagramStep key={n.name} name={n.name} detail={n.detail} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

/** The checks at each level and what a failure does: a sourced table with its heading and badge. */
function CheckLevelsTable() {
  const table = {
    columns: ['Level', 'Checks', 'When one fails'],
    rows: checkLevels().map(({ level, count }) => [CHECK_LEVEL_COPY[level].name, count, CHECK_LEVEL_COPY[level].onFail]),
    formats: ['number', 'count', 'number'] as ('number' | 'count')[],
    refs: ['weather.checks.error_count', 'weather.checks.count', 'source:weather'] as const,
  };
  return (
    <div className={`${EVIDENCE} max-w-figure`}>
      <h3 id="check-levels-heading" className={`${TEXT} text-xl font-semibold`}>
        {CHECK_LEVELS_TITLE}
      </h3>
      <div className="mt-3">
        <DataTable id="check-levels" caption={CHECK_LEVELS_TITLE} table={table} mode="open" />
      </div>
      <div className="mt-2">
        <ProvenanceBadge kind={weatherProvenance()} />
      </div>
    </div>
  );
}

export function WeatherPage(): ReactNode {
  return (
    <BuildNote
      slug="weather"
      title={WEATHER_TITLE}
      intro={<WeatherIntro />}
      role={<WeatherRole />}
      sections={{
        problem: <Paragraphs items={WEATHER_PROBLEM} />,
        architecture: (
          <>
            <Paragraphs items={WEATHER_ARCHITECTURE} />
            <div className={EVIDENCE}>
              <PipelineDiagram />
            </div>
          </>
        ),
        'how-i-checked-this': (
          <>
            <Paragraphs items={WEATHER_CHECKS} />
            <NoteShot shot="weatherChecks" />
            <CheckLevelsTable />
            <div className="mt-8">
              <Paragraphs items={WEATHER_TESTS} />
            </div>
          </>
        ),
        outcome: <Paragraphs items={WEATHER_OUTCOME} />,
        limits: (
          <div className={TEXT}>
            <NoteList items={WEATHER_LIMITS} />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <WeatherSources />
          </div>
        ),
      }}
    />
  );
}
