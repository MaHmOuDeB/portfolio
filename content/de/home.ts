import 'server-only';
import { LANGUAGES } from '../languages.ts';
import type { FaqPart, HomeCopy, SketchText } from '../home.ts';
import { HOME_LINKS } from '../home-destinations.ts';

// The Home page in German: formal "Sie", facts in the first person, one German sentence per English
// sentence, typed by HomeCopy so a missing key fails the typecheck. Figures are fact parts, never typed
// numerals. A soft hyphen (­) marks where a long compound in a headline may break on a phone.
// The card headlines are group A's wording (the topic), fixed: a German page is never part of the
// experiment, so there is no group B string and nothing varies.
const SHY = '­';

/** The call to action's words, shared by the German Home and Work pages. */
export const CTA_DE = {
  title: 'Finden Sie heraus, was ich',
  quiet: 'für Ihr Team tun kann.',
  line: 'Offen für Stellen in A/B-Testing, Produktanalyse und KI-Automatisierung in Deutschland. Ich wohne in Berlin.',
  write: 'Schreiben Sie mir',
  cv: 'Lebenslauf lesen',
  linkedin: 'LinkedIn',
} as const;

/** The card sketches' words in German (Pulse's event names and Weather's check names are the data's own). */
export const SKETCH_TEXT_DE: SketchText = {
  process: {
    rows: [
      { name: 'Stichprobengröße', tag: 'geplant' },
      { name: 'Laufzeit', tag: 'festgelegt' },
      { name: 'Guardrails', tag: 'geprüft' },
      { name: 'Empfehlung', tag: 'geschrieben' },
    ],
  },
  cohorts: { name: 'Kohorten', note: 'Anteil, der erneut bestellt' },
  events: { name: 'Ereignisse', note: 'jedes beantwortet eine Frage', tags: ['Aktivierung', 'Engagement', 'Absicht'] },
  steps: { name: 'Schritte', note: 'einmal aufgezeichnet, wiederholt', rows: ['Aufzeichnen', 'Abspielen', 'Prüfen'] },
  agents: {
    name: 'Agenten',
    note: 'jeder prüft den vorigen',
    author: 'Autor',
    draft: 'Entwurf',
    auditor: 'Aussagenprüfer',
    blocked: 'gestoppt: Aussage nicht belegt',
    reviewer: 'Gegenleser',
    waiting: 'wartet',
  },
  workflow: { name: 'Workflow', note: 'Eingang von E-Rechnungen', nodes: ['Eingang', 'Prüfung', 'Alarm'] },
  variants: { name: 'Ein Briefing', note: 'drei Textvarianten', brief: 'Briefing' },
  plan: {
    name: 'Stichprobengröße',
    note: 'vor dem Start festgelegt',
    rows: [
      { label: 'Effekt', tag: 'kleinster' },
      { label: 'Teststärke', tag: 'geplant' },
      { label: 'Laufzeit', tag: 'fest' },
    ],
  },
  read: {
    name: 'Auswertung',
    note: 'die Metrik und ihre Guardrail',
    rows: [
      { label: 'Metrik', tag: 'höher' },
      { label: 'Guardrail', tag: 'intakt' },
    ],
  },
  recommend: { name: 'Empfehlung', note: 'schriftlich festgehalten', verdict: 'Ausrollen.', reasons: 'mit Begründung' },
  confidence: { name: 'Konfidenz im Zeitverlauf', note: 'B − A, mit ihrem Band' },
};

const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  English: 'Englisch',
  German: 'Deutsch',
  French: 'Französisch',
  Arabic: 'Arabisch',
  Spanish: 'Spanisch',
};
const LEVELS: Readonly<Record<string, string>> = {
  'fluent (C2)': 'fließend, C2',
  B1: 'B1',
  native: 'Muttersprache',
  A2: 'A2',
};

