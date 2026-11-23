import 'server-only';
import { WEATHER_DATASET } from '@/lib/weather/checks';
import type { WeatherCopy } from '../weather';

// The Weather build note in German: formal "Sie" where it addresses the reader, facts in the first
// person, one German sentence per English sentence, typed by WeatherCopy so a missing key fails the
// typecheck. Numbers are never typed: they arrive as slots (a Fact or a Derived in German). The data is
// a public dataset, rebuilt in 2026. The check names stay English (they are never printed here); the
// words "Fehler", "Warnung" and "Information" name the check levels.
export const WEATHER_DE: WeatherCopy = {
  h1: 'Eine SQL-Pipeline, die bei fehlerhaften Daten stoppt,',
  quiet: 'und die zweifelhaften Zeilen sichtbar lässt.',
  intro: (s) => (
    <p>
      Ein Messwert in diesem öffentlichen Wetterdatensatz meldet Wind mit {s.fact('weather.quarantine.max_wind_kmh')}.
      Behält man ihn, ist jeder Windmittelwert falsch; löscht man ihn, weiß niemand, dass es ihn gab. Ich habe eine
      Pipeline gebaut, die solche Messwerte mit ihrer Begründung beiseitelegt und die Daten nur veröffentlicht, wenn{' '}
      {s.fact('weather.checks.error_count')} ihrer {s.fact('weather.checks.count')} Prüfungen bestehen.
    </p>
  ),
  glance: (s) => ({
    points: [
      { id: 'checks', figure: s.fact('weather.checks.count'), label: 'Datenqualitätsprüfungen' },
      { id: 'quarantine', figure: s.fact('weather.quarantine.rows'), label: 'unmögliche Messwerte in Quarantäne' },
    ],
    outcome:
      'Das Warehouse wird nur geschrieben, wenn jede Prüfung auf Fehlerstufe besteht, und unmögliche Messwerte warten mit ihrer Begründung in Quarantäne.',
    role: 'Ich habe die Pipeline, das Schema, die Prüfungen und die Tests gebaut.',
    methods: (
      <>
        Sternschema, {s.fact('weather.checks.count')} Prüfungen, Quarantäne.
      </>
    ),
    tools: 'DuckDB SQL, Python, pytest.',
    when: '2026 neu aufgebaut.',
    scope: (
      <>
        Ein persönliches Projekt mit einem öffentlichen Datensatz, {s.year} aus meinem Masterprojekt neu aufgebaut.
      </>
    ),
  }),
  problem: () => [
    [
      'data',
      <>
        Die Daten sind eine breite Datei von Kaggle: das {WEATHER_DATASET.name}. Einige ihrer Messwerte können nicht stimmen.
      </>,
    ],
    [
      'goal',
      <>
        Ich wollte ein Warehouse, das nur geschrieben wird, wenn die Daten ihre Prüfungen auf Fehlerstufe bestehen, und
        einen Ort, an dem zweifelhafte Messwerte sichtbar bleiben.
      </>,
    ],
  ],
  architecture: (s) => [
    [
      'stages',
      <>
        Python lädt die Datei in DuckDB und führt drei SQL-Schritte aus. Das Staging gibt den Spalten Typen und klare
        Namen und führt Schreibweisen von Wetterlagen zusammen, die sich nur in Groß- und Kleinschreibung oder in
        Leerzeichen am Anfang und Ende unterscheiden. Das Modell baut ein Sternschema: Orte, Wetterlagen und eine
        Faktentabelle der Beobachtungen.
      </>,
    ],
    [
      'quarantine',
      <>
        Ein Messwert mit Wind über {s.fact('weather.quarantine.threshold_kmh')} kommt mit seiner Begründung in eine
        Quarantänetabelle und nie in die Faktentabelle. Die Prüfungen laufen zuletzt.
      </>,
    ],
  ],
  pipeline: {
    leadIn: 'Folgen Sie einem Messwert von der Datei bis ins Warehouse oder in die Quarantäne.',
    takeaway: (s) => (
      <>
        Schlechte Messwerte werden weder ungeprüft übernommen noch weggeworfen: {s.fact('weather.quarantine.rows')} liegen
        in Quarantäne.
      </>
    ),
    title: 'Das Warehouse wird nur geschrieben, wenn jede Prüfung auf Fehlerstufe besteht',
    caption:
      'Die Stufen in der Reihenfolge, in der sie laufen. Ein Messwert über der Windregel kommt statt in die Faktentabelle in die Quarantänetabelle, und die Prüfungen zählen beide.',
    stages: (s) => [
      { id: 'source', nodes: [{ name: 'Kaggle-Datei', detail: 'Eine breite CSV mit Beobachtungen' }] },
      {
        id: 'staging',
        nodes: [{ name: 'Staging', detail: 'Typen, klare Namen, zusammengeführte Schreibweisen' }],
      },
      {
        id: 'model',
        nodes: [
          { name: 'Sternschema', detail: 'Orte, Wetterlagen und Beobachtungen' },
          {
            name: 'Quarantäne',
            detail: (
              <>
                Wind über {s.fact('weather.quarantine.threshold_kmh')}, mit Begründung
              </>
            ),
          },
        ],
      },
      {
        id: 'checks',
        nodes: [
          {
            name: 'Prüfungen',
            detail: (
              <>
                {s.fact('weather.checks.count')} Prüfungen; {s.fact('weather.checks.error_count')} stoppen den Build
              </>
            ),
          },
        ],
      },
      {
        id: 'warehouse',
        nodes: [{ name: 'Warehouse', detail: 'Wird nur geschrieben, wenn jede Prüfung auf Fehlerstufe besteht' }],
      },
    ],
  },
  checks: (s) => [
    [
      'rules',
      <>
        Jede Prüfung ist eine SQL-Abfrage, die die Zeilen zählt, die eine Regel verletzen. Zu den{' '}
        {s.fact('weather.checks.error_count')} Prüfungen auf Fehlerstufe gehören: Schlüssel und Zeitstempel sind
        vorhanden, eine Zeile je Ort und Zeitpunkt, keine fehlenden Messungen, Werte in einem plausiblen Bereich und
        gültige Koordinaten; eine beweist, dass die Staging-Zeilen den Faktenzeilen plus den Quarantänezeilen
        entsprechen, sodass kein Messwert verschwindet.
      </>,
    ],
    [
      'stop',
      <>
        Besteht eine Prüfung auf Fehlerstufe nicht, stoppt die Pipeline und schreibt kein Warehouse.
      </>,
    ],
  ],
  tests: {
    summary: 'Die Unit-Tests',
    body: () => [
      [
        'tests',
        <>
          Unit-Tests lassen die Pipeline auf kleinen synthetischen Dateien laufen: Die Prüfungen erkennen eine
          unmögliche Luftfeuchtigkeit, einen wiederholten Ort mit demselben Zeitpunkt und eine fehlende Messung, ein
          unmöglicher Windmesswert landet in Quarantäne, und eine fehlgeschlagene Prüfung auf Fehlerstufe hinterlässt
          kein Warehouse. Lint und die Tests laufen bei jedem Push in GitHub Actions.
        </>,
      ],
    ],
  },
  levels: {
    title: 'Prüfungen nach Stufe',
    columns: ['Stufe', 'Prüfungen', 'Wenn eine fehlschlägt'],
    copy: {
      error: { name: 'Fehler', onFail: 'Die Pipeline stoppt; es wird kein Warehouse geschrieben' },
      warn: { name: 'Warnung', onFail: 'Wird gemeldet; der Build läuft weiter' },
      info: { name: 'Information', onFail: 'Wird gemeldet; der Build läuft weiter' },
    },
  },
  outcome: (s) => [
    [
      'loaded',
      <>
        Auf dem vollständigen Datensatz laufen {s.fact('weather.data.observations')} Beobachtungen von{' '}
        {s.fact('weather.data.locations')} Orten in {s.fact('weather.data.countries')} Ländern über sechs Wochen durch
        die Pipeline, und alle {s.fact('weather.checks.error_count')} Prüfungen auf Fehlerstufe bestehen.
      </>,
    ],
    [
      'held',
      <>
        Die Quarantäne enthält {s.fact('weather.quarantine.rows')} davon, mit Wind zwischen{' '}
        {s.fact('weather.quarantine.min_wind_kmh')} und {s.fact('weather.quarantine.max_wind_kmh')}; jeder andere
        Messwert wird ins Sternschema geladen. Eine Warnung markiert {s.fact('weather.checks.sparse_locations')} Orte,
        die weniger als {s.threshold} Mal beobachtet wurden, was jeden Vergleich zwischen Orten einschränkt.
      </>,
    ],
  ],
  limits: () => [
    [
      'threshold',
      <>
        Die Quarantäneregel ist ein einzelner Schwellenwert für die Windgeschwindigkeit. Sie erfasst Messwerte, die
        offensichtlich unmöglich sind, nicht einen Sensor, der nur leicht danebenliegt.
      </>,
    ],
    [
      'plausible',
      <>
        Die Prüfungen zeigen, dass die Daten vollständig, konsistent und plausibel sind, nicht dass sie richtig sind:
        Ein falscher Messwert innerhalb seines Bereichs kommt durch.
      </>,
    ],
    [
      'licence',
      <>
        Auf der Kaggle-Seite des Datensatzes ist keine Lizenz angegeben, deshalb zeigt diese Seite Anzahlen und Regeln,
        nie Zeilen der Daten.
      </>,
    ],
  ],
  close: 'Meine Pipelines weigern sich, schlechte Daten stillschweigend zu laden.',
  sources: {
    data: (name) => <>Die Daten: {name}, auf Kaggle</>,
    licence: 'Ihre Lizenz: nicht angegeben.',
    repo: 'Das Repository der Pipeline, an einem festen Commit',
  },
};
