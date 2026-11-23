import 'server-only';
import type { FrameworkText } from '@/lib/audible/text';
import { labKitSlice } from '@/lib/lab/text-common';
import { slot } from '@/lib/retention/sentence';
import type { AudibleCopy } from '../audible';
import { FRAME_DE } from './frame';
import { KIT_TEXT_DE } from './kit';

// The Audible case study in German: formal "Sie", the owner's statements in the first person, one
// German sentence per English sentence, typed by AudibleCopy so a missing key fails the typecheck.
// Numbers are never typed: they arrive as slots (a Fact in German). The truth rules hold in German:
// "mitgewirkt" and "gearbeitet mit" for the teams' tests, never "verantwortet", "geleitet" or "definiert";
// the three teams came one after another; the 25+ tests go with web and mobile and the markets with the
// tool; the adoption count keeps its "Warum so viele?" context; the tool is always "Tampermonkey mit
// einem Schritt-Rekorder". The demo product and its metrics are made up and name nothing from the job.

const FRAMEWORK_DE: FrameworkText = {
  kit: labKitSlice(KIT_TEXT_DE),
  title: 'Wo die beiden Intervalle liegen, bestimmt die Entscheidung',
  decision: {
    ship: 'Ausrollen: Die Hauptmetrik ist gestiegen, die Guardrail-Metrik ist intakt',
    'ship-neutral': 'Darf ausgerollt werden: neutral bei der Hauptmetrik, Guardrail-Metrik intakt',
    harm: 'Stopp: Die Hauptmetrik ist gesunken',
    hold: 'Zurückhalten: Das obere Ende der Guardrail-Metrik liegt über ihrer Grenze',
  },
  chartName: {
    ship: 'Das Intervall der Hauptmetrik liegt über null, und das obere Ende der Guardrail-Metrik liegt innerhalb ihrer Grenze',
    'ship-neutral':
      'Das Intervall der Hauptmetrik erreicht die Null, und das obere Ende der Guardrail-Metrik liegt innerhalb ihrer Grenze',
    harm: 'Das Intervall der Hauptmetrik liegt unter null',
    hold: 'Das obere Ende der Guardrail-Metrik liegt über ihrer Grenze',
  },
  sliders: {
    lower: { label: 'Sitzungsabschluss, unteres Ende', hint: 'niedrigste plausible Veränderung' },
    upper: { label: 'Sitzungsabschluss, oberes Ende', hint: 'höchste plausible Veränderung' },
    guardrail: { label: 'Hilfeanfragen, oberes Ende', hint: 'höchste plausible Veränderung' },
  },
  valueText: '{value} Prozentpunkte',
  readout: '{value} Prozentpunkte, {hint}',
  metrics: ['Sitzungsabschluss', 'Hilfeanfragen'],
  metricsNarrow: ['Abschluss', 'Hilfeanfragen'],
  axis: { x: 'Metrik', y: 'Veränderung (Prozentpunkte)' },
  zero: { noChange: 'unverändert', higher: 'höher', lower: 'niedriger' },
  limit: 'Grenze {value}',
  to: 'bis',
  result: [
    'Sitzungsabschluss:',
    ' ',
    slot('interval'),
    ' ',
    'Prozentpunkte; Hilfeanfragen: höchstens',
    ' ',
    slot('guardrail'),
    ' ',
    'Prozentpunkte, bei einer Grenze von',
    ' ',
    slot('limit'),
    '.',
  ],
  table: {
    columns: ['Wert', 'Punkte'],
    rows: [
      'Sitzungsabschluss, unteres Ende',
      'Sitzungsabschluss, oberes Ende',
      'Hilfeanfragen, oberes Ende',
      'Hilfeanfragen, Grenzwert',
    ],
    note: 'Punkte sind Prozentpunkte. Alle Werte sind erfunden.',
  },
  caption:
    'Chapter Club, der Sitzungsabschluss und die Hilfeanfragen sind erfunden. Die Intervallenden sind eingetippt, nicht aus Beobachtungen geschätzt: Es steht kein Datensatz, kein Test und keine Stichprobe dahinter. Ein Anstieg der Hilfeanfragen ist schlecht, deshalb wird die Guardrail-Metrik nur durch ihr oberes Ende dargestellt, und die gestrichelte Linie ist ihre Grenze.',
};

