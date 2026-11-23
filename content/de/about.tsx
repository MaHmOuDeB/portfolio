import 'server-only';
import type { AboutCopy, CvCopy, CvEntry } from '../about';

// The About page and the CV page in German: formal "Sie" where they address the reader, facts in the
// first person, one German sentence per English sentence, typed by AboutCopy and CvCopy so a missing
// key fails the typecheck. A figure is a function of the slots, which hold the number as an element in
// German. The teams were one after another, the tool is Tampermonkey with a step recorder, and the
// language list is kept apart (content/de/languages.ts).

export const ABOUT_DE: AboutCopy = {
  story: [
    'Ich plane A/B-Tests, sage klar, was sie zeigen, und baue die Automatisierung darum herum.',
    'Fast zwei Jahre war ich Werkstudent bei Audible (Amazon), hauptsächlich im Bereich Growth-Experimente, dazu etwas Marketing-Analytics.',
    (s) => (
      <>
        Ich habe an {s.fact('profile.audible.experiments')} A/B-Tests im Web und in den mobilen Apps mitgewirkt, die
        Stichprobenplanung und die Signifikanztests selbst gemacht und während meiner Zeit dort nacheinander mit{' '}
        {s.fact('profile.audible.teams')} Teams gearbeitet.
      </>
    ),
    (s) => (
      <>
        Außerdem habe ich ein Tool zur Browser-Automatisierung gebaut, Tampermonkey mit einem Schritt-Rekorder, das die
        Einrichtung von Testkonten von etwa {s.fact('profile.audible.setup_minutes_before')} auf etwa{' '}
        {s.fact('profile.audible.setup_minutes_after')} Minuten verkürzt hat und im ganzen Team übernommen wurde.
      </>
    ),
    'Ich habe einen MSc in Data Science der University of Europe for Applied Sciences in Berlin (2025), und seitdem habe ich meine Master-Projekte mit öffentlichen Daten neu aufgebaut und eigene Tools gebaut.',
    'Bei Audible habe ich außerdem interne KI-Tools gebaut, die ein größeres Team übernommen hat, und SQL-Segmentierungsabfragen für eine Personalisierung geschrieben, die die Einwilligung beachtet: für Mitglieder mit und ohne Einwilligung, nach den Regeln des Digital Markets Act (DMA).',
  ],
  focus:
    'Ich arbeite an zwei Dingen, die zusammengehören: Experimente, die in einer klaren Empfehlung enden, und Automatisierung, die die manuelle Arbeit auf dem Weg dorthin übernimmt. Bei Audible waren das A/B-Tests und ein Browser-Tool, das mein Team übernommen hat; seitdem sind es Agenten, Workflows und die Prüfungen darum herum.',
  timeline: [
    { range: { from: '2026-10', to: null }, role: 'AI Data Specialist, Business and Analytics Workflows (Contract)', where: 'Mercor, remote' },
    {
      range: { from: '2023-08', to: '2025-04' },
      role: 'Werkstudent: Marketing Analytics & Growth-Experimentation',
      where: 'Audible (Amazon), Berlin',
    },
    { range: { from: '2023-04', to: '2025-11' }, role: 'MSc Data Science', where: 'University of Europe for Applied Sciences, Berlin' },
    {
      range: { from: '2019-09', to: '2022-11' },
      role: 'BSc Computer Science',
      where: 'Jacobs University Bremen (heute Constructor University), Bremen',
    },
  ],
  tools: [
    { tool: 'SQL (DuckDB)', where: 'die Kundenbindungsanalyse, das KPI-Dashboard und die Wetter-Pipeline' },
    { tool: 'Python: pandas, NumPy, scikit-learn und XGBoost', where: 'die Analyseprojekte' },
    { tool: 'Excel', where: 'zweiwöchentliche Leistungsberichte bei Audible' },
    { tool: 'Tableau, als Datenquelle', where: 'die Daten hinter diesen Berichten' },
    { tool: 'Tampermonkey mit einem Schritt-Rekorder', where: 'das Tool zur Automatisierung der Testkonten bei Audible' },
    { tool: 'Amplitude', where: 'die Pulse-Demo zur Instrumentierung' },
    { tool: 'React, TypeScript und Vite', where: 'das Pulse-Dashboard' },
    { tool: 'Flask, FastAPI, Streamlit und Docker', where: 'das Tool meiner Masterarbeit und sein Neuaufbau 2026' },
    { tool: 'Claude Code', where: 'die Agenten und automatisierten Prüfungen in Docproof' },
    { tool: 'n8n', where: 'die Bibliothek für den Eingang von E-Rechnungen und Fehlerbenachrichtigungen' },
    { tool: 'GitHub Actions', where: 'Continuous Integration für meine öffentlichen Projekte' },
  ],
  ui: {
    chip: 'Über mich',
    open: 'Offen für Stellen',
    title: 'Analyst für A/B-Testing und KI-Automatisierung',
    quiet: 'in Berlin, Deutschland.',
    readCv: 'Lebenslauf lesen',
    sections: { timeline: 'Werdegang', tools: 'Tools und wo ich sie genutzt habe', languages: 'Sprachen' },
    photoAlt:
      'Mahmoud El Bergui lächelt in die Kamera, in einem dunkelblauen Pullover mit Rundhalsausschnitt vor einem hellgrauen Hintergrund',
    months: { to: 'bis', present: 'heute' },
  },
};