/** "a", "a und b", "a, b und c". */
function joinUnd(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} und ${items.at(-1)}`;
}

/**
 * The shared language list (content/languages.ts) as one German sentence, in the list's own order: the
 * levels and their order cannot disagree with the About page, and a language or level with no German
 * word fails loudly.
 */
export function languagesSentenceDe(): string {
  const parts = LANGUAGES.map(({ language, level }) => {
    const name = LANGUAGE_NAMES[language];
    const german = LEVELS[level];
    if (name === undefined || german === undefined) throw new Error(`no German word for ${language} (${level})`);
    return `${name} (${german})`;
  });
  return `${joinUnd(parts)}.`;
}

const FAQ_ITEMS: readonly { question: string; answer: readonly FaqPart[] }[] = [
  {
    question: 'Welche Stellen suchen Sie?',
    answer: ['Stellen in A/B-Testing, Produktanalyse und KI-Automatisierung in Deutschland, vom Junior- bis zum Mid-Level. Ich wohne in Berlin.'],
  },
  {
    question: 'Was haben Sie bei Audible gemacht?',
    answer: [
      'Ich war fast zwei Jahre Werkstudent, hauptsächlich im Bereich Growth-Experimente, dazu etwas Marketing-Analytics. Ich habe an ',
      { fact: 'profile.audible.experiments' },
      ' A/B-Tests im Web und in den mobilen Apps mitgewirkt, die Stichprobenplanung und die Signifikanztests selbst gemacht und ein Tool zur Browser-Automatisierung gebaut, Tampermonkey mit einem Schritt-Rekorder, das die Einrichtung von Testkonten von etwa ',
      { fact: 'profile.audible.setup_minutes_before' },
      ' auf etwa ',
      { fact: 'profile.audible.setup_minutes_after' },
      ' Minuten verkürzt hat.',
    ],
  },
  {
    question: 'Was haben Sie seit Audible gemacht?',
    answer: [
      'Mein Masterstudium in Data Science habe ich im ',
      { month: '2025-11' },
      ' abgeschlossen. Seitdem habe ich meine Masterprojekte mit öffentlichen Daten neu aufgebaut und Docproof, die n8n-Workflow-Bibliothek und diese Website gebaut. Seit ',
      { month: '2026-10' },
      ' habe ich außerdem bei Mercor die Rolle AI Data Specialist, Business and Analytics Workflows (Contract): Erstellung hochwertiger Trainingsdaten für KI-Modelle, mit Business- und Analytics-Expertise: präzise, gut dokumentierte Arbeitsbeispiele.',
    ],
  },
  {
    question: 'Kann ich die Ergebnisse von Audible sehen?',
    answer: [
      'Die Zahlen nicht: Umsatz-, Konversions- und Anstiegszahlen sind vertraulich. Wie ich gearbeitet habe, sehen Sie auf ',
      { text: 'der Audible-Seite', href: HOME_LINKS.audible },
      ', die Statistik mit simulierten Daten im ',
      { text: 'Lab', href: HOME_LINKS.lab },
      ' und einen echten Test mit öffentlichen Daten auf ',
      { text: 'der Seite zum Live-Test', href: HOME_LINKS.experiment },
      '.',
    ],
  },
  {
    question: 'Wie arbeiten Sie mit KI?',
    answer: [
      'Ich habe interne KI-Tools gebaut, die ein größeres Team übernommen hat: Das eine prüft frühere A/B-Tests und ihre Ergebnisse und schlägt neue Testideen vor, das andere erzeugt den Standardinhalt des Jira-Tickets für einen Teststart. Außerdem habe ich Amazon Bedrock für Anwendungsfälle zur Effizienz im Team evaluiert. Heute baue ich mit Claude-Code-Agenten und Skills. In Docproof schreiben getrennte Agenten ein Dokument, prüfen es und lesen es gegen, und automatisierte Prüfungen entscheiden, was beim Leser ankommt.',
    ],
  },
  {
    question: 'Ist der Code öffentlich?',
    answer: [
      'Ja. ',
      { text: 'Docproof', href: 'https://github.com/MaHmOuDeB/docproof', external: true },
      ' und ',
      { text: 'die n8n-Workflow-Bibliothek', href: 'https://github.com/MaHmOuDeB/n8n-workflow-library', external: true },
      ' stehen unter der MIT-Lizenz auf GitHub, ebenso der Code dieser Website.',
    ],
  },
  {
    question: 'Welche Sprachen sprechen Sie?',
    answer: [languagesSentenceDe()],
  },
  {
    question: 'Wie erreiche ich Sie?',
    answer: ['Über das Kontaktformular oder auf LinkedIn. Ich antworte selbst.'],
  },
];

export const HOME_DE: HomeCopy = {
  hero: {
    headline: { lead: `KI-Automati${SHY}sierung und A/B-Testing`, quiet: 'für Produkt- und Growth-Teams' },
    chip: 'Offen für Stellen in Deutschland',
    sub: {
      lead: 'Analyst in Berlin. Ich baue die ',
      chips: ['Agenten', 'Workflows'],
      join: ' und ',
      end: ', die manuelle Arbeit überflüssig machen',
      rest: ', und ich plane und analysiere A/B-Tests; bei Audible (Amazon) habe ich das fast zwei Jahre lang getan.',
    },
    cv: 'Lebenslauf lesen',
    contact: 'Schreiben Sie mir',
    proof: [
      { fact: 'profile.audible.experiments' },
      ' A/B-Tests bei Audible. Ein Tool, das mein Team übernommen hat. ',
      { fact: 'profile.n8n.automated_tests' },
      ' automatisierte Softwaretests in öffentlichem Code.',
    ],
    work: 'Die Projekte ansehen',
  },
  band: {
    test: {
      title: 'Test',
      note: 'zwei Gruppen, eine Metrik',
      rows: [
        { label: 'A', tag: 'Ausgangswert' },
        { label: 'B', tag: 'höher' },
      ],
      foot: ['vor dem Start geplant', 'Guardrails eingehalten'],
    },
    agents: {
      title: 'Agenten',
      note: 'jeder prüft den vorigen',
      steps: [
        { step: 'Schreiben', note: 'Entwurf' },
        { step: 'Prüfen', note: 'jede Zahl nachverfolgt' },
        { step: 'Gegenlesen', note: 'mit frischem Blick' },
      ],
    },
    recommendation: {
      title: 'Empfehlung',
      note: 'aus den Belegen',
      verdict: 'Ausrollen.',
      why: 'Oder nicht. In beiden Fällen steht es schriftlich da, mit den Gründen.',
      toast: 'Prüfungen bestanden',
    },
    caption: 'So arbeite ich: ein Test, die Agenten, die die Arbeit prüfen, und die Empfehlung.',
  },
  proof: {
    label: 'Belege auf einen Blick',
    items: [
      {
        id: 'experiments',
        side: 'Experimente',
        figure: [{ fact: 'profile.audible.experiments' }],
        caption: ['A/B-Tests bei Audible, an denen ich mitgewirkt habe, im Web und in den mobilen Apps.'],
      },
      {
        id: 'adopted',
        side: 'Experimente',
        figure: [{ fact: 'profile.audible.recommendations_adopted' }],
        caption: ['meiner Empfehlungen wurden übernommen.'],
        whySoMany: true,
      },
      {
        id: 'setup',
        side: 'Automatisierung',
        figure: ['etwa ', { fact: 'profile.audible.setup_minutes_after' }, ' Min.'],
        caption: [
          'für die Einrichtung eines Testkontos, vorher etwa ',
          { fact: 'profile.audible.setup_minutes_before' },
          ', mit einem Tool, das ich gebaut habe. Im ganzen Team übernommen, in ',
          { fact: 'profile.audible.markets' },
          ' Märkten.',
        ],
      },
      {
        id: 'tests',
        side: 'Automatisierung',
        figure: [{ fact: 'profile.n8n.automated_tests' }],
        caption: ['automatisierte Softwaretests hinter meiner Workflow-Bibliothek für den Eingang von E-Rechnungen.'],
      },
    ],
    why: 'Warum so viele?',
  },
  experience: {
    title: 'Wo ich gearbeitet und studiert habe',
    groups: [
      { label: 'Arbeit', from: ['Audible', 'Mercor'] },
      { label: 'Studium', from: ['University of Europe', 'Jacobs University'] },
    ],
  },
  experimentsHead: {
    chip: 'Experimente und Analysen',
    title: 'Die Projekte öffnen',
    quiet: 'und sehen, wie sie entstanden sind.',
    sub: 'Jede Fallstudie zeigt die Methode, die Quellen und was sich daraus nicht ablesen lässt.',
  },
  automationHead: {
    chip: 'Automatisierung und Agenten',
    title: 'Die manuellen Schritte entfernen',
    quiet: 'und die Prüfungen behalten.',
    sub: 'Ein Tool, das mein Team bei Audible übernommen hat, und öffentliche Projekte, in denen Code die Arbeit prüft, bevor sich jemand darauf verlässt.',
  },
  featured: {
    label: 'Ausgewählte Fallstudien',
    cases: [
      {
        study: 'audible',
        href: HOME_LINKS.whySoMany,
        description: ['Wie ich A/B-Tests bei Audible geplant und ausgewertet habe, und warum so viele meiner Empfehlungen übernommen wurden.'],
        meta: 'Stichprobengröße, Signifikanztests, 2023 bis 2025',
      },
      {
        study: 'retention',
        href: HOME_LINKS.retention,
        description: [
          'Zwei Jahre Bestellungen eines britischen Online-Geschenkhändlers: Kohorten, Segmente und die Stichprobengröße für eine Rückgewinnung. Öffentlicher Datensatz, 2026 neu aufgebaut.',
        ],
        meta: 'SQL, Python, Kohortenanalyse, 2026',
      },
      {
        study: 'pulse',
        href: HOME_LINKS.pulse,
        description: [
          'Ein Analytics-Dashboard, das ich rund um eine Taxonomie aus ',
          { fact: 'pulse.events.count' },
          ' Ereignissen entworfen und gebaut habe. Eine Demo ohne echte Anwender.',
        ],
        meta: 'Amplitude, React, Ereignistaxonomie, 2026',
      },
    ],
  },
  headlines: [
    { study: 'audible', parts: ['Wie ich Experimente angehe'] },
    { study: 'retention', parts: ['Analyse zu Kundenbindung und Reaktivierung'] },
    { study: 'pulse', parts: ['Pulse: Demo zur Analytics-Instrumentierung'] },
  ],
  automation: [
    {
      id: 'automation',
      label: 'Audible-Tool für Testkonten',
      title: [
        'Ein Testkonto in etwa ',
        { fact: 'profile.audible.setup_minutes_after' },
        ' Minuten einrichten, nicht in ',
        { fact: 'profile.audible.setup_minutes_before' },
      ],
      href: HOME_LINKS.automation,
      description: [
        'Tampermonkey mit einem Schritt-Rekorder. Den Engpass habe ich selbst erkannt, das Tool gebaut und Anleitung und Video dazu erstellt. Im ganzen Team übernommen.',
      ],
      meta: ['Browser-Automatisierung, ', { fact: 'profile.audible.markets' }, ' Märkte'],
    },
    {
      id: 'docproof',
      label: 'Docproof',
      title: ['Agenten schreiben, Prüfungen entscheiden'],
      href: HOME_LINKS.docproof,
      description: [
        'Getrennte Agenten schreiben ein Dokument, prüfen es und lesen es gegen, und deterministische Prüfungen entscheiden, was beim Leser ankommt. Open Source, in der CI getestet, noch ohne Anwender.',
      ],
      meta: ['Multi-Agenten-Orchestrierung, automatisierte Prüfung, Claude Code'],
    },
    {
      id: 'n8n',
      label: 'n8n-Workflow-Bibliothek',
      title: ['Jede E-Rechnung prüfen, bevor es ein Mensch tun muss'],
      href: HOME_LINKS.n8n,
      description: [
        'Prüft eingehende E-Rechnungen, markiert Duplikate und geänderte Bankdaten und gibt Ausnahmen an einen Menschen weiter; ',
        { fact: 'profile.n8n.automated_tests' },
        ' automatisierte Tests. Ein Portfolio-Projekt, von keinem Auftraggeber verwendet.',
      ],
      meta: ['n8n, XRechnung, ZUGFeRD'],
    },
    {
      id: 'marketingws',
      label: 'MarketingWS',
      title: ['Marketingtexte entwerfen, mit einer Prüfung auf erfundene Zahlen'],
      href: HOME_LINKS.marketingws,
      description: [
        'Textvarianten aus einem Briefing und eine Faktenprüfung, die nicht belegte Zahlen in Platzhalter verwandelt. Die Live-Demo läuft mit dem kostenlosen Kontingent von Groq.',
      ],
      meta: ['Python, FastAPI, Groq'],
    },
  ],
  how: {
    head: {
      chip: 'Wie ich teste',
      title: 'Vor dem Start geplant,',
      quiet: 'ehrlich in dem, was das Ergebnis zeigt.',
      sub: 'Drei Schritte hinter jeder Empfehlung, auch wenn das Ergebnis neutral ist.',
    },
    tabs: [
      {
        id: 'plan',
        title: 'Planen',
        line: 'Ich plane Stichprobengröße und Laufzeit, bevor ein Test beginnt, damit der Zeitpunkt zum Stoppen vorab feststeht.',
      },
      {
        id: 'analyse',
        title: 'Auswerten',
        line: 'Ich prüfe die primäre Metrik auf Signifikanz und kontrolliere, ob die Guardrails gehalten haben.',
      },
      {
        id: 'recommend',
        title: 'Empfehlen',
        line: 'Ich schreibe die Empfehlung mit ihren Gründen, auch dann, wenn es sich lohnt, ein neutrales Ergebnis trotzdem auszurollen.',
      },
    ],
  },
  automate: [
    'Ich mache aus wiederkehrenden manuellen Schritten Tools, die ein ganzes Team nutzen kann.',
    'Ich baue Agenten, in denen Code und nicht das Modell das letzte Wort über Fakten hat.',
    'Ich teste meine Workflows auf die Fälle, in denen sie scheitern, nicht nur auf den, in dem alles gut läuft.',
  ],
  questions: {
    head: { chip: 'Fragen', title: 'Die Fragen, die ein Team stellt.', quiet: 'Ich bringe die Antworten mit, schriftlich.' },
    rows: [
      ['Ist die Stichprobe groß genug?', 'Wie lange sollte der Test laufen?', 'Haben die Guardrails gehalten?', 'Ist der Unterschied echt?'],
      ['Sollen wir ausrollen?', 'Welcher Schritt lässt sich automatisieren?', 'Wer prüft die Arbeit des Agenten?', 'Funktioniert es auch nächsten Monat noch?'],
    ],
  },
  site: {
    title: 'Diese Website ist Teil des Nachweises.',
    text: 'Sie führt einen A/B-Test mit den drei Experiment-Karten auf der englischen Startseite durch. Der Plan wurde vor dem Start des Tests veröffentlicht, und die Daten sind öffentlich. Ich habe sie mit Coding-Agenten gebaut, und jede Änderung besteht ihre automatisierten Prüfungen, bevor sie ausgeliefert wird.',
    live: 'Den Live-Test ansehen',
    lab: 'Das Lab ausprobieren',
  },
  faq: {
    head: { chip: 'FAQ', title: 'Was Teams bei der Einstellung fragen', sub: 'Kurze Antworten; die Seiten dahinter enthalten die Einzelheiten.' },
    items: FAQ_ITEMS,
  },
  sketches: SKETCH_TEXT_DE,
  liveBar: 'Live-Test',
  staticNote: {
    before: 'Diese Website führt ein Experiment mit ihren Besuchern durch. Den aktuellen Stand sehen Sie im ',
    link: 'Live-Test',
    after: '.',
  },
  cta: CTA_DE,
  photoAlt: 'Mahmoud El Bergui, der in die Kamera lächelt, in einem dunkelblauen Pullover mit Rundhalsausschnitt vor hellgrauem Hintergrund',
};
