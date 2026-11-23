import 'server-only';
import type { BuildNoteText } from '@/components/build-notes/text';
import { FRAME_DE } from './frame';

// The build-note frame in German: formal "Sie", sentence-case headings, the chip "Projektnotiz". The
// screenshots' alt texts and captions are translated; words that are visible inside a screenshot (a
// form name, a status word, a node name) stay as the picture shows them. The glance terms are the
// Retention page's words, so every German project page reads the same.
export const BUILD_NOTE_TEXT_DE: BuildNoteText = {
  chip: 'Projektnotiz',
  sections: {
    problem: { title: 'Das Problem', link: 'Problem' },
    architecture: { title: 'Architektur', link: 'Architektur' },
    'how-i-checked-this': { title: 'Wie ich geprüft habe', link: 'Wie ich geprüft habe' },
    outcome: { title: 'Ergebnis', link: 'Ergebnis' },
    limits: { title: 'Grenzen', link: 'Grenzen' },
    sources: { title: 'Quellen und Links', link: 'Quellen' },
  },
  glance: {
    region: 'Auf einen Blick',
    points: 'Kennzahlen',
    when: 'Zeitraum',
    role: 'Rolle',
    methods: 'Methoden',
    tools: 'Werkzeuge',
    scope: 'Umfang',
  },
  sectionNav: FRAME_DE.sectionNav,
  nextRow: FRAME_DE.nextRow,
  closeTitle: FRAME_DE.pageClose,
  leadIn: FRAME_DE.leadIn,
  takeaway: FRAME_DE.takeaway,
  github: 'Code auf GitHub ansehen',
  screenshot: 'Screenshot',
  kicker: { prev: 'Zurück', next: 'Weiter' },
  order: {
    weather: { prev: 'Pulse', next: 'Docproof' },
    docproof: { prev: 'Weather-Pipeline', next: 'n8n-Eingang für E-Rechnungen' },
    n8n: { prev: 'Docproof', next: 'MarketingWS' },
    marketingws: { prev: 'n8n-Eingang für E-Rechnungen', next: 'Der Live-Test' },
  },
  fullSize: 'Bild in voller Größe:',
  shots: {
    marketingwsBrief: {
      alt: 'Das Formular „Brief“ in MarketingWS, ausgefüllt für einen LinkedIn-Beitrag in professionellem Ton, auf Englisch, über ein Fahrradreparatur-Café in der Nachbarschaft, das samstags öffnet, für Studierende und junge Berufstätige in Berlin, mit der Anweisung, freundlich zu sein, keine Emojis zu verwenden und mit den Öffnungszeiten zu enden.',
      caption: 'Der Brief: ein Kampagnentyp, eine Plattform, ein Ton, eine Sprache und ein paar Zeilen zum Angebot.',
    },
    marketingwsDraft: {
      alt: 'Das Feld „First draft“ in MarketingWS: ein kurzer LinkedIn-Beitrag über das Fahrradreparatur-Café, mit einem Platzhalter, wo eine Prozentzahl stehen würde, mit Hashtags und den Öffnungszeiten am Ende.',
      caption:
        'Der erste Entwurf, den das Tool geliefert hat. Wo der Brief keine Zahl nennt, lässt der Entwurf einen Platzhalter stehen, statt eine zu erfinden.',
      label: 'der erste Entwurf',
    },
    weatherChecks: {
      alt: 'Terminal-Ausgabe der Datenqualitätsprüfungen der Weather-Pipeline, eine Zeile je Prüfung, jede mit ihrem Statuswort: Die meisten Zeilen lauten OK, die Warnzeilen lauten WARN, und die Zeile zu zusammengeführten Schreibweisen von Wetterlagen lautet INFO.',
      caption:
        'Der Datenqualitätsschritt der Pipeline, die ich auf einem öffentlichen Wetterdatensatz neu aufgebaut habe. Jede Prüfung auf Fehlerstufe besteht; die Warnungen benennen die Sensorfehler, die ich in Quarantäne gestellt habe, und die Orte mit zu wenigen Beobachtungen.',
    },
    n8nDecision: {
      alt: 'Ausschnitt einer n8n-Workflow-Fläche: Sie prüft die Anfrage, liest und prüft die Rechnungszeile und leitet das Ergebnis dann entweder zum Aktualisieren des Registers oder zu einer Fehlerantwort weiter.',
      caption:
        'Der Freigabeschritt: Eine Person gibt eine Rechnung frei oder lehnt sie ab, wenn sie einen Blick braucht, und jede andere Antwort ist ein klarer Fehlercode.',
      label: 'die Workflow-Fläche',
    },
  },
};
