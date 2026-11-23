// The Weather build note's sourced prose: a public dataset of weather observations rebuilt in 2026
// as a tested SQL pipeline. It tells the pipeline, the star schema, the checks by level and the
// quarantine policy. Every number is a <Fact> from the vendored weather export (the commit pinned in
// sources.lock.json), or a <Derived> that names it; the stages were checked against the pipeline's
// code at that export's commit (sql/01 to 03, src/pipeline.py, tests/test_pipeline.py and the CI
// workflow). The page shows counts and rules, never a row of the data: the dataset's Kaggle page
// gives no licence.
import type { ReactNode } from 'react';
import type { GlanceParts } from '@/components/depth/GlanceBlock';
import type { Items, NoteSlots } from '@/components/build-notes/slots';
import { derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { WEATHER_DATASET } from '@/lib/weather/checks';

// The words are a `WeatherCopy`: WEATHER_EN here, the German twin in content/de/weather.tsx typed by the
// same type, so a missing key fails the typecheck. A sentence with a number is a function of the slots,
// which hold the numbers as elements in the page's language. Server only: no client file imports it.
export type WeatherSlots = NoteSlots & {
  /** The check rule for sparse places, as a derived number. */
  threshold: ReactNode;
  /** The year of the rebuild, as a derived <time>. */
  year: ReactNode;
};

export type WeatherCopy = {
  /** The h1 in two tones; the document title is WEATHER_TITLE (content/seo.ts). */
  h1: string;
  quiet: string;
  intro: (s: WeatherSlots) => ReactNode;
  glance: (s: WeatherSlots) => GlanceParts;
  problem: (s: WeatherSlots) => Items;
  architecture: (s: WeatherSlots) => Items;
  pipeline: {
    leadIn: string;
    takeaway: (s: WeatherSlots) => ReactNode;
    title: string;
    caption: string;
    stages: (s: WeatherSlots) => readonly {
      id: 'source' | 'staging' | 'model' | 'checks' | 'warehouse';
      nodes: readonly { name: string; detail: ReactNode }[];
    }[];
  };
  checks: (s: WeatherSlots) => Items;
  tests: { summary: string; body: (s: WeatherSlots) => Items };
  levels: {
    title: string;
    columns: readonly [level: string, checks: string, onFail: string];
    copy: Readonly<Record<'error' | 'warn' | 'info', { name: string; onFail: string }>>;
  };
  outcome: (s: WeatherSlots) => Items;
  limits: (s: WeatherSlots) => Items;
  close: string;
  sources: {
    data: (datasetName: string) => ReactNode;
    licence: string;
    repo: string;
  };
};

export const WEATHER_TITLE = 'Weather data quality';

/** The year of the rebuild; the pinned export is that rebuild's output. */
export const RebuildYear = () => (
  <time dateTime="2026" {...derivedAttr(['source:weather'])}>
    2026
  </time>
);

/** The pipeline's public repository, at a fixed commit of its default branch. */
export const WEATHER_REPO = {
  base: 'https://github.com/MaHmOuDeB/weather-sql-pipeline',
  commit: 'ca40977d159ca4d662a93e6768a0b2d01babd6b5',
} as const;

export const WEATHER_EN: WeatherCopy = {
  h1: 'A SQL pipeline that stops on bad data,',
  quiet: 'and keeps the doubtful rows visible.',
  /** The plain opening under the title. Every number is a Fact. */
  intro: (s) => (
    <p>
      One reading in this public weather dataset reports wind at {s.fact('weather.quarantine.max_wind_kmh')}. Keep it
      and every wind average is off; delete it and nobody knows it was there. I built a pipeline that sets such readings
      aside with their reason and refuses to publish the data unless {s.fact('weather.checks.error_count')} of its{' '}
      {s.fact('weather.checks.count')} checks pass.
    </p>
  ),
  /** The 20-second top of the page: two pull figures, one sentence and the facts. */
  glance: (s) => ({
    points: [
      { id: 'checks', figure: s.fact('weather.checks.count'), label: 'data-quality checks' },
      { id: 'quarantine', figure: s.fact('weather.quarantine.rows'), label: 'impossible readings held in quarantine' },
    ],
    outcome: 'The warehouse is written only when every error-level check passes, and impossible readings wait in quarantine with their reason.',
    role: 'I built the pipeline, the schema, the checks and the tests.',
    methods: (
      <>
        Star schema, {s.fact('weather.checks.count')} checks, quarantine.
      </>
    ),
    tools: 'DuckDB SQL, Python, pytest.',
    when: 'Rebuilt in 2026.',
    scope: (
      <>
        A personal project on a public dataset, rebuilt in {s.year} from my Master&apos;s project.
      </>
    ),
  }),
  problem: () => [
    [
      'data',
      <>
        The data is one wide file from Kaggle, the {WEATHER_DATASET.name}. A few of its readings cannot be true.
      </>,
    ],
    [
      'goal',
      <>
        I wanted a warehouse that is written only when the data passes its error-level checks, and a place where
        doubtful readings stay visible.
      </>,
    ],
  ],
  architecture: (s) => [
    [
      'stages',
      <>
        Python loads the file into DuckDB and runs three SQL steps. Staging gives the columns types and plain names, and
        merges condition spellings that differ only in case or in leading and trailing spaces. The model builds a
        star schema: places, weather conditions and a fact table of observations.
      </>,
    ],
    [
      'quarantine',
      <>
        A reading with wind above {s.fact('weather.quarantine.threshold_kmh')} goes to a quarantine table with its
        reason, never into the fact table. The checks run last.
      </>,
    ],
  ],
  pipeline: {
    /** What to look at in the pipeline diagram, and what it means. */
    leadIn: 'Follow a reading from the file to the warehouse, or to the quarantine.',
    takeaway: (s) => (
      <>
        Bad readings are neither trusted nor thrown away: {s.fact('weather.quarantine.rows')} sit in quarantine.
      </>
    ),
    title: 'The warehouse is written only when every error-level check passes',
    caption:
      'The stages in the order they run. A reading over the wind rule goes to the quarantine table instead of the fact table, and the checks count both.',
    /** The stages in the order they run; the model stage has two tables side by side. */
    stages: (s) => [
      { id: 'source', nodes: [{ name: 'Kaggle file', detail: 'One wide CSV of observations' }] },
      { id: 'staging', nodes: [{ name: 'Staging', detail: 'Types, plain names, merged spellings' }] },
      {
        id: 'model',
        nodes: [
          { name: 'Star schema', detail: 'Places, conditions and observations' },
          {
            name: 'Quarantine',
            detail: (
              <>
                Wind above {s.fact('weather.quarantine.threshold_kmh')}, with its reason
              </>
            ),
          },
        ],
      },
      {
        id: 'checks',
        nodes: [
          {
            name: 'Checks',
            detail: (
              <>
                {s.fact('weather.checks.count')} checks; {s.fact('weather.checks.error_count')} stop the build
              </>
            ),
          },
        ],
      },
      { id: 'warehouse', nodes: [{ name: 'Warehouse', detail: 'Written only if every error-level check passes' }] },
    ],
  },
  checks: (s) => [
    [
      'rules',
      <>
        Each check is a SQL query that counts the rows breaking one rule. The{' '}
        {s.fact('weather.checks.error_count')} error-level checks include keys and timestamps that are present, one row
        per place and time, no missing measurements, values in a plausible range and valid coordinates; one proves that
        the staging rows equal the fact rows plus the quarantined rows, so no reading disappears.
      </>,
    ],
    [
      'stop',
      <>
        If any error-level check fails, the pipeline stops and writes no warehouse.
      </>,
    ],
  ],
  tests: {
    summary: 'The unit tests',
    body: () => [
      [
        'tests',
        <>
          Unit tests run the pipeline on small synthetic files: the checks catch an impossible humidity, a repeated place
          and time and a missing measurement, an impossible wind reading lands in quarantine, and a failing error-level
          check leaves no warehouse. Lint and the tests run in GitHub Actions on every push.
        </>,
      ],
    ],
  },
  levels: {
    title: 'Checks by level',
    columns: ['Level', 'Checks', 'When one fails'],
    /** What happens when a check at each level fails (src/pipeline.py stops only on an error-level check). */
    copy: {
      error: { name: 'Error', onFail: 'The pipeline stops; no warehouse is written' },
      warn: { name: 'Warning', onFail: 'Reported; the build goes on' },
      info: { name: 'Information', onFail: 'Reported; the build goes on' },
    },
  },
  outcome: (s) => [
    [
      'loaded',
      <>
        On the full dataset, {s.fact('weather.data.observations')} observations of {s.fact('weather.data.locations')}{' '}
        places in {s.fact('weather.data.countries')} countries, over six weeks, go through the pipeline, and all{' '}
        {s.fact('weather.checks.error_count')} error-level checks pass.
      </>,
    ],
    [
      'held',
      <>
        The quarantine holds {s.fact('weather.quarantine.rows')} of them, with wind between{' '}
        {s.fact('weather.quarantine.min_wind_kmh')} and {s.fact('weather.quarantine.max_wind_kmh')}; every other
        reading loads into the star schema. A warning flags{' '}
        {s.fact('weather.checks.sparse_locations')} places observed fewer than{' '}
        {s.threshold} times, which limits any
        comparison between places.
      </>,
    ],
  ],
  limits: () => [
    [
      'threshold',
      <>
        The quarantine rule is one threshold on wind speed. It catches readings that are plainly impossible, not a sensor
        that is slightly off.
      </>,
    ],
    [
      'plausible',
      <>
        The checks show that the data is complete, consistent and plausible, not that it is right: a wrong reading
        within its range passes.
      </>,
    ],
    [
      'licence',
      <>
        The dataset&apos;s Kaggle page gives no licence, so this page shows counts and rules, never rows of the data.
      </>,
    ],
  ],
  close: 'My pipelines refuse to load bad data quietly.',
  sources: {
    data: (name) => <>The data: {name}, on Kaggle</>,
    licence: 'Its licence: not stated.',
    repo: "The pipeline's repository, at a fixed commit",
  },
};

/** The dataset link and its licence, then the repository at a fixed commit. */
export function WeatherSources({ copy }: { copy: WeatherCopy['sources'] }): ReactNode {
  if (WEATHER_DATASET.licenceStated) throw new Error('weather: the export now states a licence; update the page');
  return (
    <ul>
      <li>
        <TextLink href={WEATHER_DATASET.url} standalone external>
          <span>{copy.data(WEATHER_DATASET.name)}</span>
        </TextLink>
      </li>
      <li className="mt-2">{copy.licence}</li>
      <li className="mt-2">
        <TextLink href={`${WEATHER_REPO.base}/tree/${WEATHER_REPO.commit}`} standalone external>
          <span>{copy.repo}</span>
        </TextLink>
      </li>
    </ul>
  );
}
