import 'server-only';
import type { TaxonomyText } from '@/lib/pulse/tables';
import type { PulseText } from '@/lib/pulse/text';
import { labKitSlice } from '@/lib/lab/text-common';
import { slot } from '@/lib/retention/sentence';
import type { PulseCopy } from '../pulse';
import { FRAME_DE } from './frame';
import { KIT_TEXT_DE } from './kit';

// The Pulse case study in German: formal "Sie", the owner's statements in the first person, one German
// sentence per English sentence, typed by PulseCopy so a missing key fails the typecheck. Numbers are
// never typed: they arrive as slots (a Fact in German). Pulse was "entworfen und gebaut", with no real
// users ("Anwender") and no outcome metrics; it does not load Amplitude here. The event names, their
// property keys and values, the date-range labels and every row of the event table are the export's own
// and stay English, as do the unit and code words inside a sentence.

const FIGURE_DE: PulseText = {
  kit: labKitSlice(KIT_TEXT_DE),
  title: 'Jede Aktion im Dashboard mit einer Produktfrage dahinter sendet ein Ereignis',
  channels: {
    all: { label: 'Alle Kanäle', phrase: 'alle Kanäle' },
    email: { label: 'E-Mail', phrase: 'E-Mail' },
    search: { label: 'Suche', phrase: 'Suche' },
    social: { label: 'Social Media', phrase: 'Social Media' },
  },
  charts: {
    sign_ups: { label: 'Anmeldungen', inline: 'Anmeldungen' },
    trials_started: { label: 'Gestartete Testphasen', inline: 'gestartete Testphasen' },
  },
  controls: { channel: 'Kanal', range: 'Zeitraum' },
  result: ['Angezeigt: ', slot('channel'), ', Zeitraum ', slot('range'), '.'],
  chartName: 'Erfundene {chart} pro Tag für {channel}, im gewählten Zeitraum',
  axis: { x: 'Tag des Zeitraums', y: '{chart} pro Tag' },
  dashboard: {
    title: 'Dashboard',
    detail: 'Details',
    detailLabel: 'Details: {chart}',
    actions: 'Aktionen des Dashboards',
    export: 'CSV exportieren',
    save: 'Ansicht speichern',
    load: 'Gespeicherte Ansicht laden',
    saved: ['Gespeicherte Ansicht: ', slot('channel'), ', Zeitraum ', slot('range'), '.'],
    savePrompt: 'Speichern Sie zuerst eine Ansicht; dann holt „Gespeicherte Ansicht laden“ sie zurück.',
    summary: ['Im Zeitraum: ', slot('total'), ' insgesamt und ', slot('peak'), ' am aktivsten Tag, Tag ', slot('day'), '.'],
  },
  stream: {
    title: 'Gesendete Ereignisse',
    last: ['Die letzten ', slot('count'), ' Ereignisse, die dieses Dashboard gesendet hat, die neuesten zuerst.'],
    prompt: ['Lokale Demo-Prompt-Version: ', slot('version'), '. Das ist der eigene Wert dieser Kopie, nicht der des Originals.'],
    empty: 'Noch keine Ereignisse. Viewed Dashboard kommt an, sobald das Dashboard geladen ist.',
    needsJs: 'Die Liste braucht JavaScript: Ohne JavaScript sendet diese Kopie keine Ereignisse.',
  },
  table: { day: 'Tag', note: 'Erfundene Zahlen pro Tag für den gezeigten Kanal und Zeitraum, der älteste Tag zuerst.' },
  caption:
    'Eine Kopie des Pulse-Dashboards, mit eigenen Diagrammen und Kanälen und erfundenen Zahlen für ein erfundenes Produkt. Jede Aktion, die ein Ereignis sendet, fügt es der Liste hinzu, das neueste zuerst. Die Ereignisse bleiben auf dieser Seite und sind nicht Teil des Experiments dieser Website.',
  messages: {
    filter: 'Applied Filter gesendet. Angezeigt: {channel}.',
    range: 'Changed Date Range gesendet. Angezeigt: Zeitraum {range}.',
    detail: 'Viewed Chart Detail gesendet. Details geöffnet: {chart}.',
    exported: 'Exported Report gesendet. Die CSV-Datei mit den erfundenen Zahlen wird heruntergeladen.',
    saved: 'Saved View gesendet. Die gespeicherte Ansicht zeigt {channel}, Zeitraum {range}.',
    loaded: 'Loaded Saved View gesendet. Angezeigt: {channel}, Zeitraum {range}.',
    reset: 'Dashboard zurückgesetzt. Viewed Dashboard gesendet.',
  },
};