const REBUILT = 'Persönliches Projekt mit einem öffentlichen Datensatz, 2026 neu aufgebaut';

const EXPERIENCE: readonly CvEntry[] = [
  {
    id: 'mercor',
    title: 'AI Data Specialist, Business and Analytics Workflows (Contract)',
    where: 'Mercor, Berlin, Deutschland (remote)',
    range: { from: '2026-10', to: null },
    claims: [
      {
        id: 'mercor-data',
        body: 'Erstellung hochwertiger Trainingsdaten für KI-Modelle, mit Business- und Analytics-Expertise: präzise, gut dokumentierte Arbeitsbeispiele.',
      },
      {
        id: 'mercor-accuracy',
        body: 'Genauigkeit an erster Stelle: Prüfung und Erläuterung jedes Ergebnisses sowie nachvollziehbare Dokumentation, sodass andere die Arbeit prüfen und wiederholen können.',
      },
      { id: 'mercor-standards', body: 'Arbeit nach strengen Qualitätsstandards, mit Sorgfalt bei Datenschutz und Vertraulichkeit.' },
    ],
  },
  {
    id: 'audible',
    title: 'Marketing Analytics & Growth-Experimentation (Werkstudent)',
    where: 'Audible (Amazon), Berlin, Deutschland',
    range: { from: '2023-08', to: '2025-04' },
    claims: [
      {
        id: 'audible-tests',
        body: (s) => (
          <>
            An {s.fact('profile.audible.experiments')} A/B-Tests im Web und in den mobilen Apps auf den internen
            Plattformen von Amazon mitgewirkt, von der Hypothese bis zur Empfehlung, und die Stichprobenplanung und die
            Signifikanztests selbst gemacht.
          </>
        ),
      },
      {
        id: 'audible-adopted',
        body: (s) => (
          <>
            {s.fact('profile.audible.recommendations_adopted')} meiner Empfehlungen wurden übernommen: Viele Tests waren
            Wetten auf Personalisierung und Reihenfolge gegen nicht personalisierte Ausgangsvarianten, die Ideen kamen
            aus einer vorab geprüften Pipeline, und neutrale Ergebnisse durften ausgerollt werden, wenn die Guardrails
            hielten und es einen Produktgrund gab.
          </>
        ),
      },
      {
        id: 'audible-metrics',
        body: 'Experimente für die Teams ausgewertet, die gespiegelte Metrik-Setups nutzten (Umsatz als primäre und Hörminuten als sekundäre Metrik oder umgekehrt), mit Churn und inkrementellem Langzeitwert (ILTV) als Guardrails.',
      },
      {
        id: 'audible-crm',
        body: 'An CRM-gesteuerter Personalisierung für Mitgliedersegmente mit und ohne Einwilligung auf den Home- und Discovery-Seiten mitgewirkt, die SQL-Segmentierungsabfragen nach den Einwilligungsregeln des DMA geschrieben und das Targeting teamübergreifend abgestimmt.',
      },
      {
        id: 'audible-automation',
        body: (s) => (
          <>
            Einen manuellen Engpass erkannt und ein Automatisierungstool gebaut (Tampermonkey mit einem Schritt-Rekorder),
            das die Einrichtung von Testkonten in {s.fact('profile.audible.markets')} Märkten von ca. {s.fact('profile.audible.setup_minutes_before')} auf ca.{' '}
            {s.fact('profile.audible.setup_minutes_after')} Minuten verkürzt hat (ca. {s.fact('profile.audible.setup_time_cut')}), und die Übernahme im ganzen Team mit einer Anleitung und einem
            Video vorangebracht.
          </>
        ),
      },
      {
        id: 'audible-ai-tools',
        body: 'KI-Tools gebaut, die das größere Team übernommen hat, nachdem ich Amazon Bedrock für Anwendungsfälle zur Effizienzsteigerung im Team bewertet hatte: ein Tool für A/B-Test-Ideen, das frühere Experimentergebnisse auswertet, und einen Generator für Jira-Launch-Tickets.',
      },
      {
        id: 'audible-reports',
        body: 'Zweiwöchentliche Excel-Leistungsberichte zu Experimenten, Kampagnen und Lifecycle-KPIs aus Tableau-Daten für leitende Stakeholder der Teams gebaut, mit denen ich gearbeitet habe.',
      },
      {
        id: 'audible-campaigns',
        body: (s) => (
          <>
            Content-Kampagnen im CMS in der App und auf der Website in {s.fact('profile.audible.markets')} Marktplätzen eingerichtet und
            aktualisiert und dabei Titel platziert, die mit dem Content-Curation-Team ausgewählt wurden; die
            Content-Entdeckung und das Merchandising im französischen Markt unterstützt.
          </>
        ),
      },
    ],
  },
  {
    id: 'direct-results',
    title: 'Fundraiser & Marketing Representative',
    where: 'Direct Results, Berlin, Deutschland',
    range: { from: '2023-03', to: '2023-06' },
    claims: [
      {
        id: 'direct-results-donors',
        body: 'Durch persönliche Ansprache neue monatliche Spender für CARE, das International Rescue Committee und World Vision gewonnen.',
      },
      {
        id: 'direct-results-team',
        body: 'Neue Teammitglieder angeworben und eingearbeitet: der Leitung bei situativen Interviews geholfen, vielversprechende Personen auf der Straße angesprochen und Neueinsteiger im Verkaufstrichter des Straßen-Fundraisings angeleitet.',
      },
    ],
  },
  {
    id: 'geo-engineering',
    title: 'Praktikant, Forschungsassistenz',
    where: 'Geo Engineering, Bremen, Deutschland',
    range: { from: '2021-06', to: '2021-09' },
    claims: [
      {
        id: 'geo-cnc',
        body: 'Unter akademischer Betreuung eine CNC-Fräsmaschine entworfen, kalibriert und getestet, damit das Unternehmen Teile selbst fertigen konnte, statt sie zu kaufen, und ihre technische Dokumentation und Inventarliste erstellt (Excel, Solid Edge, Estlcam).',
      },
    ],
  },
];

