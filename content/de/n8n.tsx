import 'server-only';
import type { N8nCopy } from '../n8n';

// The n8n build note in German: formal "Sie" where it addresses the reader, facts in the first person,
// one German sentence per English sentence, typed by N8nCopy so a missing key fails the typecheck. It is
// document and process automation for e-invoices and error alerts, a personal project with no client
// and no live operation, so the outcome is the engineering only. The test count is a Fact. The soft
// hyphen (U+00AD) marks where a long compound in the h1 may break at 320 px.
export const N8N_DE: N8nCopy = {
  title: 'Eingang von E-Rechnungen und Fehler­benachrichtigungen in n8n',
  quiet: (s) => (
    <>
      mit {s.fact('profile.n8n.automated_tests')} automatisierten Tests.
    </>
  ),
  intro: () => (
    <p>
      Seit Januar 2025 müssen deutsche Unternehmen elektronische Rechnungen empfangen können. Ich habe
      Automatisierungen gebaut, die jede Rechnung lesen, ihre Summen und Bankdaten prüfen, die routinemäßigen
      freigeben und alles Ungewöhnliche an eine Person weitergeben.
    </p>
  ),
  glance: (s) => ({
    points: [{ id: 'tests', figure: s.fact('profile.n8n.automated_tests'), label: 'automatisierte Tests' }],
    outcome:
      'Dokumenten- und Prozessautomatisierung in n8n, die sich mit einem Befehl installieren lässt und nach einer vollständigen Löschung ihrer Daten wiederhergestellt und geprüft wurde.',
    role: 'Ich habe die Anforderungen festgelegt und die Designentscheidungen getroffen.',
    methods:
      'Strukturelle, rechnerische und Stammdatenprüfungen, Markierung von Dubletten und geänderten Bankdaten, Wiederherstellungstest, Test der sauberen Installation.',
    tools: 'n8n, Node.js, REST/Webhooks, Gmail API, Docker, PostgreSQL, Caddy, GitHub Actions.',
    when: '2026.',
    scope: 'Persönliches Projekt, 2026. Kein Auftraggeber und kein Echtbetrieb; jede Rechnung war ein erzeugtes Muster.',
  }),
  problem: () => [
    [
      'einvoice',
      <>
        Jede strukturierte E-Rechnung kommt als XML an. Jemand muss sie lesen und prüfen und riskante Fälle erkennen,
        etwa geänderte Bankdaten.
      </>,
    ],
    [
      'alerts',
      <>
        Ein fehlschlagender Workflow wird leicht übersehen. Ich wollte getestete Automatisierungen für beides, mit
        einem Befehl installiert.
      </>,
    ],
  ],
  architecture: () => [
    [
      'intake',
      <>
        Rechnungen kommen per Upload oder aus einem Gmail-Postfach, als XRechnung (CII oder UBL), ZUGFeRD oder
        Factur-X. Der Eingang prüft Summen, Umsatzsteuer, Datumsangaben, Steuer-IDs, die IBAN-Prüfsumme und die Währung,
        findet Dubletten auch über Formate hinweg, markiert geänderte Bankdaten und archiviert das Original Byte für
        Byte. Bekannte, einwandfreie Rechnungen werden automatisch freigegeben; die übrigen gehen an eine Person.
      </>,
    ],
    [
      'alerts',
      <>
        Die Fehlerbenachrichtigungen machen aus jedem fehlschlagenden Workflow eine lesbare E-Mail, in der Geheimnisse
        und personenbezogene Daten nach Möglichkeit entfernt sind und Wiederholungen gedrosselt werden.
      </>,
    ],
  ],
  flow: {
    tracks: [
      {
        id: 'intake',
        label: 'Eingang von E-Rechnungen',
        steps: [
          { name: 'Eingang', detail: 'Upload-Adresse oder Gmail-Postfach' },
          { name: 'Lesen und prüfen', detail: 'Summen, Umsatzsteuer, Datumsangaben, Steuer-IDs, IBAN, Währung' },
          { name: 'Vergleichen', detail: 'Dubletten und geänderte Bankdaten' },
          { name: 'Archivieren', detail: 'Das Original, Byte für Byte' },
          [
            { name: 'Automatisch freigegeben', detail: 'Bekannte, einwandfreie Rechnungen' },
            { name: 'An eine Person', detail: 'Alles andere, zum Freigeben oder Ablehnen' },
          ],
        ],
      },
      {
        id: 'alerts',
        label: 'Fehlerbenachrichtigungen',
        steps: [
          { name: 'Ein Workflow schlägt fehl', detail: 'Im selben n8n' },
          { name: 'Eine lesbare E-Mail', detail: 'Geheimnisse nach Möglichkeit entfernt, Wiederholungen gedrosselt' },
        ],
      },
    ],
    title: 'Jede Rechnung wird geprüft und archiviert, und alles Ungewöhnliche geht an eine Person',
    leadIn: 'Folgen Sie einer Rechnung vom Moment ihres Eingangs bis zu ihrem Ergebnis.',
    takeaway:
      'Nur Rechnungen, die mit dem bereits Bekannten übereinstimmen, laufen von allein durch; alles andere wartet auf eine Person.',
    caption:
      'Der Eingang von E-Rechnungen und die Fehlerbenachrichtigungen, Schritt für Schritt. E-Mails aus dem Gmail-Eingang durchlaufen dieselben Schritte wie ein Upload.',
  },
  checks: (s) => [
    [
      'suites',
      <>
        {s.fact('profile.n8n.automated_tests')} automatisierte Tests decken die Workflows, den Installer, die
        Rechnungslogik, Ende-zu-Ende-Uploads, den E-Mail-Eingang und die Fehlerbenachrichtigungen ab. Der letzte
        Durchlauf hat alles auf einem neu aufgesetzten n8n installiert, mit Smoke-Tests und einem Abnahmetest, wie ihn ein
        Auftraggeber durchführen würde.
      </>,
    ],
    [
      'failure',
      <>
        Auch den Fehlerfall habe ich absichtlich getestet: XML mit Entity-Definitionen, parallel gesendete Dubletten
        und einen Server ohne die zlib-Berechtigung, auf dem jeder Upload fehlschlug, bis ich es behoben hatte.
      </>,
    ],
    [
      'ci',
      <>
        Ein Teil der Testsuite läuft bei jedem Push in GitHub Actions; die Tests, die ein laufendes n8n, echte
        Web-Aufrufe oder ein Gmail-Postfach brauchen, führe ich von Hand aus.
      </>,
    ],
  ],
  checksSummary: 'Die Fehlerfälle und was bei jedem Push läuft',
  outcome: () => [
    [
      'ships',
      <>
        Das Projekt wird mit einem Installer geliefert, der Prüfungen, einen Probelauf und sichere Wiederholungen hat; einem
        Docker-Compose-Stack mit PostgreSQL, HTTPS über Caddy und einer festgelegten n8n-Version; sowie Skripten für
        Sicherung, Wiederherstellung und Health-Checks. Eine Wiederherstellung nach dem Verlust aller
        Daten-Volumes wurde verifiziert.
      </>,
    ],
  ],
  limits: () => [
    [
      'validation',
      <>
        Kein Auftraggeber und kein Echtbetrieb; jede Rechnung war ein erzeugtes Muster. Der Stack lief mit Docker auf
        meinem eigenen Rechner, nicht auf einem gehosteten Server.
      </>,
    ],
    [
      'scope',
      <>
        Kein zertifizierter XRechnung-Validator: Die Prüfungen sind nur strukturell, rechnerisch und auf Stammdaten
        bezogen, ohne OCR für gescannte PDFs, ohne Anbindung an eine Buchhaltungssoftware und ohne Outlook- oder
        IMAP-Eingang.
      </>,
    ],
    [
      'tested',
      <>
        Seine E-Mails sind nur auf Englisch. Der Gmail-Eingang wurde mit einem einzigen Test-Postfach nachgewiesen,
        und solange die Google-App im Testmodus ist, läuft ihre Anmeldung nach etwa einer Woche ab.
      </>,
    ],
    [
      'needs',
      <>
        Das Projekt erwartet ein selbst gehostetes n8n, das das zlib-Modul erlaubt (ohne es gehen PDF-Rechnungen an eine
        Person), und ein SMTP-Konto.
      </>,
    ],
  ],
  needsSummary: 'Was es zum Laufen braucht',
  close: 'Ich kann einen Back-Office-Prozess automatisieren und mit Tests belegen, dass er funktioniert.',
  sources: {
    repo: 'Das Repository, an einem festen Commit',
    tests: 'Seine Testergebnisse',
    licence: 'Seine Lizenz, MIT',
  },
};
