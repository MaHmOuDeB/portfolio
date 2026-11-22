import 'server-only';
import { seq, type KitText } from '@/components/kit/text';

// The kit's words in German: formal "Sie", status words stay words ("SRM bestanden"), "B − A" keeps
// its true minus. A page that names no group passes no `arm` to the phase note, so the group
// sentence below is never shown on a German page. A date that ends a sentence already ends with its
// dot ("25.10."), so no sentence here closes with a second one.
export const KIT_TEXT_DE: KitText = {
  locale: 'de',
  zero: { noDifference: 'kein Unterschied', higher: 'B höher', lower: 'B niedriger' },
  figure: { controlsNeedJs: 'Die Bedienelemente brauchen JavaScript.', controls: 'Bedienelemente' },
  table: { show: 'Zahlen als Tabelle anzeigen', caption: 'Die Zahlen in diesem Diagramm' },
  error: {
    chart: ['Dieses Diagramm konnte nicht geladen werden.', ' Die Zahlen stehen in der Tabelle darunter.'],
    live: [
      'Dieses Diagramm konnte nicht geladen werden.',
      ' Die Zahlen für beide Gruppen stehen in der Tabelle darunter.',
    ],
    diagram: ['Diese Darstellung konnte nicht geladen werden.', ' Der umgebende Text beschreibt dieselben Schritte.'],
    tableCaption: 'Die Zahlen in diesem Diagramm',
  },
  badge: { simulated: 'Simuliert', publicData: 'Öffentliche Daten', live: 'Live von dieser Website' },
  live: {
    updated: 'Aktualisiert',
    progress: (p) => seq('Fortschritt: ', p.n, ' von', ' ', p.target, ' in der kleineren Gruppe'),
    earliestEnd: 'Frühestes Ende',
    plannedEnd: 'Geplantes Ende',
    guardrail: (p) =>
      seq('Schneller Absprung innerhalb von ', p.seconds, ' Sekunden, B − A: ', p.interval, ' ', 'Prozentpunkte; Grenze ', p.limit, '.'),
    nextStep: (p) => seq(' Was ich jetzt tue: ', p.step, '.'),
    unavailable: 'Das Intervall für diese Auswertung liegt nicht vor.',
    inconclusiveCap: 'Ohne klares Ergebnis an der Sechs-Monats-Grenze.',
    inconclusiveFew: (p) =>
      seq(
        'Ohne klares Ergebnis an der Sechs-Monats-Grenze: Es kamen weniger als ',
        p.min,
        ' Aufrufe je Gruppe an, daher wird kein Intervall gezeigt.',
      ),
    shipLead: 'B ausrollen.',
    shipRest: (p) =>
      seq(
        ' Das untere Ende des Intervalls liegt über null (',
        p.interval,
        ' Prozentpunkte), die Guardrail-Metrik für den schnellen Absprung bleibt innerhalb ihrer Grenze, und die Aufteilungsprüfung wurde bestanden.',
      ),
    stopLead: 'Gestoppt: B schnitt schlechter ab.',
    stopRest: (p) => seq(' Das obere Ende des Intervalls liegt unter null (', p.interval, ' Prozentpunkte).'),
    inconclusiveLead: 'Ohne klares Ergebnis an der Sechs-Monats-Grenze:',
    inconclusiveRest: (p) =>
      seq(
        ' Der Unterschied reicht von ',
        p.interval,
        ' Prozentpunkten, daher ist ein Effekt von mehr als',
        ' ',
        p.ruledOut,
        ' Prozentpunkten ausgeschlossen.',
      ),
    paused: 'Pausiert',
    pausedLine: (p) => seq(' am ', p.when, ': ', p.reason, '.'),
    abStarted: (p) => seq('A/B-Test gestartet am ', p.when),
    calibrating: 'Kalibrierung läuft: Beide Gruppen sehen dieselbe Seite.',
    stillRunning: 'Der Test läuft noch.',
    includesZeroYet: 'Das Intervall enthält noch die Null, also ist noch nicht ausgeschlossen, dass es keinen Unterschied gibt.',
    srmPassed: 'SRM bestanden',
    srmFailed: 'SRM nicht bestanden',
    srmFailedRest: '. Die Aufteilungsprüfung wurde nicht bestanden, daher wird kein Ergebnis gezeigt.',
    viewsSoFar: (p) =>
      seq('Bisherige Aufrufe: ', p.a, ' in A,', ' ', p.b, ' in B, wobei der Plan eine gleichmäßige Aufteilung erwartet.'),
    calibrationStopped: (p) => seq('Kalibrierung gestoppt am ', p.when, ': ', p.reason, '.'),
    calibrationRestarts: (p) => seq(' ', 'Die Kalibrierung startet am ', p.when, ' neu.'),
    viewsWhenStopped: (p) => seq('Aufrufe beim Stopp: ', p.a, ' in A,', ' ', p.b, ' in B.'),
    calibrationStoppedPlain: 'Kalibrierung gestoppt.',
  },
  phase: {
    paused: 'Das Experiment auf dieser Website ist pausiert.',
    calibration:
      'Diese Website führt ein Live-Experiment mit ihren eigenen Besuchern durch. Zuerst wird kalibriert, daher sehen alle dieselbe Seite.',
    ab: 'Diese Website führt einen A/B-Test mit ihren Besuchern durch. Diese Seite zeigt Gruppe {group}.',
    abNoGroup: 'Diese Website führt einen A/B-Test mit ihren Besuchern durch.',
    views: (p) => seq(' Bisher gab es ', p.count, ' Aufrufe.'),
    linkPaused: 'Warum das Experiment pausiert ist',
    linkLive: 'Live-Ergebnisse ansehen',
  },
  reset: 'Zurücksetzen',
  step: { locale: 'de', previous: 'Zurück', next: 'Weiter' },
  slider: { exactValue: '{label}, genauer Wert' },
  select: 'Bitte wählen',
  field: { error: 'Fehler: ' },
  count: {
    locale: 'de',
    upTo: 'Bis zu {limit} Zeichen',
    none: 'Keine Zeichen mehr frei',
    left: { one: 'Noch {n} Zeichen', other: 'Noch {n} Zeichen' },
    over: { one: '{n} Zeichen zu viel', other: '{n} Zeichen zu viel' },
  },
  confidence: {
    xLabel: 'Aufrufe je Gruppe',
    yLabel: 'B − A (Prozentpunkte)',
    yourView: 'Ihr Aufruf',
    aria: {
      pausedIdentical:
        'Der Unterschied zwischen den beiden identischen Gruppen bei wachsender Zahl der Aufrufe je Gruppe bis zur Pause: Das letzte Intervall {where}',
      pausedGroups:
        'Der Unterschied zwischen den Gruppen, B minus A, bei wachsender Zahl der Aufrufe je Gruppe bis zur Pause: Das letzte Intervall {where}',
      pausedWhere: { includesZero: 'enthält die Null', aboveZero: 'liegt über null', belowZero: 'liegt unter null' },
      calibration:
        'Der Unterschied zwischen den beiden identischen Gruppen bei wachsender Zahl der Aufrufe je Gruppe: {where}',
      calibrationWhere: {
        includes: 'Das aktuelle Intervall enthält die Null',
        excludes: 'Das aktuelle Intervall enthält die Null nicht',
      },
      running: 'Der Unterschied zwischen den Gruppen, B minus A, bei wachsender Zahl der Aufrufe je Gruppe: {where}',
      which: { current: 'Das aktuelle Intervall', final: 'Das endgültige Intervall' },
      runningWhere: {
        includesFinal: '{which} enthält die Null',
        includesRunning: '{which} enthält noch die Null, also ist noch nicht ausgeschlossen, dass es keinen Unterschied gibt',
        above: '{which} liegt über null: B höher',
        below: '{which} liegt unter null: B niedriger',
      },
    },
  },
  nowRow: {
    labels: { now: 'jetzt', final: 'endgültig', last: 'zuletzt' },
    estimatesAppear: (p) => seq('Schätzwerte erscheinen ab ', p.target, ' Aufrufen je Gruppe, wie die Präregistrierung es vorsieht.'),
    due: (p) => seq(p.target, ' Aufrufe je Gruppe sind erreicht; der erste Schätzwert erscheint bei der nächsten Auswertung.'),
  },
};
