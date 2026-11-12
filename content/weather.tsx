// The Weather build note's sourced prose: a public dataset of weather observations rebuilt in 2026
// as a tested SQL pipeline. It tells the pipeline, the star schema, the checks by level and the
// quarantine policy. Every number is a <Fact> from the vendored weather export, or a <Derived> that
// names it; the stages were checked against the pipeline's code at the pinned commit (sql/01 to 03,
// src/pipeline.py, tests/test_pipeline.py and the CI workflow). The page shows counts and rules,
// never a row of the data: the dataset's Kaggle page gives no licence.
import type { ReactNode } from 'react';
import { derivedAttr, Derived } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { WEATHER_DATASET, sparsePlaceThreshold } from '@/lib/weather/checks';

export const WEATHER_TITLE = 'Weather data quality';

/** The year of the rebuild; the pinned export is that rebuild's output. */
const RebuildYear = () => (
  <time dateTime="2026" {...derivedAttr(['source:weather'])}>
    2026
  </time>
);

/** The line under the title: the Work page's description, word for word. */
export function WeatherIntro(): ReactNode {
  return (
    <p>
      A tested SQL pipeline on a public dataset of weather observations, rebuilt in <RebuildYear />: a star schema,
      data-quality checks and a quarantine for sensor errors.
    </p>
  );
}

/** The line on my role under the intro. */
export function WeatherRole(): ReactNode {
  return (
    <>
      A personal project, rebuilt in <RebuildYear /> from my Master&apos;s project. I built the pipeline, the schema,
      the checks and the tests.
    </>
  );
}

export const WEATHER_PROBLEM: readonly [key: string, body: ReactNode][] = [
  [
    'data',
    <>
      The data is one wide file from Kaggle, the {WEATHER_DATASET.name}. A few of its readings cannot be true: one
      reports wind at <Fact id="weather.quarantine.max_wind_kmh" />. Kept, it distorts any summary of wind; deleted
      quietly, it leaves no trace.
    </>,
  ],
  [
    'goal',
    <>
      I wanted a warehouse that is written only when the data passes its checks, and a place where doubtful readings
      stay visible.
    </>,
  ],
];

export const WEATHER_ARCHITECTURE: readonly [key: string, body: ReactNode][] = [
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
      A reading with wind above <Fact id="weather.quarantine.threshold_kmh" /> goes to a quarantine table with its
      reason, never into the fact table. The checks run last.
    </>,
  ],
];

/** The pipeline diagram's stages, in the order they run; the model stage has two tables side by side. */
export const WEATHER_PIPELINE: readonly {
  id: 'source' | 'staging' | 'model' | 'checks' | 'warehouse';
  nodes: readonly { name: string; detail: ReactNode }[];
}[] = [
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
            Wind above <Fact id="weather.quarantine.threshold_kmh" />, with its reason
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
            <Fact id="weather.checks.count" /> checks; <Fact id="weather.checks.error_count" /> stop the build
          </>
        ),
      },
    ],
  },
  { id: 'warehouse', nodes: [{ name: 'Warehouse', detail: 'Written only if every error-level check passes' }] },
];

export const WEATHER_PIPELINE_TITLE = 'The warehouse is written only when every error-level check passes';
export const WEATHER_PIPELINE_CAPTION =
  'The stages in the order they run. A reading over the wind rule goes to the quarantine table instead of the fact table, and the checks count both.';

export const WEATHER_CHECKS: readonly [key: string, body: ReactNode][] = [
  [
    'rules',
    <>
      Each check is a SQL query that counts the rows breaking one rule. The{' '}
      <Fact id="weather.checks.error_count" /> error-level checks include keys and timestamps that are present, one row
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
];

export const WEATHER_TESTS: readonly [key: string, body: ReactNode][] = [
  [
    'tests',
    <>
      Unit tests run the pipeline on small synthetic files: the checks catch an impossible humidity, a repeated place
      and time and a missing measurement, an impossible wind reading lands in quarantine, and a failing error-level
      check leaves no warehouse. Lint and the tests run in GitHub Actions on every push.
    </>,
  ],
];

export const CHECK_LEVELS_TITLE = 'Checks by level';
/** What happens when a check at each level fails (src/pipeline.py stops only on an error-level check). */
export const CHECK_LEVEL_COPY: Readonly<Record<'error' | 'warn' | 'info', { name: string; onFail: string }>> = {
  error: { name: 'Error', onFail: 'The pipeline stops; no warehouse is written' },
  warn: { name: 'Warning', onFail: 'Reported; the build goes on' },
  info: { name: 'Information', onFail: 'Reported; the build goes on' },
};

export const WEATHER_OUTCOME: readonly [key: string, body: ReactNode][] = [
  [
    'loaded',
    <>
      On the full dataset, <Fact id="weather.data.observations" /> observations of <Fact id="weather.data.locations" />{' '}
      places in <Fact id="weather.data.countries" /> countries, over six weeks, load into the star schema, and all{' '}
      <Fact id="weather.checks.error_count" /> error-level checks pass.
    </>,
  ],
  [
    'held',
    <>
      The quarantine holds <Fact id="weather.quarantine.rows" /> readings, with wind between{' '}
      <Fact id="weather.quarantine.min_wind_kmh" /> and <Fact id="weather.quarantine.max_wind_kmh" />. A warning flags{' '}
      <Fact id="weather.checks.sparse_locations" /> places observed fewer than{' '}
      <Derived value={sparsePlaceThreshold()} unit="count" refs={['source:weather']} /> times, which limits any
      comparison between places.
    </>,
  ],
];

export const WEATHER_LIMITS: readonly [key: string, body: ReactNode][] = [
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
];

/** The pipeline's public repository, at the commit this page was checked against. */
export const WEATHER_REPO = {
  base: 'https://github.com/MaHmOuDeB/weather-sql-pipeline',
  commit: 'ca40977d159ca4d662a93e6768a0b2d01babd6b5',
} as const;

/** The dataset link and its licence, then the repository at a fixed commit. */
export function WeatherSources(): ReactNode {
  if (WEATHER_DATASET.licenceStated) throw new Error('weather: the export now states a licence; update the page');
  return (
    <ul>
      <li>
        <TextLink href={WEATHER_DATASET.url} standalone external>
          <span>The data: {WEATHER_DATASET.name}, on Kaggle</span>
        </TextLink>
      </li>
      <li className="mt-2">Its licence: not stated.</li>
      <li className="mt-2">
        <TextLink href={`${WEATHER_REPO.base}/tree/${WEATHER_REPO.commit}`} standalone external>
          <span>The pipeline&apos;s repository, at a fixed commit</span>
        </TextLink>
      </li>
    </ul>
  );
}
