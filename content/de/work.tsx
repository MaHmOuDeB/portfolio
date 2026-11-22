import 'server-only';
import { Fact } from '@/components/kit/Fact';
import { HOME_LINKS } from '../home-destinations.ts';
import type { WorkCopy } from '../work.tsx';
import { CTA_DE } from './home.ts';

// The Work page in German: the same eight cards in the same two groups, typed by WorkCopy. Facts are
// printed with the German locale. The project names Pulse, Docproof, MarketingWS and n8n stay as they
// are. A claim's limit stays in its chip or its line, as in the English.
export const WORK_DE: WorkCopy = {
  title: 'Projekte',
  head: {
    title: 'Die Arbeit ansehen',
    quiet: 'und sehen, wie sie entstanden ist.',
    intro: 'Sieben Projekte und ein Tool, mit ihren Quellen und ihren Grenzen. Beginnen Sie mit Audible.',
    kinds:
      'Fallstudien sind Analysen mit einer Frage und einem Ergebnis. Projektnotizen beschreiben, was ich gebaut habe und wie ich es getestet habe.',
  },
  groups: [
    {
      id: 'experimentation',
      label: 'Experimente und Analysen',
      kind: 'Fallstudien',
      items: [
        {
          href: '/work/audible',
          chip: 'Berufserfahrung',
          title: 'A/B-Testing bei Audible (Amazon)',
          shows: 'Ich plane einen Test, sage klar, was er zeigt, und schreibe eine Empfehlung, nach der Teams handeln.',
          description:
            'Fast zwei Jahre A/B-Tests auf der Audible-Website und in der App. Die Ergebnisse sind vertraulich, deshalb zeigt die Seite die Methode.',
        },
        {
          href: HOME_LINKS.retention,
          chip: 'Öffentliche Daten, 2026 neu aufgebaut',
          title: 'Analyse zu Kundenbindung und Reaktivierung',
          shows: 'Ich bereinige die Daten, bevor ich einer Zahl traue, und halte eine Vorhersage nicht für einen Beweis.',
          description:
            'Zwei Jahre Bestellungen eines britischen Online-Geschenkhändlers: ein Bereinigungsfehler, wer erneut bestellt, und der Test, den ich als Nächstes ansetzen würde.',
        },
        {
          href: HOME_LINKS.pulse,
          chip: 'Demo, keine echten Anwender',
          title: 'Pulse: ein Tracking-Plan für Produktanalysen',
          shows: 'Ich entscheide anhand der Produktfrage, was ich erfasse, und nicht danach, was sich leicht erfassen lässt.',
          description: (
            <>
              Ein Demo-Dashboard, das ich entworfen und gebaut habe, mit <Fact id="pulse.events.count" locale="de" /> benannten Ereignissen.
            </>
          ),
        },
        {
          href: '/work/weather',
          chip: 'Öffentliche Daten, 2026 neu aufgebaut',
          title: 'Wetterdaten: eine SQL-Pipeline, die bei schlechten Daten stoppt',
          shows: 'Meine Pipelines lassen schlechte Daten nicht stillschweigend durch.',
          description:
            'Eine getestete SQL-Pipeline auf Wetterbeobachtungen: ein Sternschema, Datenqualitätsprüfungen und eine Quarantäne für Sensorfehler.',
        },
      ],
    },
    {
      id: 'automation',
      label: 'Automatisierung und Agenten',
      kind: 'Projektnotizen',
      items: [
        {
          href: HOME_LINKS.automation,
          chip: 'Berufserfahrung',
          title: 'Automatisierung von Testkonten',
          shows: 'Ich mache aus wiederkehrenden manuellen Schritten Tools, die ein ganzes Team nutzen kann.',
          description: (
            <>
              Tampermonkey mit einem Schritt-Rekorder. Es hat die Einrichtung von Testkonten bei Audible von etwa{' '}
              <Fact id="profile.audible.setup_minutes_before" locale="de" /> auf etwa <Fact id="profile.audible.setup_minutes_after" locale="de" />{' '}
              Minuten verkürzt und wurde im ganzen Team übernommen.
            </>
          ),
        },
        {
          href: HOME_LINKS.docproof,
          chip: 'Open Source',
          title: 'Docproof: Agenten, die die Arbeit der anderen prüfen',
          shows: 'Ich baue KI-Tools, in denen Code und nicht das Modell das letzte Wort über Fakten hat.',
          description:
            'Getrennte Agenten schreiben, prüfen und lesen ein Dokument gegen, und deterministische Prüfungen entscheiden, was bei den Lesern ankommt. In der CI getestet, noch ohne Anwender.',
        },
        {
          href: HOME_LINKS.n8n,
          chip: 'Persönliches Projekt',
          title: 'E-Rechnungs-Eingang und Fehlerbenachrichtigungen in n8n',
          shows: 'Ich kann einen Back-Office-Prozess automatisieren und mit Tests belegen, dass er funktioniert.',
          description: (
            <>
              Dokumenten- und Prozessautomatisierung in n8n: Eingang von E-Rechnungen (XRechnung, ZUGFeRD) und Fehlerbenachrichtigungen, mit{' '}
              <Fact id="profile.n8n.automated_tests" locale="de" /> automatisierten Tests.
            </>
          ),
        },
        {
          href: HOME_LINKS.marketingws,
          chip: 'Masterarbeit, 2026 neu aufgebaut',
          title: 'MarketingWS: Marketingtexte aus einem Briefing, mit Faktenprüfung',
          shows: 'Ich habe eine Idee mit generativer KI von der Masterarbeit bis zu einer Live-Web-App mit Prüfungen gebracht.',
          description: 'Ein Webdienst mit generativer KI für Content-Marketing. Die Live-Demo hängt vom kostenlosen Kontingent von Groq ab.',
        },
      ],
    },
  ],
  shows: 'Zeigt: ',
  site: {
    title: 'Diese Website ist Teil des Nachweises.',
    text: 'Sie führt einen A/B-Test mit den drei Experiment-Karten auf der englischen Startseite durch. Der Plan wurde vor dem Start des Tests veröffentlicht, und die Daten sind öffentlich. Ich habe sie mit Coding-Agenten gebaut, und jede Änderung besteht ihre automatisierten Prüfungen, bevor sie ausgeliefert wird.',
    chip: 'Live-Test',
    live: 'Den Live-Test ansehen',
    lead: 'Diese Website ist',
    quiet: 'Teil des Nachweises.',
  },
  cta: CTA_DE,
};
