import 'server-only';
import type { DocproofCopy } from '../docproof';

// The Docproof build note in German: formal "Sie" where it addresses the reader, facts in the first
// person, one German sentence per English sentence, typed by DocproofCopy so a missing key fails the
// typecheck. Docproof is multi-agent orchestration and automated verification of documents against one
// fact base. The recorded run (the fact base, the notice, the command and its output) stays as captured,
// in English; only the words around it are translated.
export const DOCPROOF_DE: DocproofCopy = {
  h1: 'Docproof: Agenten schreiben,',
  quiet: 'Prüfungen entscheiden.',
  intro: (
    <p>
      KI-Schreibwerkzeuge behaupten manchmal Dinge, die ihre Quelle nie gesagt hat. Docproof ist ein Werkzeug, das ich
      dagegen entworfen und gebaut habe: KI-Agenten entwerfen und prüfen ein Dokument, und gewöhnlicher Code vergleicht
      jede Zahl mit einer einzigen freigegebenen Liste von Fakten und blockiert die Behauptungen, die diese Liste
      ausschließt, bevor etwas veröffentlicht wird.
    </p>
  ),
  glance: {
    outcome: 'Agenten schlagen die Änderungen vor; deterministische Prüfungen entscheiden, was bei den Lesern ankommt.',
    role: 'Entworfen und gebaut.',
    methods:
      'Eine einzige Faktenbasis, Prüfung von Behauptungen, Multi-Agenten-Orchestrierung (Autor, Prüfer, kontextfreier Gutachter), Prüfungen der Darstellung.',
    tools: 'Python, Claude-Code-Agenten und -Skills, Headless Chrome, GitHub Actions.',
    when: '2026.',
    scope: 'Open Source (MIT), 2026 gebaut. Noch keine Nutzer.',
  },
  problem: [
    [
      'drift',
      <>
        Sprachmodelle sind gut darin, Text umzuschreiben, und schlecht darin, einer Quelle treu zu bleiben. Wenn ein
        Modell ein Dokument entwirft oder bearbeitet, kann es in Behauptungen abdriften, die die Quelle nie aufgestellt
        hat, und diese Arbeit von Hand zu erledigen ist langsam.
      </>,
    ],
    [
      'split',
      <>
        Docproof teilt die Arbeit in zwei: Deterministische Werkzeuge erledigen die Teile, die exakt sein müssen und
        zeigen können, was sie geändert haben, und Agenten mit getrennten Rollen treffen die Ermessensentscheidungen.
        Nichts, was ein Agent schreibt, erreicht die Leser, ohne die Prüfungen der Werkzeuge zu bestehen.
      </>,
    ],
  ],
  architecture: [
    [
      'tool',
      <>
        Eine Markdown-Datei, die Faktenbasis, ist die einzige Quelle der Wahrheit. Sie führt auch bekannte Lücken auf:
        Dinge, die ein Dokument nie behaupten darf. Ein Python-Kommandozeilenwerkzeug baut Word-Dateien aus
        strukturierten Daten, schreibt chirurgische Änderungen in eine neue Datei, die alles andere Byte für Byte
        gleich lässt, und setzt gestaltete PDFs mit Headless Chrome.
      </>,
    ],
    [
      'agents',
      <>
        Claude-Code-Agenten arbeiten über dieses Werkzeug. Ein Autor entwirft und bearbeitet; ein Behauptungsprüfer
        vergleicht jede Behauptung mit der Faktenbasis und bearbeitet nie; ein kontextfreier Gutachter liest das
        Ergebnis ohne die Faktenbasis, wie es ein Fremder täte. Der Orchestrator, eine Person oder ein
        Claude-Code-Befehl, wägt ihre Befunde ab, wendet nur die berechtigten Korrekturen über das Werkzeug an und
        lässt die Prüfungen erneut laufen.
      </>,
    ],
  ],
  diagram: {
    title: 'Agenten schlagen Änderungen vor; deterministische Prüfungen entscheiden, was bei den Lesern ankommt',
    caption: 'Eine fehlgeschlagene Prüfung schickt das Dokument zurück an den Orchestrator, nie weiter zu den Lesern.',
    stages: [
      {
        id: 'input',
        name: 'Eingabe',
        body: 'Eine Faktenbasis in Markdown, mit ihren bekannten Lücken, und das Dokument als Word-Datei.',
      },
      {
        id: 'orchestration',
        name: 'Orchestrierung',
        body: 'Ein Autor-Agent entwirft und bearbeitet, ein Behauptungsprüfer prüft jede Behauptung, ein kontextfreier Gutachter liest unvoreingenommen, und der Orchestrator wendet nur die berechtigten Korrekturen an.',
      },
      {
        id: 'checks',
        name: 'Prüfungen',
        body: 'Jede Änderung betrifft nur ihr Ziel, jede Zahl steht in der Faktenbasis, keine bekannte Lücke wird behauptet und jedes Wort gelangt ins PDF.',
      },
      {
        id: 'report',
        name: 'Bericht',
        body: 'Bestanden oder nicht bestanden, mit Nennung jeder fehlerhaften Zeile, dazu das PDF und Seitenbilder zum Ansehen.',
      },
    ],
  },
  verification: (
    <p>
      Die Werkzeuge sind gewöhnlicher Code und werden deshalb wie Code getestet: Unit-Tests und ein GitHub-Actions-Lauf
      bei jedem Push, der ein echtes PDF in Headless Chrome rendert und die Demo ausführt. Jeder Bearbeitungsbefehl
      vergleicht das Dokument vorher und nachher und schlägt fehl, wenn sich etwas anderes als sein Ziel geändert hat.
      Die gerenderten Seiten werden trotzdem angesehen, vom Autor-Agenten oder von wem auch immer die Werkzeuge
      ausführt; keine Prüfung ersetzt das.
    </p>
  ),
  verificationSummary: 'Wie die Werkzeuge selbst getestet werden',
  run: {
    title: 'Ein aufgezeichneter Lauf der Verify-Prüfung',
    sheetLabel: 'Aufgezeichneter Lauf',
    leadIn: (n) => (
      <>
        Eine erfundene Gartenmitteilung mit zwei eingebauten Fehlern: Sie nennt {n.planted} Abende, wo die Fakten{' '}
        {n.fact} sagen, und sie erwähnt ein Gewächshaus, das die Fakten ausschließen.
      </>
    ),
    takeaway:
      'Die Prüfung hat die Mitteilung durchfallen lassen und beide Zeilen benannt. Kein Modell wurde gefragt, ob der Text stimmt; Code hat ihn mit den Fakten verglichen.',
    notRecorded: 'Nicht aufgezeichnet.',
    labels: {
      factBase: 'Die Faktenbasis',
      notice: 'Die Mitteilung, ein Absatz je Zeile',
      output: 'Der Befehl und seine Ausgabe',
    },
    recorded: (p) => (
      <>
        Aufgezeichnet am {p.date} mit Docproof am Commit {p.commit}, aus dem Quellcode ausgeführt. Die Mitteilung ist
        eine Word-Datei mit den Absätzen oben.
      </>
    ),
  },
  outcome: (
    <p>
      Ein öffentliches Kommandozeilenwerkzeug und seine Claude-Code-Agentendefinitionen unter der MIT-Lizenz, mit
      Unit-Tests und Continuous Integration.
    </p>
  ),
  limits: [
    [
      'mechanical',
      <>
        Die Prüfungen sind mechanisch. Die Verify-Prüfung lässt eine Zahl durch, wenn sie irgendwo in der Faktenbasis
        vorkommt, sodass auch eine richtige Zahl an der falschen Behauptung durchgeht, und sie überspringt Daten und
        Jahreszahlen. Wortwahl und Geltungsbereich zu beurteilen bleibt dem Prüfer-Agenten und dem Orchestrator
        überlassen.
      </>,
    ],
    [
      'source',
      <>Ein bestandener Lauf zeigt nur, dass das Dokument mit der Faktenbasis übereinstimmt, nicht dass die Faktenbasis wahr ist.</>,
    ],
    ['users', <>Noch keine Nutzer; diese Seite zeigt, was es tut und wie es geprüft wird.</>],
    [
      'format',
      <>
        Die Werkzeuge lesen und schreiben Word-Dateien in ihrer eigenen Struktur; ein anderswo erstelltes Dokument
        funktioniert, wenn es dieser Struktur folgt, und die Bearbeitungsbefehle erwarten sie.
      </>,
    ],
    [
      'models',
      <>
        Es wurde mit Claude-Modellen getestet. Andere Assistenten werden vom Entwurf her unterstützt, über einen
        Klartext-Prompt und eine JSON-Antwort, aber nicht getestet.
      </>,
    ],
  ],
  links: { repo: 'Das Docproof-Repository', work: 'Alle meine Projekte' },
  close: 'Ich baue KI-Werkzeuge, bei denen Code, nicht das Modell, das letzte Wort über Fakten hat.',
};