const TAXONOMY_DE: TaxonomyText = {
  columns: ['Ereignis', 'Wird ausgelöst, wenn', 'Eigenschaften', 'Frage, die es beantworten sollte'],
  note: 'Namen und Eigenschaften, wie der Quellcode sie nennt; Auslöser und Fragen, wie die README des Projekts sie nennt, auf Englisch.',
};

export const PULSE_DE: PulseCopy = {
  chip: 'Fallstudie',
  title: [slot('events'), ' Ereignisse, jedes entworfen, um eine Produktfrage zu beantworten'],
  github: 'Code auf GitHub ansehen',
  intro:
    'Ein kleines Dashboard, das ich entworfen und gebaut habe, um eines zu zeigen: einen Tracking-Plan, in dem jedes Ereignis eine Produktfrage beantwortet.',
  plainOpening: [
    'Die meisten Produkte erfassen zuerst jeden Klick und fragen später, was die Klicks bedeuten. Pulse geht andersherum vor:',
    ' ',
    slot('events'),
    ' erfasste Aktionen, jede ausgewählt, weil sie eine Frage beantwortet, die ein Produktteam stellen würde. Es zeigt einen Tracking-Plan, keine Ergebnisse. Ein Ereignis ist eine erfasste Anwenderaktion mit einem Namen.',
  ],
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
    events: 'Ereignisse, jedes an eine Produktfrage gebunden',
    userProperties: 'Anwendermerkmale, damit sich Ereignisse nach Anwendern aufteilen lassen',
    outcome:
      'Jedes Ereignis soll eine Produktfrage beantworten: Das Original sendet sie an Amplitude, und die Kopie auf dieser Seite sendet sie an eine Liste in Ihrem Browser.',
    role: 'Persönliches Projekt, entworfen und gebaut.',
    methods: 'Eine benannte Liste von Ereignissen, Identifikation der Anwender, Eigenschaften für Segmente.',
    tools: 'React, TypeScript, Vite, Tailwind, Recharts, Amplitude, Vercel.',
    when: 'Sep. 2026.',
    scope: 'Eine Demo. Keine echten Anwender, daher sind die Fragen weiterhin offen.',
  },
  sections: {
    dashboard: { title: 'Das Dashboard, auf dieser Seite', link: 'Dashboard' },
    taxonomy: { title: 'Die Ereignisse und die Fragen dahinter', link: 'Ereignisse' },
    'how-i-checked-this': { title: 'Wie ich es gebaut und geprüft habe', link: 'Wie ich geprüft habe' },
    limits: { title: 'Grenzen', link: 'Grenzen' },
    sources: { title: 'Quellen und Links', link: 'Quellen' },
  },
  dashboard: {
    leadIn:
      'Probieren Sie das Dashboard aus. Jede Aktion, die Sie ausführen, erscheint in der Liste darunter als das Ereignis, das ein Produktteam erhalten würde.',
    takeaway:
      'Eine kurze Liste benannter Ereignisse soll die Produktfragen beantworten; die automatische Erfassung läuft darunter als Sicherheitsnetz weiter.',
    summary: 'Wie diese Kopie des Dashboards funktioniert',
    intro: [
      'Das ist eine kleine Kopie des Dashboards, für diese Seite neu gebaut, mit eigenen Diagrammen, Kanälen und erfundenen Zahlen. Sie lädt Amplitude nicht. Jede Aktion mit einem Ereignis in der Tabelle unten sendet dieses Ereignis, mit demselben Namen und denselben Eigenschaften wie in der Tabelle, an eine Liste unter den Diagrammen.',
      'Die Liste liegt nur im Speicher dieser Seite: Nichts wird irgendwohin gesendet, und sie ist weg, wenn Sie die Seite verlassen oder auf Zurücksetzen drücken. Sie ist eine Simulation und gehört nicht zum Experiment dieser Website.',
    ],
  },
  taxonomy: {
    leadIn: 'Lesen Sie jede Frage als Entwurfshypothese: was das Ereignis beantworten helfen sollte, kein Befund.',
    caption: 'Die erfassten Ereignisse, wie der Code und die README des Projekts sie nennen',
    table: TAXONOMY_DE,
    plainNote:
      'Namen und Eigenschaften, wie der Quellcode sie nennt; Auslöser und Fragen, wie die README des Projekts sie nennt, auf Englisch und in schlichter Zeichensetzung.',
  },
  summaries: { data: 'Die Daten', method: 'Methode', checked: 'Wie ich geprüft habe' },
  data: 'Pulse hat kein Backend: Die Zahlen des Dashboards werden im Browser erzeugt. Die Ereignisse auf dieser Seite mit ihren Auslösern, Eigenschaften und Fragen stammen aus einem Export von Code und README, gebunden an einen Commit.',
  method: {
    why: [
      'Autocapture erfasst, was Anwender anklicken, aber nicht, welche Produktfrage ein Klick beantworten soll. Pulse stellt eine bewusste Taxonomie an den Anfang: ',
      slot('events'),
      ' benannte Ereignisse, jedes an eine bestimmte Produktfrage gebunden. Das Dashboard um sie herum ist das Vehikel.',
    ],
    stack: 'Ich habe Pulse mit React, TypeScript, Vite, Tailwind CSS und Recharts gebaut und mit dem Unified SDK von Amplitude erfasst.',
    named: [
      'Jedes der ',
      slot('events'),
      ' Ereignisse wird mit seinem Namen und seinen eigenen Eigenschaften erfasst. Der Demo-Anwender wird mit einer Anwender-ID und ',
      slot('userProperties'),
      ' Anwendermerkmalen identifiziert: Rolle, Tarif, Unternehmensgröße und Anmeldedatum. Ohne diese Identifikation wäre jedes Ereignis anonym und ließe sich nicht nach Anwendern segmentieren.',
    ],
    underneath: 'Autocapture und Session Replay laufen unter den benannten Ereignissen mit.',
  },
  checks: [
    'Ich habe jede erfasste Interaktion von Hand getestet. TypeScript läuft im Strict-Modus ohne Typfehler, Secrets gelangen nicht in Git, und jeder Push zu GitHub wird auf Vercel bereitgestellt.',
    'Auf dieser Seite stammen die Ereignisse aus einem Export von Code und README des Projekts, gebunden an einen Commit und an einen Hash seines Inhalts. Tests prüfen, dass die Kopie des Dashboards nur diese Ereignisse sendet, jedes mit genau seinen Eigenschaften, und dass Zurücksetzen ein neues Viewed Dashboard hinterlässt.',
  ],
  limits: {
    plain: [
      'Pulse hat keine echten Anwender und keinen Produktivverkehr, daher zeigen seine Ereignisse, was das Tracking erfassen sollte, nicht, wie sich jemand verhalten hat.',
      'Die Fragen sind Entwurfshypothesen. Nichts hier prüft, ob ein Ereignis ein Ergebnis vorhersagt, etwa ob eine gespeicherte Ansicht eine Rückkehr vorhersagt.',
      'Die Kopie auf dieser Seite verwendet die Ereignisnamen und Eigenschaften wieder, aber nicht das Amplitude-Tracking, die Anwenderidentifikation oder Session Replay des Originals, und ihre Zahlen sind erfunden.',
    ],
    keys: [
      'Die Eigenschaftsschlüssel der Kopie stimmen mit denen des Originals überein. Außer bei den Zeiträumen und dem CSV-Format hat die Kopie eigene Werte, etwa ',
      slot('filter'),
      ' und die Prompt-Version,',
      ' ',
      slot('version'),
      ', und ebenso eigene Diagramme und Kanäle.',
    ],
  },
  sources: {
    repo: ['Pulse, am Commit ', slot('commit')],
    export: 'Export der Ereignis-Taxonomie, die diese Seite liest',
    retention: 'Analyse zu Kundenbindung und Reaktivierung, eine weitere Fallstudie',
    linkedin: 'Mein LinkedIn-Profil',
  },
  close: [
    'Ich plane das Tracking von den Fragen her: Jedes der ',
    slot('events'),
    ' Ereignisse wurde nach einer Frage benannt, die ein Produktteam stellen würde, und das Dashboard ist nur dazu da, sie zu tragen.',
  ],
  closeLink: 'Das Lab ansehen',
  neighbours: { prev: { label: 'Kundenbindung', kicker: 'Zurück' }, next: { label: 'Wetterdaten-Pipeline', kicker: 'Weiter' } },
  frame: FRAME_DE,
  figure: FIGURE_DE,
};