export const CV_DE: CvCopy = {
  summary: [
    {
      id: 'summary-tenure',
      body: (s) => (
        <>
          Analyst für A/B-Testing und Growth mit fast zwei Jahren bei Audible (Amazon): an{' '}
          {s.fact('profile.audible.experiments')} A/B-Tests im Web und in den mobilen Apps mitgewirkt und während meiner
          Zeit dort nacheinander mit {s.fact('profile.audible.teams')} Teams gearbeitet.
        </>
      ),
    },
    {
      id: 'summary-tool',
      body: (s) => (
        <>
          Ein Tool zur Browser-Automatisierung gebaut, das die Einrichtung von Testkonten von ca.{' '}
          {s.fact('profile.audible.setup_minutes_before')} auf ca. {s.fact('profile.audible.setup_minutes_after')} Minuten
          verkürzt hat und im ganzen Team übernommen wurde.
        </>
      ),
    },
    {
      id: 'summary-skills',
      body: 'MSc in Data Science (2025); ich arbeite mit SQL und Python und baue LLM-Anwendungen und agentische Workflows.',
    },
  ],
  experience: EXPERIENCE,
  skills: [
    {
      label: 'Tools und Programmiersprachen',
      items: 'SQL (DuckDB), Python (pandas, NumPy, scikit-learn, XGBoost, statsmodels), Power BI, Tableau, Excel, Amplitude, REST-APIs, Git/GitHub, Streamlit.',
    },
    {
      label: 'Analyse und Methoden',
      items:
        'A/B-Testing und Experimentation (Signifikanztests, Stichprobenplanung), Metrikdesign für Experimente (primäre, sekundäre und Guardrail-Metriken), Funnel-, Lifecycle- und Kohortenanalyse der Kundenbindung, RFM-Segmentierung, Vorhersagemodelle (überwachtes ML) und Clustering, CRM-Segmentierung (unter Beachtung der Einwilligung), KPI-Definition und Stakeholder-Reporting, Produktanalyse und Event-Tracking.',
    },
    {
      label: 'KI und Automatisierung',
      items:
        'Analyse und Programmierung mit KI-Unterstützung (Claude Code, ChatGPT, Microsoft Copilot), agentische Workflows (eigene Claude-Agenten, mehrstufige Pipelines mit automatisierter Prüfung), LLM-Anwendungen über die API (OpenAI GPT), Prozessautomatisierung (Python, n8n, Browser-Automatisierung).',
    },
  ],
  education: [
    {
      id: 'msc',
      title: 'MSc Data Science',
      where: (s) => (
        <>
          University of Europe for Applied Sciences, Berlin, deutsche Note {s.fact('profile.education.msc_grade')}
        </>
      ),
      range: { from: '2023-04', to: '2025-11' },
      claims: [],
      lines: [
        'Relevante Fächer: Marketing Analytics, Machine Learning, Data Visualization, Data Engineering, Cloud Computing (AWS), Agile Project Management.',
      ],
    },
    {
      id: 'bsc',
      title: 'BSc Computer Science',
      where: 'Jacobs University Bremen (heute Constructor University)',
      range: { from: '2019-09', to: '2022-11' },
      claims: [],
      lines: [
        'Nebenfach Global Economics and Management.',
        'Relevante Fächer: Databases & Web Services, Machine Learning, Probability and Random Processes, Software Engineering, Algorithms & Data Structures.',
      ],
    },
  ],
  projects: [
    {
      id: 'retention',
      title: 'Kundenbindung und Reaktivierung: eine Analyse',
      href: '/work/retention',
      where: REBUILT,
      claims: [
        {
          id: 'retention-analysis',
          body: (s) => (
            <>
              {s.fact('retention.data.clean_rows')} bereinigte Bestellpositionen (
              {s.fact('retention.data.customers')} Kunden) aus einem öffentlichen Datensatz eines britischen
              Online-Händlers analysiert: Kohorten-Kundenbindung, RFM-Segmente und ein {s.windowDays()}-Tage-Wiederkaufsmodell, bewertet
              auf einem späteren Zeitraum (AUC {s.fact('retention.model.gb_auc', 2)} gegenüber{' '}
              {s.fact('retention.model.rule_auc', 2)} für eine Regel, die die Kunden mit dem jüngsten Kauf zuerst nimmt).
            </>
          ),
        },
        {
          id: 'retention-segments',
          body: (s) => (
            <>
              Kunden nach Recency, Frequenz und Ausgaben segmentiert (Champions:{' '}
              {s.fact('retention.rfm.champions_customer_share')} der Kunden,{' '}
              {s.fact('retention.rfm.champions_revenue_share')} der Ausgaben) und einen Holdout-Test dimensioniert (
              {s.fact('retention.winback.n_per_arm')} Kunden je Gruppe, um +{s.fact('retention.winback.uplift_pp')}{' '}
              Prozentpunkte nachzuweisen), um ein Rückgewinnungsangebot zu messen.
            </>
          ),
        },
      ],
      technologies: 'Python (pandas, scikit-learn, statsmodels), SQL (DuckDB), pytest, GitHub Actions.',
    },
    {
      id: 'kpi-dashboard',
      title: 'Retail-KPI-Dashboard',
      where: REBUILT,
      claims: [
        {
          id: 'kpi-dashboard',
          body: (s) => (
            <>
              Ein statisches KPI-Dashboard (Chart.js) über mit SQL erstellten KPI-Tabellen gebaut; rückgängig gemachte Bestellungen
              ausgeschlossen (eine Bestellung und ihre Stornierung), die den Umsatz aufgebläht hatten und den Eindruck
              erweckten, die Retouren seien um {s.fact('retail.returns.yoy_growth_raw')} gewachsen.
            </>
          ),
        },
      ],
      technologies: 'SQL (DuckDB), JavaScript (Chart.js), Python, GitHub Pages, GitHub Actions.',
    },
    {
      id: 'pulse',
      title: 'Pulse: Amplitude-Analytics-Demo',
      where: 'Persönliches Projekt, 2026',
      claims: [
        {
          id: 'pulse-taxonomy',
          body: (s) => (
            <>
              Ein Dashboard entworfen und gebaut, das die Instrumentierung mit Amplitude zeigt: eine{' '}
              {s.fact('pulse.events.count')}-Event-Taxonomie, in der jedes Event eine Produktfrage beantworten soll
              (Aktivierung, Nutzung, Kaufabsicht, Kundenbindung), plus User Properties zur Segmentierung.
            </>
          ),
        },
        {
          id: 'pulse-replay',
          body: 'Autocapture und Session Replay unter die explizite Taxonomie gelegt und über GitHub und Vercel per CI/CD bereitgestellt.',
        },
      ],
      technologies: 'React, TypeScript, Vite, Tailwind CSS, Amplitude (Event-Tracking, Session Replay), Git/GitHub, Vercel.',
    },
    {
      id: 'thesis',
      title: 'Webdienst für generative KI im Content-Marketing',
      where: 'Masterarbeit',
      range: { from: '2025-04', to: '2025-11' },
      claims: [
        {
          id: 'thesis-tool',
          body: 'Ein webbasiertes Tool mit generativer KI gebaut, das aus einem Briefing plattformspezifische Marketing-Inhalte schreibt (Social Media, E-Mail, PPC, Produkteinführungen), mit iterativem Feedback aus dem Marketing.',
        },
        {
          id: 'thesis-rebuild',
          body: '2026 als Live-Web-App neu aufgebaut (FastAPI, Vercel), mit Textvarianten und einer Faktenprüfung gegen erfundene Aussagen.',
        },
      ],
      technologies: 'Python, Flask, FastAPI, Streamlit, Docker, Google Cloud Run, Vercel, OpenAI GPT, Claude, Groq, Meta NLLB.',
    },
    {
      id: 'docproof',
      title: 'Docproof: Multi-Agenten-Dokumenten-Pipeline',
      where: 'Open-Source-Projekt, 2026',
      claims: [
        {
          id: 'docproof-pipeline',
          body: 'Eine Open-Source-Pipeline (Python-CLI + Claude-Agenten) gebaut, die aus einer strukturierten Faktenbasis Word-Dateien und gestaltete PDFs erzeugt; mit jedem LLM nutzbar (mit Claude-Modellen getestet; GPT und Gemini konzeptionell vorgesehen).',
        },
        {
          id: 'docproof-verification',
          body: 'Automatisierte Prüfung der Aussagen: Jede Zahl muss sich auf die Faktenbasis zurückführen lassen, und aufgeführte Lücken werden blockiert.',
        },
        {
          id: 'docproof-agents',
          body: 'Die Arbeit auf Agenten verteilt (Autor, Prüfer der Aussagen, kontextfreier Gutachter), abgesichert durch Unit-Tests und GitHub-Actions-CI mit Render-Prüfungen in Headless Chrome.',
        },
      ],
      technologies: 'Python, Claude Code (Agenten und Skills), HTML/CSS, Headless Chrome, GitHub Actions.',
    },
    {
      id: 'weather',
      title: 'Globale Wetterdaten-Pipeline',
      where: REBUILT,
      claims: [
        {
          id: 'weather-pipeline',
          body: (s) => (
            <>
              Ein SQL-Sternschema mit {s.fact('weather.checks.count')} automatisierten Datenqualitätsprüfungen gebaut und
              k-NN, Random Forest und XGBoost für die Regenklassifikation mit nach Standort gruppierter Kreuzvalidierung
              verglichen (XGBoost: AUC {s.fact('weather.model.xgb_auc')}, F1 {s.fact('weather.model.xgb_f1')}).
            </>
          ),
        },
      ],
      technologies: 'SQL (DuckDB), Python (pandas, scikit-learn, XGBoost), pytest, GitHub Actions.',
    },
    {
      id: 'n8n',
      title: 'n8n-Bibliothek: Eingang von E-Rechnungen und Benachrichtigungen',
      where: 'Persönliches Projekt, 2026',
      claims: [
        {
          id: 'n8n-intake',
          body: 'Einen Eingang für E-Rechnungen in n8n gebaut (XRechnung, ZUGFeRD: deutsche E-Rechnungsformate), der Lieferantenrechnungen liest und prüft, Dubletten und geänderte Bankdaten markiert, Originale archiviert und Ausnahmen an eine Person weiterleitet.',
        },
        {
          id: 'n8n-delivery',
          body: 'Einen Gmail-Eingang und ein gemeinsames System für Fehlerbenachrichtigungen ergänzt, mit Ein-Befehl-Installer, Abnahmetest und Docker-Setup (PostgreSQL, HTTPS), dessen Backup nach einer vollständigen Löschung der Daten wiederhergestellt wurde.',
        },
        {
          id: 'n8n-tests',
          body: (s) => (
            <>
              {s.fact('profile.n8n.automated_tests')} automatisierte Tests (ein Teil der Suite läuft bei jedem Push in
              GitHub Actions); auf einer sauberen n8n-Installation geprüft.
            </>
          ),
        },
      ],
      technologies: 'n8n, JavaScript (Node.js), REST-APIs und Webhooks, Gmail API (OAuth2), Docker, PostgreSQL, GitHub Actions.',
    },
  ],
  ui: {
    chip: 'Lebenslauf',
    role: 'Analyst für A/B-Testing und KI-Automatisierung',
    city: 'Berlin, Deutschland',
    write: 'Schreiben Sie mir',
    print: 'Seite drucken',
    technologies: 'Technologien:',
    downloadBefore: 'Lebenslauf herunterladen (PDF auf Englisch, ',
    sections: {
      summary: 'Zusammenfassung',
      experience: 'Berufserfahrung',
      skills: 'Kenntnisse',
      education: 'Ausbildung',
      languages: 'Sprachen',
      projects: 'Projekte',
    },
    months: { to: 'bis', present: 'heute' },
  },
};