export const AUDIBLE_DE: AudibleCopy = {
  chip: 'Fallstudie',
  head: { lead: 'A/B-Tests bei Audible (Amazon)', quiet: 'vom Plan bis zur Empfehlung.' },
  ask: 'Fragen Sie mich zu dieser Arbeit',
  intro:
    'Fast zwei Jahre lang habe ich als Werkstudent bei Audible Teams dabei geholfen zu entscheiden, welche Änderungen an Website und App bleiben sollen. Ich habe an den A/B-Tests mitgewirkt, die Planung der Stichprobengröße und die Signifikanztests selbst gemacht und aus jeder Analyse eine Empfehlung geschrieben; die Entscheidung hat mein Manager getroffen.',
  glanceLabels: {
    region: 'Auf einen Blick',
    points: 'Kennzahlen',
    when: 'Zeitraum',
    role: 'Rolle',
    methods: 'Methoden',
    tools: 'Werkzeuge',
    scope: 'Umfang',
  },
  glance: {
    tests: 'A/B-Tests im Web und in den mobilen Apps',
    adopted: 'Empfehlungen übernommen',
    whySoMany: 'Warum so viele?',
    setup: ['zum Einrichten eines Testkontos, vorher etwa ', slot('before'), ' Minuten, mit einem Tool, das ich gebaut habe'],
    units: { about: 'etwa ', minutes: ' Minuten', min: ' Min.' },
    outcome:
      'Jeder Test brauchte vor dem Start einen Plan und am Ende eine Empfehlung: die Änderung dauerhaft ausrollen oder nicht.',
    when: 'Aug. 2023 bis Apr. 2025.',
    role: 'Werkstudent. Ich habe empfohlen; mein Manager hat entschieden.',
    methods:
      'Primäre, sekundäre und Guardrail-Metriken je Team, Planung von Stichprobengröße und Laufzeit, Signifikanztests, SQL-Segmentierung.',
    tools:
      'Die internen Experimentierplattformen von Amazon, SQL, Excel, Tableau als Datenquelle, Tampermonkey mit einem Schritt-Rekorder.',
    scope: 'Methode und Rolle. Die Ergebnisse sind vertraulich.',
  },
  sections: {
    'ship-rule': { title: 'Wann ausrollen: Probieren Sie die Regel selbst aus', link: 'Wann ausrollen' },
    'why-so-many': { title: 'Warum so viele übernommen wurden', link: 'Warum so viele?' },
    automation: { title: 'Automatisierung von Testkonten', link: 'Automatisierung' },
    method: { title: 'Methode', link: 'Methode' },
    limits: { title: 'Grenzen', link: 'Grenzen' },
    sources: { title: 'Quellen und Links', link: 'Quellen' },
  },
  shipRule: [
    'Chapter Club ist ein Lesekreis-Produkt, das ich für dieses Beispiel erfunden habe. Seine Hauptmetrik ist der Sitzungsabschluss, und seine Guardrail-Metrik sind Hilfeanfragen, bei denen ein Anstieg schlecht ist. Eine Guardrail-Metrik (eine Schutzmetrik) darf nicht schlechter werden, wenn eine Änderung ausgerollt werden soll, auch wenn sich die Hauptmetrik verbessert.',
    'Das veranschaulicht den allgemeinen Ansatz; die Teams ließen auch neutrale Ergebnisse zu, solange die Guardrail-Metriken intakt blieben.',
  ],
  shipLeadIn:
    'Eine Änderung wird ausgerollt, wenn die Hauptzahl steigt und die Schutzmetrik nicht schlechter wird. Verschieben Sie die Enden der beiden Bereiche und beobachten Sie, wie sich die Entscheidung ändert.',
  shipTakeaway:
    'Die Entscheidung ergibt sich daraus, wo die Bereiche liegen, nach einer vorab festgelegten Regel, und nicht daraus, was jemand von der Änderung hält.',
  whySoMany: {
    lead: [
      'Von meinen Empfehlungen aus ',
      slot('tests'),
      ' Tests wurden ',
      slot('adopted'),
      ' übernommen, das heißt dauerhaft ausgerollt. Das ist keine Erfolgsquote. Drei Dinge erklären das.',
    ],
    reasons: [
      [
        'Starke Wetten.',
        'Viele Tests betrafen Personalisierung durch maschinelles Lernen oder die Reihenfolge von Karussells, für eingewöhnte und noch nicht eingewöhnte Mitglieder, gegen Ausgangswerte ohne Personalisierung.',
      ],
      ['Geprüfte Ideen.', 'Ideen erreichten einen Test über eine vorab geprüfte, iterative Pipeline in einem etablierten Team.'],
      [
        'Eine Ausrollregel, die neutrale Ergebnisse zuließ.',
        'Eine Änderung konnte mit einer neutralen primären Metrik ausgerollt werden, wenn die Guardrail-Metriken hielten und es einen Produktgrund gab.',
      ],
    ],
  },
  automation: [
    'Ein Testkonto von Hand einzurichten dauerte etwa ',
    slot('before'),
    ' Minuten. Den Engpass habe ich selbst bemerkt und dafür ein Tool gebaut: Tampermonkey mit einem Schritt-Rekorder. Es verkürzte die Einrichtung auf etwa ',
    slot('after'),
    ' Minuten, also um etwa ',
    slot('cut'),
    '.',
  ],
  setup: {
    group: 'Einrichtungszeit eines Testkontos, von Hand und mit dem Tool',
    byHand: 'von Hand',
    byHandSource: 'Meine eigenen Zeitangaben, ungefähr.',
    withTool: 'mit dem Tool',
    withToolSource: ['Im ganzen Team übernommen, in ', slot('markets'), ' Märkten.'],
  },
  adoption:
    'Damit das Team es übernimmt, habe ich eine Anleitung zur Installation und Nutzung geschrieben, eine Fragerunde mit Stakeholdern abgehalten und ein Video aufgenommen, das die Nutzung zeigt. Eine Nutzungszahl dazu habe ich nicht.',
  method:
    'Bevor ein Test startete, habe ich seine Stichprobengröße und seine Laufzeit geplant. Nach seinem Ende habe ich die Signifikanztests gemacht und das Ergebnis an den Metriken des Teams gemessen, das ihn durchgeführt hat.',
  summaries: { teams: 'Die Teams und ihre Metriken', checked: 'Wie ich geprüft habe', data: 'Warum hier keine Ergebnisse stehen' },
  teamsFirst: [
    'Während meiner Zeit dort habe ich nacheinander mit ',
    slot('teams'),
    ' Teams gearbeitet, jeweils nach einer Neuorganisation der Teams: Onsite & App Experience, Early Engagement und Emerging Member Experience.',
  ],
  teamsRest: [
    'Die Kennzahlen-Frameworks gehörten den Teams selbst. Bei Onsite & App Experience war der Umsatz die primäre Metrik, und die Hörminuten waren die sekundäre; bei Early Engagement war es umgekehrt. Beide nutzten Churn und den inkrementellen langfristigen Wert (ILTV) als Guardrail-Metriken: Metriken, die nicht schlechter werden dürfen.',
    'Aus der Analyse habe ich eine Empfehlung erstellt, und mein Manager hat der Entscheidung zugestimmt.',
  ],
  checks: [
    'Die Planung von Stichprobengröße und Laufzeit vor jedem Test und die Signifikanztests danach habe ich selbst gemacht.',
    'Ich habe Tests auch aufgesetzt, nicht nur ausgewertet.',
    'Die Ausrollregel auf dieser Seite ist per Unit-Test geprüft: Jede Kombination von Intervallenden ergibt genau eine der vier Entscheidungen, und Enden, die genau auf null oder auf der Grenze der Guardrail-Metrik liegen, fallen auf die angegebene Seite.',
  ],
  data: 'Die Tests liefen auf den internen Experimentierplattformen von Amazon, in der Audible-App und auf der Website. Ihre Ergebnisse sind nicht öffentlich, deshalb verwendet das Beispiel auf dieser Seite ein erfundenes Produkt.',
  limits: [
    ['confidential', 'Die Ergebnisse dieser Tests sind vertraulich, deshalb kann ich ihre Effektgrößen nicht veröffentlichen.'],
    [
      'not-a-win-rate',
      'Die Zahl der übernommenen Empfehlungen ist keine Erfolgsquote und steht nicht für alle Testideen: Die Ideen wurden geprüft, bevor sie einen Test erreichten, und eine Empfehlung, nicht auszurollen, wird nicht mitgezählt.',
    ],
    [
      'simplified',
      'Die Ausrollregel auf dieser Seite ist vereinfacht. Sie geben die Intervallgrenzen selbst ein; nichts wird aus Beobachtungen geschätzt, und ein neutrales Ergebnis braucht hier keinen Produktgrund.',
    ],
    ['approximate', 'Die Zeitangaben zur Automatisierung sind ungefähr, so wie ich sie gemeldet habe.'],
  ],
  links: { retention: 'Analyse zu Kundenbindung und Reaktivierung, eine weitere Fallstudie', linkedin: 'Mein LinkedIn-Profil' },
  close:
    'Ich plane, bevor ich teste, trenne meine Empfehlung von der Entscheidung und sage klar, warum eine hohe Zahl übernommener Empfehlungen keine Erfolgsquote ist.',
  closeLinks: { lab: 'Das Lab ausprobieren', live: 'Den Live-Test ansehen' },
  next: { label: 'Kundenbindung', kicker: 'Weiter' },
  frame: FRAME_DE,
  framework: FRAMEWORK_DE,
};
