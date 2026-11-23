import 'server-only';
import type { MarketingwsCopy } from '../marketingws';

// The MarketingWS build note in German: formal "Sie" where it addresses the reader, facts in the first
// person, one German sentence per English sentence, typed by MarketingwsCopy so a missing key fails the
// typecheck. The tool's "A/B variants" are copy variants ("Textvarianten"), never experiments, and the
// live demo's dependence on Groq's free tier is stated beside its link. The placeholder "[X%]" is what
// the tool prints and stays as it is.
export const MARKETINGWS_DE: MarketingwsCopy = {
  h1: 'MarketingWS: Marketingtexte aus einem Briefing,',
  quiet: 'mit einer Prüfung auf erfundene Zahlen.',
  intro: (
    <p>
      Ein Sprachmodell kann Marketingtexte in Sekunden schreiben, und es kann auch einen Rabatt erfinden, den niemand
      genehmigt hat. MarketingWS, meine 2026 als Live-Web-App neu aufgebaute Masterarbeit, entwirft Texte aus einem
      Briefing und macht Zahlen und Versprechen, die das Briefing nicht stützt, zu sichtbaren Platzhaltern.
    </p>
  ),
  glance: {
    outcome:
      'Es entwirft Texte aus einem Briefing, überarbeitet den aktuellen Entwurf und macht Zahlen und Versprechen, die es nicht stützen kann, zu Platzhaltern.',
    role: 'Eigenständig gebaut (Masterarbeit 2025, Neuaufbau 2026).',
    methods:
      'Entwurf aus dem Briefing, Überarbeiten und Übersetzen des aktuellen Entwurfs, Faktenprüfung per Code plus Modell, Verhaltensprüfungen; die Masterarbeit wurde mit Marketingfachleuten evaluiert.',
    tools: 'Python, FastAPI, Streamlit, Vercel, Groq, OpenAI, Docker.',
    when: 'Masterarbeit Apr. bis Nov. 2025, Neuaufbau live seit Sept. 2026.',
    scope: 'Masterarbeit (2025), 2026 neu aufgebaut.',
  },
  problem: [
    [
      'brief',
      <>
        Marketingtexte beginnen mit einem Briefing: der Kampagne, dem Kanal, dem Ton und der Zielgruppe. Ein
        Sprachmodell kann daraus einen Entwurf schreiben, aber es kann auch Zahlen und Versprechen hinzufügen, die das
        Briefing nie genannt hat.
      </>,
    ],
    [
      'tool',
      <>
        Ich habe MarketingWS 2025 für meine Masterarbeit gebaut und 2026 neu aufgebaut. Der Neuaufbau entwirft
        Social-Media-Beiträge, E-Mails und Anzeigen aus einem Briefing, überarbeitet den aktuellen Entwurf mit dem
        Feedback der Marketingfachperson, statt von vorn zu beginnen, und macht Zahlen und Versprechen, die er nicht
        stützen kann, zu Platzhaltern.
      </>,
    ],
  ],
  architecture: (
    <p>Der Neuaufbau ist ein FastAPI-Dienst mit einer Web-App, bereitgestellt auf Vercel. Der Modellanbieter ist eine Einstellung.</p>
  ),
  shots: {
    leadIn:
      'Achten Sie auf den Platzhalter im Entwurf: Das Briefing nannte keine Zahl, also ließ das Tool eine Lücke, statt eine zu erfinden.',
    takeaway:
      'Wo das Briefing keine Zahl nennt, zeigt der Text eine Lücke, die eine Person füllen kann, keine Zahl, die niemand genehmigt hat.',
  },
  steps: {
    title: 'Jeder Entwurf wird gegen das Briefing geprüft',
    caption: 'Eine Anfrage, Schritt für Schritt. Die Übersetzung geht vom aktuellen Entwurf aus, statt einen neuen zu schreiben.',
    items: [
      { id: 'input', name: 'Briefing', text: 'Kampagnentyp, Plattform, Ton, Zielgruppe und Sprache.' },
      {
        id: 'draft',
        name: 'Entwurf',
        text: 'Ein erster Entwurf, eine Überarbeitung des aktuellen Entwurfs mit Feedback oder Textvarianten aus verschiedenen Blickwinkeln.',
      },
      {
        id: 'check',
        name: 'Prüfung',
        text: 'Zahlen und Versprechen, die weder das Briefing noch das Feedback der Marketingfachperson stützt, werden zu Platzhaltern wie [X%]; eine kurze Modellprüfung fängt erfundene Funktionen ab.',
      },
      {
        id: 'translate',
        name: 'Übersetzung',
        text: 'Auf Wunsch der aktuelle Entwurf auf Deutsch, Französisch, Spanisch, Italienisch, Portugiesisch oder Niederländisch, mit Hashtags und Platzhaltern.',
      },
      {
        id: 'output',
        name: 'Ausgabe',
        text: 'Der Text, den die Marketingfachperson mit neuem Feedback zurückschicken kann.',
      },
    ],
  },
  checks: [
    [
      'offline',
      <>
        Offline-Tests decken den Dienst und seine API ab, wobei das Modell durch Attrappen ersetzt ist, sodass sie ohne
        API-Schlüssel in GitHub Actions laufen.
      </>,
    ],
    [
      'behaviour',
      <>
        Eine eigene Verhaltensprüfung ruft das echte Modell auf: Jede Überarbeitung muss den Entwurf wie gewünscht
        verändern, Übersetzungen müssen Platzhalter und Hashtags behalten, und die Textvarianten müssen sich
        unterscheiden. Sie kostet Modellaufrufe und gehört deshalb nicht zur CI.
      </>,
    ],
  ],
  outcome: [
    [
      'live',
      <>
        Der Neuaufbau ist seit September 2026 live. Die Version der Masterarbeit liegt im Repository unter einem eigenen
        Tag.
      </>,
    ],
    [
      'thesis',
      <>
        Professionelle Marketingfachleute haben die Version der Masterarbeit in zwei Runden evaluiert. Diese
        Evaluation deckt nicht ab, was der Neuaufbau hinzugefügt hat: das Überarbeiten des aktuellen Entwurfs, seine
        Übersetzung, die Textvarianten und die Prüfung.
      </>,
    ],
  ],
  limits: [
    [
      'soft-claims',
      <>Die Prüfung im Code sucht nach Zahlen und Versprechen; weichere Behauptungen können durch die Modellprüfung rutschen.</>,
    ],
    [
      'translations',
      <>
        Ich habe keine Evaluation der Übersetzungen des Neuaufbaus durch Muttersprachler, deshalb mache ich keine Aussage
        über ihre Qualität.
      </>,
    ],
  ],
  close: 'Ich habe eine Idee mit generativer KI von der Masterarbeit bis zur Live-Web-App mit Prüfungen gebracht.',
  links: {
    repo: 'Das MarketingWS-Repository, an dem Commit, den diese Seite beschreibt',
    thesis: (tag) => <>Die Version der Masterarbeit, unter dem Tag {tag}</>,
    demo: 'Die Live-Demo, auf einer anderen Website',
    groq: 'Die Live-Demo hängt vom kostenlosen Kontingent von Groq ab.',
    offline:
      'Lokal ohne API-Schlüssel gestartet, läuft die App in einem Offline-Demomodus; das README des Repositorys erklärt, wie.',
  },
};
