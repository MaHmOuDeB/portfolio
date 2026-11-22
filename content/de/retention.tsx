import 'server-only';
import { KIT_TEXT_DE } from './kit';
import { FRAME_DE } from './frame';
import { kitSlice, type CohortText, type ReturnsText } from '@/lib/retention/text';
import { slot } from '@/lib/retention/sentence';
import { formatValue } from '@/lib/facts/format';
import type { SourcedTablesText } from '@/lib/retention/tables';
import type { RetentionCopy } from '../retention';

// The Retention case study in German: formal "Sie", facts in the first person, one German sentence per
// English sentence, typed by RetentionCopy so a missing key fails the typecheck. Numbers are never typed:
// they arrive as slots (a Fact or a Derived in German). The win-back was "dimensioniert", never designed
// or run; the data is a public dataset, rebuilt in 2026. The segment names are the export's own and stay
// as printed ("Champions" is explained where it is first used).
const kit = kitSlice(KIT_TEXT_DE);
const RS = ['source:retention'] as const;

const RETURNS_DE: ReturnsText = {
  kit,
  title: 'Das Entfernen rückabgewickelter Bestellungen verändert das Bild der Retouren',
  mode: { legend: 'Rückabgewickelte Bestellungen', raw: 'Als Retouren gezählt', clean: 'Entfernt' },
  chartName: {
    raw: 'Retourenwert je Monat, rückabgewickelte Bestellungen als Retouren gezählt: eine Spitze im zweiten Januar und ein hoher, unvollständiger letzter Monat',
    clean: 'Retourenwert je Monat, rückabgewickelte Bestellungen entfernt: keine Spitze im zweiten Januar und ein kleiner, unvollständiger letzter Monat',
  },
  partial: 'Unvollständiger Monat',
  axis: { x: 'Monat', y: 'Retourenwert (GBP)' },
  period: { to: 'bis', versus: 'gegenüber' },
  lead: {
    raw: [
      'Werden Bestellungen, die innerhalb von ',
      slot('hours'),
      ' Stunden storniert wurden, als Retouren gezählt, sieht es so aus, als wäre der Retourenwert um ',
      slot('growth'),
      ' gestiegen, ',
      slot('period'),
      '. ',
      slot('reversal'),
    ],
    clean: [
      'Werden Bestellungen entfernt, die innerhalb von ',
      slot('hours'),
      ' Stunden storniert wurden, ist der Retourenwert um etwa ',
      slot('growth'),
      ' gestiegen, ',
      slot('period'),
      '. ',
      slot('reversal'),
    ],
  },
  reversal: {
    raw: [
      'Werden diese Bestellungen entfernt, sinkt das Wachstum',
      ': Der Unterschied geht größtenteils auf eine einzige Bestellung über ',
      slot('january'),
      ' zurück, die am ',
      slot('date'),
      ' aufgegeben und storniert wurde.',
    ],
    clean: [
      'Werden diese Bestellungen als Retouren gezählt, sieht das Wachstum größer aus',
      ': Der Unterschied geht größtenteils auf eine einzige Bestellung über ',
      slot('january'),
      ' zurück, die am ',
      slot('date'),
      ' aufgegeben und storniert wurde.',
    ],
  },
  caption: [
    'Retourenwert je Monat in Pfund, aus einem öffentlichen Datensatz der Bestellungen eines britischen Online-Geschenkhändlers. Die Rückabwicklungsregel entfernt eine Stornierung zusammen mit der Bestellzeile, die sie rückgängig macht: derselbe Kunde, dasselbe Produkt und dieselbe Menge, bis zu ',
    slot('hours'),
    ' Stunden vor ihr bestellt. Die Daten enden früh im letzten Monat, daher ist dieser Balken ein unvollständiger Monat, als Umriss gezeichnet und nicht mit den vollen Monaten verglichen. Das Wachstum bezieht sich hier auf den Retourenwert, nicht auf Retouren als Anteil an den Verkäufen.',
  ],
  table: {
    columns: ['Monat', 'Retourenwert (GBP)', 'Unvollständiger Monat'],
    yes: 'Ja',
    no: 'Nein',
    note: {
      raw: 'Ohne die Rückabwicklungsregel: Eine Stornierung, die eine Bestellung rückgängig macht, zählt als zurückgegebene Bestellung. Der letzte Monat ist unvollständig: Die Daten enden früh im Dezember.',
      clean:
        'Mit der Rückabwicklungsregel: Eine Bestellung und die Stornierung, die sie rückgängig macht, werden beide entfernt. Der letzte Monat ist unvollständig: Die Daten enden früh im Dezember.',
    },
  },
};

const COHORTS_DE: CohortText = {
  kit,
  title: 'Wiederholte Bestellungen unterscheiden sich nach Kohorte und Monat',
  picked: 'Kohorte: ',
  nav: 'Kohorte',
  selected: 'Ausgewählt',
  axis: {
    x: 'Monate nach der ersten Bestellung',
    heat: 'Kohorte, nach Monat der ersten Bestellung',
    line: 'In diesem Monat erneut bestellt (%)',
  },
  annotation: 'Kohorte {name}',
  aria: {
    heat: 'Anteil jeder Kohorte, nach Monat der ersten Bestellung von {span}, der in jedem Monat danach erneut bestellt hat, als schattierte Zellen mit ihren Werten; die Kohorte {month} ist umrandet',
    line: 'Anteil der Kohorte {month}, der erneut bestellt hat, Monat für Monat in den zwölf Monaten nach der ersten Bestellung',
  },
  span: { to: 'bis' },
  result: [
    'Im Monat nach ihrer ersten Bestellung haben ',
    slot('share1'),
    ' der Kohorte ',
    slot('name'),
    ' (',
    slot('size'),
    ' Kunden) erneut bestellt; im zwölften Monat danach waren es ',
    slot('share12'),
    '.',
  ],
  caption: [
    'Kunden eines britischen Online-Geschenkhändlers aus einem öffentlichen Datensatz, gruppiert nach dem Monat ihrer ersten Bestellung in den Daten, ',
    slot('span'),
    '. Jeder spätere Monat zeigt den Anteil einer Kohorte, der in diesem späteren Monat erneut bestellt hat, sodass ein Anteil wieder steigen kann: Es ist nicht der Anteil, der seitdem jeden Monat weiter bestellt. Monat null, die erste Bestellung selbst, umfasst per Definition jedes Mitglied und steht deshalb nur in der Tabelle. Auf einem breiten Bildschirm ist jede Zeile eine Kohorte, dunklere Zellen zeigen größere Anteile und die gewählte Kohorte ist umrandet; auf einem schmalen ist die gewählte Kohorte eine Linie.',
  ],
  table: {
    columns: ['Kohorte', 'Kunden', 'Monat der ersten Bestellung'],
    months: ['eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'].map((w) => `Monat ${w}`),
    note: 'Kunden werden nach dem Monat ihrer ersten Bestellung in den Daten gruppiert. Jeder spätere Monat zählt die Mitglieder der Kohorte, die in diesem Monat bestellt haben, sodass ein Anteil wieder steigen kann; es ist nicht der Anteil, der seitdem jeden Monat weiter gekauft hat.',
  },
};

const MODEL_NAMES: Readonly<Record<string, string>> = {
  'Baseline: most recent buyer first': 'Ausgangsregel: zuletzt aktive Käufer zuerst',
  'Logistic regression': 'Logistische Regression',
  'Gradient boosting': 'Gradient Boosting',
};

/** The label of an export holdout group; the share in "top 20% ..." is read from the key, never typed. */
function holdoutGroup(group: string): string {
  if (group === 'all lapsed customers') return 'Alle abgewanderten Kunden';
  const top = /^top (\d+)% of lapsed by score$/.exec(group);
  if (top) return `Die obersten ${formatValue(Number(top[1]) / 100, 'share', { locale: 'de' })} der abgewanderten Kunden nach Score`;
  throw new Error(`retention: no German label for the holdout group ${JSON.stringify(group)}`);
}

const TABLES_DE: SourcedTablesText = {
  rfm: {
    columns: ['Segment', 'Kunden', 'Anteil der Kunden', 'Anteil der Ausgaben'],
    note: 'Kunden zum Stichtag im September der Analyse; Ausgaben ist alles, was sie bis dahin gekauft haben.',
  },
  models: {
    columns: ['Modell', 'ROC AUC, alle Kunden', 'ROC AUC, nur abgewanderte Kunden'],
    note: 'Wie gut jedes Modell die Kunden ordnet, die innerhalb des Zeitfensters erneut bestellt haben, bewertet auf einem späteren Zeitraum als dem, aus dem es gelernt hat. Genauigkeit der Rangfolge, keine Reaktion auf ein Angebot.',
    name: (model) => {
      const name = MODEL_NAMES[model];
      if (!name) throw new Error(`retention: no German name for the model ${JSON.stringify(model)}`);
      return name;
    },
  },
  targeting: {
    columns: ['Ausgewählter Anteil', 'Ausgewählte Kunden', 'Erneut bestellt im Zeitfenster', 'Erwartet erneut bestellt, zufällige Auswahl'],
    note: 'Abgewanderte Kunden mit den höchsten Modell-Scores, nur auf dem Papier ausgewählt. Das sind beobachtete Bestellungen, nicht die Wirkung eines Angebots.',
  },
  holdout: {
    columns: ['Dimensioniert für', 'Erneut bestellt', 'Anstieg (Prozentpunkte)', 'Kunden je Gruppe'],
    note: 'Erneut bestellt ist der Anteil, der innerhalb des Zeitfensters erneut bestellt hat, und der Anstieg ist in Prozentpunkten. Nur eine Stichprobenberechnung. Wo die je Gruppe benötigten Kunden die Kunden dieser Gruppe übersteigen, bräuchte der Test abgewanderte Kunden aus mehr als einem Zeitraum.',
    group: holdoutGroup,
  },
};

export const RETENTION_DE: RetentionCopy = {
  title: 'Wer erneut bestellt,',
  quiet: 'und wie sich ein Rück­gewinnungs­angebot testen lässt.',
  chip: 'Fallstudie',
  github: 'Code auf GitHub ansehen',
  sections: {
    'returns-cleaning': { title: 'Eine Doppelzählung ließ das Wachstum der Retouren größer aussehen', link: 'Retouren' },
    'cohort-retention': { title: 'Wer erneut bestellt, Monat für Monat', link: 'Kohorten' },
    'repeat-order-model': { title: 'Ein Modell dafür, wer erneut bestellt', link: 'Modell' },
    'win-back-sizing': { title: 'Einen Rück­gewinnungs­test dimensionieren', link: 'Dimensionierung' },
    'how-i-checked-this': { title: 'Wie ich vorgegangen bin und geprüft habe', link: 'Wie ich geprüft habe' },
    limits: { title: 'Grenzen', link: 'Grenzen' },
    sources: { title: 'Quellen und Links', link: 'Quellen' },
  },
  summaries: {
    reversal: 'Wie die Rückabwicklungsregel funktioniert',
    cohorts: 'Wie die Kohorten gebildet werden',
    model: 'Wie das Modell trainiert und bewertet wird',
    sizing: 'Wie der Test dimensioniert wird',
    data: 'Die Daten',
    method: 'Methode',
    segments: 'Kundensegmente',
    sql: 'Die Rückabwicklungsregel in SQL',
    checked: 'Wie ich geprüft habe',
  },

  glanceLabels: {
    region: 'Auf einen Blick',
    points: 'Kennzahlen',
    when: 'Zeitraum',
    role: 'Rolle',
    methods: 'Methoden',
    tools: 'Werkzeuge',
    scope: 'Umfang',
  },
  glance: (p) => ({
    points: [
      {
        id: 'returns-raw',
        figure: p.fact('retail.returns.yoy_growth_raw'),
        label: 'Wachstum der Retouren, wie es eine Doppelzählung zuerst zeigte',
      },
      {
        id: 'returns-clean',
        figure: (
          <>
            <span data-proof-unit="">etwa </span>
            {p.fact('retail.returns.yoy_growth_clean')}
          </>
        ),
        label: 'das tatsächliche Wachstum, nach Entfernen der Doppelzählung',
      },
      {
        id: 'per-group',
        figure: p.fact('retention.winback.n_per_arm'),
        label: 'Kunden je Gruppe für einen fairen Test eines Rückgewinnungsangebots',
      },
    ],
    outcome: (
      <>
        Ein Modell sagt voraus, wer erneut bestellt, nur etwas besser als die Regel, die die zuletzt aktiven Käufer zuerst
        nimmt; der nächste Schritt ist deshalb ein Test mit einer Holdout-Gruppe und keine Kampagne an die Kunden mit den
        höchsten Scores.
      </>
    ),
    role: 'Persönliche Projekte, aus meinen Masterprojekten neu aufgebaut.',
    methods: 'Kohorten, Kundensegmente, ein auf einem späteren Zeitraum bewertetes Modell, Stichprobenberechnung.',
    tools: 'SQL (DuckDB), scikit-learn, pytest, GitHub Actions; Chart.js für das KPI-Dashboard.',
    when: 'Neu aufgebaut 2026, Daten von 2009 bis 2011.',
    scope: (
      <>
        Öffentlicher Datensatz, 2026 aus meinen Masterprojekten neu aufgebaut. Eine Vorhersage und eine Stichprobengröße:
        Niemand wurde angesprochen, und es lief kein Test.
      </>
    ),
  }),

  intro: () => (
    <>
      Ein Händler möchte Kunden zurückgewinnen, die nicht mehr bestellen. Bevor er Geld für Angebote ausgibt, muss er zwei
      Dinge wissen: Stimmen seine Zahlen, und wer wäre ohnehin zurückgekommen? Beides habe ich an zwei Jahren öffentlicher
      Bestelldaten eines britischen Geschenkhändlers durchgearbeitet, 2026 aus meinen Masterprojekten neu aufgebaut.
    </>
  ),

  data: (p) => (
    <>
      Die Daten sind UCI Online Retail II, Bestellungen eines britischen Online-Geschenkhändlers vom{' '}
      {p.fact('retention.data.first_date')} bis zum {p.fact('retention.data.last_date')}:{' '}
      {p.fact('retention.data.raw_rows')} Rechnungszeilen. Die Bereinigung hält Stornierungen als Retouren getrennt und
      entfernt Zeilen ohne Kunden, Zeilen, die keine Produkte sind (etwa Porto), und Zeilen ohne positive Menge oder
      positiven Preis. Nach der Bereinigung und der Rückabwicklungsregel unten bleiben{' '}
      {p.fact('retention.data.clean_rows')} Verkaufszeilen in {p.fact('retention.data.orders')} Bestellungen von{' '}
      {p.fact('retention.data.customers')} Kunden.
    </>
  ),

  methodSteps: {
    lead: 'Ich bin in fünf Schritten vorgegangen; die meisten haben einen eigenen Zeitraum und eine eigene Gruppe von Kunden:',
    steps: [
      (p) => (
        <>
          Die Rechnungszeilen mit SQL in DuckDB bereinigen und Bestellungen entfernen, die innerhalb von {p.hours} Stunden
          storniert wurden.
        </>
      ),
      () => (
        <>
          Kunden nach dem Monat ihrer ersten Bestellung gruppieren und für jeden späteren Monat den Anteil zählen, der in
          ihm bestellt hat.
        </>
      ),
      () => (
        <>
          Jeden Kunden zu einem Stichtag nach Recency, Häufigkeit und Ausgaben bewerten und aus den Scores Segmente
          benennen.
        </>
      ),
      () => (
        <>
          scikit-learn-Modelle auf einem früheren Stichtag trainieren und auf einem späteren gegen eine einfache Regel
          bewerten.
        </>
      ),
      () => <>Einen Holdout-Test eines Rückgewinnungsangebots für abgewanderte Kunden dimensionieren.</>,
    ],
    after:
      'Jedes Diagramm unten hat seine Zahlen in einer Tabelle darunter und ein Etikett, das sagt, woher seine Daten stammen. Die interaktiven speichern ihre Einstellung in der Seitenadresse, sodass ein Link dieselbe Ansicht öffnet.',
  },

  cleaning: [
    (p) => (
      <>
        Das Entfernen von Bestellungen, die innerhalb von {p.hours} Stunden storniert wurden, verändert das Bild der
        Retouren: Der Retourenwert wuchs von Januar bis November 2011 um etwa {p.fact('retail.returns.yoy_growth_clean')},
        nicht um {p.fact('retail.returns.yoy_growth_raw')}.
      </>
    ),
    (p) => (
      <>
        Eine Stornierung, die zu einer Bestellzeile desselben Kunden für dasselbe Produkt und dieselbe Menge passt und bis
        zu {p.hours} Stunden vor ihr aufgegeben wurde, kennzeichnet eine Bestellung, die nie stattgefunden hat; deshalb
        entferne ich beide Zeilen. Diese Regel nimmt Bestellungen heraus, die innerhalb von {p.hours} Stunden storniert
        wurden, etwa {p.fact('retention.data.reversed_revenue_gbp')} an Verkäufen. Ohne sie zählt dieselbe Bestellung
        einmal als Verkauf und noch einmal als Retoure.
      </>
    ),
    (p) => (
      <>
        Das Wachstum der Retouren vergleicht Januar bis November 2011 mit denselben Monaten 2010, weil die Daten am{' '}
        {p.fact('retention.data.last_date')} enden. Der Unterschied zwischen den beiden Wachstumswerten geht größtenteils
        auf eine einzige Bestellung über {p.fact('retail.reversal.january_gbp')} zurück, aufgegeben am{' '}
        {p.num(p.d.januaryDate, 'date', ['source:retail'])} und innerhalb von {p.hours} Stunden storniert. Wachstum ist
        nicht dasselbe wie Retouren als Anteil an den Verkäufen: Mit der Regel lagen die Retouren von Januar bis November
        2010 bei {p.fact('retail.returns.rate_2010_clean')} der Verkäufe und 2011 bei{' '}
        {p.fact('retail.returns.rate_2011_clean')}; ohne sie bei {p.fact('retail.returns.rate_2010_raw')} und{' '}
        {p.fact('retail.returns.rate_2011_raw')}.
      </>
    ),
  ],

  cohorts: (p) => (
    <>
      Kunden werden nach dem Monat ihrer ersten Bestellung in den Daten gruppiert. Ich verwende die Kohorten von Januar bis
      November 2010: Dezember 2009 ist der erste Monat der Daten und enthält daher Kunden, die schon vorher gekauft haben,
      und Dezember 2010 würde im unvollständigen Dezember 2011 enden. Ein späterer Monat zählt die Mitglieder der Kohorte,
      die in diesem Monat bestellt haben, sodass ein Anteil wieder steigen kann. Gewichtet nach Kohortengröße bestellen
      etwa {p.fact('retention.cohort.month1_rate')} im Monat nach ihrer ersten Bestellung erneut und etwa{' '}
      {p.fact('retention.cohort.month12_rate')} im zwölften Monat danach.
    </>
  ),

  segments: (p) => (
    <>
      Zum Stichtag im September 2011 bewerte ich jeden Kunden nach dem Rang bei Recency (Zeit seit dem letzten Kauf),
      Häufigkeit und Ausgaben. Champions (die besten Kunden) erreichen {p.num(p.d.championsMin, 'count', RS)} oder{' '}
      {p.num(p.d.topScore, 'count', RS)} von {p.num(p.d.topScore, 'count', RS)} Punkten bei Recency, Häufigkeit und
      Ausgaben (grob die obersten zwei Fünftel bei jedem). Sie machen {p.fact('retention.rfm.champions_customer_share')}{' '}
      der Kunden aus und halten {p.fact('retention.rfm.champions_revenue_share')} der Ausgaben bis zum Stichtag.
    </>
  ),

  model: (p) => (
    <>
      Für das Modell nutzen die Merkmale jedes Kunden nur Bestellungen bis zu einem Stichtag, und das Label sagt, ob er
      innerhalb von {p.days} Tagen danach erneut bestellt hat. Logistische Regression und Gradient Boosting lernen auf
      einem früheren Stichtag, dessen Fenster vor dem späteren schließt, und werden auf dem Stichtag im September 2011
      gegen eine Regel bewertet, die die zuletzt aktiven Käufer zuerst nimmt. In diesem Fenster haben{' '}
      {p.fact('retention.model.test_base_rate')} der Kunden erneut bestellt.
    </>
  ),

  winBack: (p) => (
    <>
      Abgewanderte Kunden sind die ohne Bestellung in den {p.days} Tagen vor dem Stichtag im September 2011:{' '}
      {p.fact('retention.winback.lapsed_customers')} von ihnen, und {p.fact('retention.winback.baseline_rate')} von ihnen
      haben innerhalb von {p.days} Tagen erneut bestellt. Ich habe einen möglichen Holdout-Test dimensioniert. Mit einer
      üblichen Stichprobenberechnung für zwei Gruppen (
      <>
        zweiseitig, auf dem Signifikanzniveau {p.num(p.d.alpha, 'share', RS)} und mit einer Teststärke von{' '}
        {p.num(p.d.power, 'share', RS)}
      </>
      ) braucht der Nachweis eines Anstiegs von {p.fact('retention.winback.baseline_rate')} auf {p.target}, also um{' '}
      {p.fact('retention.winback.uplift_pp')} Prozentpunkte, {p.fact('retention.winback.n_per_arm')} abgewanderte Kunden
      in jeder Gruppe.
    </>
  ),

  winBackReach: (p) => (
    <>
      Zwei Gruppen dieser Größe sind {p.num(2 * p.d.perGroup, 'count', ['retention.winback.n_per_arm'])} Kunden, und{' '}
      {p.fact('retention.winback.lapsed_customers')} Kunden waren zum Stichtag abgewandert, also reicht ein Zeitraum dafür
      aus. Das ist Arithmetik darüber, wie viele Kunden es gibt, kein Beleg dafür, dass ein Angebot wirken würde. Ein Test
      nur mit den obersten {p.num(p.d.topShare, 'share', RS)} der abgewanderten Kunden nach Score würde nicht passen: Bei
      ihrer Rate des erneuten Bestellens von {p.num(p.d.topSized.baseline_rate, 'share', RS)} braucht derselbe Anstieg{' '}
      {p.num(p.d.topSized.customers_per_arm, 'count', RS)} Kunden je Gruppe, insgesamt{' '}
      {p.num(2 * p.d.topSized.customers_per_arm, 'count', RS)}, und diese Gruppe umfasst{' '}
      {p.fact('retention.winback.top20_customers')}.
    </>
  ),

  targeting: (p) => (
    <>
      Die Rangfolge findet tatsächlich Menschen, die erneut bestellen: Von den obersten{' '}
      {p.num(p.d.firstTarget.contact_share, 'share', RS)} der abgewanderten Kunden nach Score, das sind{' '}
      {p.num(p.d.firstTarget.contacted, 'count', RS)} Kunden, haben {p.num(p.d.firstTarget.returners_model, 'count', RS)}{' '}
      innerhalb von {p.days} Tagen erneut bestellt, gegenüber etwa{' '}
      {p.num(p.d.firstTarget.returners_random, 'count', RS)} bei einer zufälligen Auswahl gleicher Größe. Das sind spätere
      Bestellungen von Kunden, die niemand angesprochen hat. Sie zeigen, dass der Score gut ordnet, nicht, dass ein Angebot
      etwas bewirken würde; dafür ist der Holdout-Test da.
    </>
  ),

  labLink: 'Andere Ausgangsraten und Anstiege im Stichprobenrechner des Labs ausprobieren',
  titles: {
    targeting: 'Abgewanderte Kunden nach Score geordnet: wer erneut bestellt hat, gegenüber einer zufälligen Auswahl',
    holdout: 'Benötigte Kunden je Gruppe eines Holdout-Tests',
  },

  sql: {
    intro: 'Die Rückabwicklungsregel, wie das Bereinigungs-SQL sie schreibt, in beiden Repositories an den verlinkten Commits gleich:',
    ariaLabel: 'Die Rückabwicklungsregel in SQL',
    after:
      'Eine Stornierung wird mit der Bestellzeile verknüpft, die sie rückgängig macht: derselbe Kunde, dasselbe Produkt, dieselbe Menge, höchstens einen Tag davor aufgegeben. Die Tabellen für Verkäufe und Retouren lassen dann beide Zeilen weg.',
    link: (commit) => <>Das vollständige Bereinigungs-SQL am Commit {commit}</>,
  },

  checks: [
    [
      'repositories',
      () => (
        <>
          Das SQL, die Modelle und die Exporte liegen in öffentlichen Repositories mit Tests, Lint und CI; die Quellen unten
          verlinken die genauen Commits, die diese Seite liest.
        </>
      ),
    ],
    [
      'pinned',
      () => (
        <>
          Jeder Export ist über Commit und über einen Hash seines Inhalts festgelegt, und der Build dieser Website bricht
          ab, wenn eine eingebundene Kopie nicht dazu passt.
        </>
      ),
    ],
    [
      'schema',
      () => (
        <>
          Der Build prüft außerdem jeden eingebundenen Export gegen sein Schema, sodass ein fehlendes oder umbenanntes Feld
          den Build stoppt, statt eine falsche Zahl auszugeben.
        </>
      ),
    ],
    [
      'export-tests',
      () => (
        <>
          Das Analyse-Repository testet seinen Export gegen seine eigenen Ergebnisse: Die Fakten müssen den
          Analyseergebnissen entsprechen, aus denen sie stammen, und die Kohortentabelle muss die gewichteten Raten für
          Monat eins und Monat zwölf reproduzieren. Ein weiterer Test baut den Export aus dem heruntergeladenen Datensatz
          neu und erwartet dieselben Bytes; er braucht den Datensatz, deshalb überspringt ihn die CI.
        </>
      ),
    ],
    [
      'printed',
      () => (
        <>
          Jede Zahl auf dieser Seite ist mit ihrer Herkunft gekennzeichnet: einer dieser Exporte, der Quellcode an den
          verlinkten Commits oder eine Berechnung. Eine Prüfung der gebauten Seite schlägt bei jeder nicht gekennzeichneten
          Zahl fehl, außer bei einer Jahreszahl.
        </>
      ),
    ],
    [
      'period',
      () => (
        <>
          Der Vergleich der Retouren verwendet in beiden Jahren dieselben Monate, Januar bis November, weil Dezember 2011
          unvollständig ist.
        </>
      ),
    ],
    [
      'out-of-time',
      () => (
        <>
          Die Modelle werden auf einem späteren Stichtag bewertet, als sie gelernt haben, sodass keine Bestellung aus dem
          Testfenster im Training verwendet wurde.
        </>
      ),
    ],
    [
      'interval',
      (p) => (
        <>
          Der Gewinn bei der ROC AUC beträgt {p.fact('retention.model.auc_gain')}, mit einem Intervall von{' '}
          {p.fact('retention.model.auc_gain_low')} bis {p.fact('retention.model.auc_gain_high')} auf dem Niveau{' '}
          {p.num(p.d.intervalLevel, 'share', RS)}, aus einem gepaarten Bootstrap über die Testkunden; es deckt daher nur
          die Schwankung der Teststichprobe ab.
        </>
      ),
    ],
    [
      'sizing',
      (p) => (
        <>
          Der Stichprobencode dieser Website, der gegen Referenzwerte aus scipy und statsmodels getestet ist, ergibt
          dieselben {p.fact('retention.winback.n_per_arm')} je Gruppe wie die Analyse.
        </>
      ),
    ],
  ],

  exhibits: {
    returns: {
      leadIn: () => (
        <>
          Wechseln Sie zwischen dem Zählen stornierter Bestellungen als Retouren und ihrem Entfernen und achten Sie auf
          Januar 2011: Die Achse lässt Platz für die gezählte Spitze, der leere Raum ist also das, was die Doppelzählung
          hinzugefügt hat.
        </>
      ),
      takeaway: (p) => (
        <>
          Eine Bestellung über {p.fact('retail.reversal.january_gbp')}, aufgegeben und innerhalb von {p.hours} Stunden
          storniert, brachte den größten Teil des scheinbaren Wachstums hervor; ein Dashboard hätte daher ein
          Retourenproblem gemeldet, das es nicht gab.
        </>
      ),
    },
    cohorts: {
      leadIn: () => (
        <>
          Eine Kohorte sind Kunden, gruppiert nach dem Monat ihrer ersten Bestellung; lesen Sie jede Zeile von links nach
          rechts, um zu sehen, welcher Anteil von ihnen in jedem späteren Monat erneut bestellt hat.
        </>
      ),
      takeaway: (p) => (
        <>
          Etwa {p.fact('retention.cohort.month1_rate')} der neuen Kunden bestellen im nächsten Monat erneut und etwa{' '}
          {p.fact('retention.cohort.month12_rate')} im zwölften Monat nach ihrer ersten Bestellung.
        </>
      ),
    },
    model: {
      leadIn: () => (
        <>
          Vergleichen Sie das Modell mit der einfachen Regel, die die zuletzt aktiven Käufer zuerst nimmt, und sehen Sie,
          wie nah ihre beiden Scores beieinanderliegen.
        </>
      ),
      takeaway: () => (
        <>
          Das Modell findet Menschen, die ohnehin zurückgekommen wären; eine Kampagne an seine besten Scores sähe deshalb
          nach einem Erfolg aus und würde nichts beweisen.
        </>
      ),
    },
    winBack: {
      leadIn: () => (
        <>
          Ein Holdout sind Kunden, die kein Angebot erhalten, sodass ihr Verhalten zeigt, was ohnehin geschehen wäre; die
          Tabelle zeigt, wie viele Kunden jede Gruppe eines solchen Tests braucht.
        </>
      ),
      takeaway: (p) => (
        <>
          Der nächste Schritt ist ein Test mit {p.fact('retention.winback.n_per_arm')} abgewanderten Kunden je Gruppe gegen
          einen Holdout, keine Kampagne an die Kunden mit den höchsten Scores.
        </>
      ),
    },
  },

  close: () => (
    <>
      Ich prüfe, ob die Zahlen stimmen, bevor ich sie analysiere, und ich behandle eine Vorhersage als Grund für einen Test,
      nicht als Beweis, dass ein Angebot wirkt.
    </>
  ),
  closeLink: 'Andere Ausgangsraten im Lab ausprobieren',

  limits: [
    [
      'observational',
      () => (
        <>
          Das sind historische Beobachtungsdaten eines britischen Geschenkhändlers. Sie zeigen, wer erneut bestellt hat,
          nicht, wie jemand auf ein Rückgewinnungsangebot reagieren würde.
        </>
      ),
    ],
    ['review', () => <>Das überhöhte Wachstum habe nicht ich bemerkt: Eine Prüfung hat es gefunden, und ich habe es behoben.</>],
    [
      'uplift',
      () => (
        <>
          Ein höherer Score bedeutet, dass ein Kunde mit größerer Wahrscheinlichkeit erneut bestellt, nicht, dass er sich
          eher überzeugen lässt: Rang ist keine Wirkung eines Angebots. Nur ein Holdout-Test könnte zeigen, was ein Angebot
          verändert.
        </>
      ),
    ],
    [
      'interval',
      () => (
        <>
          Das Intervall beim Gewinn der AUC deckt nur die Schwankung der Teststichprobe ab. Es deckt nicht ab, dass das
          Modell neu trainiert wird, einen anderen Zeitraum oder eine Änderung in der Zusammensetzung der Kunden.
        </>
      ),
    ],
    [
      'calibration',
      (p) => (
        <>
          Die Scores ordnen Kunden, sind aber keine kalibrierten Wahrscheinlichkeiten: Im Zehntel der Kunden mit den
          niedrigsten Scores sagte das Gradient-Boosting-Modell im Durchschnitt{' '}
          {p.num(p.d.lowest.predicted, 'share', RS, 1)} voraus, und {p.num(p.d.lowest.observed, 'share', RS, 1)} haben
          erneut bestellt.
        </>
      ),
    ],
    [
      'construction',
      () => (
        <>
          Der Anteil der Champions an den Ausgaben ist teilweise konstruktionsbedingt hoch: Ausgaben sind einer der drei
          Scores, die sie definieren.
        </>
      ),
    ],
    [
      'first-order',
      () => (
        <>
          Die Daten beginnen im Dezember 2009, daher ist eine erste Bestellung in den Daten nicht immer die erste Bestellung
          eines Kunden, und Zeilen ohne Kundennummer fehlen in jeder Kundenzahl.
        </>
      ),
    ],
  ],

  sources: {
    retention: (commit) => <>Analyse der Kundenbindung, am Commit {commit}</>,
    retentionSql: 'Bereinigungs-SQL der Analyse der Kundenbindung',
    retentionExport: 'Export der Analyse der Kundenbindung, den diese Seite liest',
    retail: (commit) => <>KPI-Dashboard des Händlers, am Commit {commit}</>,
    retailSql: 'Bereinigungs-SQL des Händler-Dashboards',
    retailExport: 'Retourenexport des Händler-Dashboards',
    data: (name) => <>Die Daten: {name}</>,
    licence: (licence) => <>Ihre Lizenz, {licence}</>,
  },

  neighbours: { prev: { label: 'Audible', kicker: 'Zurück' }, next: { label: 'Pulse', kicker: 'Weiter' } },
  frame: FRAME_DE,
  kit: KIT_TEXT_DE,
  returns: RETURNS_DE,
  cohortsFigure: COHORTS_DE,
  tables: TABLES_DE,

  models: {
    title: 'Das Modell ordnet Wiederkäufer nur geringfügig besser als die Recency-Regel',
    ariaLabel:
      'ROC AUC der Regel „zuletzt aktive Käufer zuerst“ und von Gradient Boosting im späteren Testzeitraum, auf einer Skala von Zufall bis zu einer perfekten Rangfolge: Gradient Boosting liegt nur geringfügig höher',
    axis: { x: 'ROC AUC im späteren Testzeitraum', y: 'Methode der Rangfolge' },
    result: (p) => (
      <>
        Gradient Boosting ordnet mit einer ROC AUC von {p.fact('retention.model.gb_auc')}, gegenüber{' '}
        {p.fact('retention.model.rule_auc')} für die Regel, die die zuletzt aktiven Käufer zuerst nimmt: ein Gewinn von{' '}
        {p.fact('retention.model.auc_gain')}, mit einem Intervall von {p.fact('retention.model.auc_gain_low')} bis{' '}
        {p.fact('retention.model.auc_gain_high')} auf dem Niveau {p.num(p.d.intervalLevel, 'share', RS)}, das nur die
        Schwankung der Teststichprobe abdeckt.
      </>
    ),
    caption: (p) => (
      <>
        Wie gut jede Methode die Kunden eines öffentlichen Datensatzes danach ordnet, ob sie innerhalb von {p.days} Tagen
        nach dem Stichtag im September 2011 erneut bestellt haben. Das Modell hat auf einem früheren Stichtag gelernt, und
        beide wurden auf diesem späteren bewertet. Eine ROC AUC ist die Wahrscheinlichkeit, dass ein Kunde, der erneut
        bestellt hat, über einem eingeordnet wird, der es nicht getan hat: Der untere Rand der Skala entspricht dem Zufall,
        der obere einer perfekten Rangfolge. Das ist Genauigkeit der Rangfolge, keine Reaktion auf ein Angebot: Ein hoher
        Score ist eine Vorhersage, keine Wirkung eines Kontakts. Die Tabelle ergänzt die logistische Regression und die
        Scores nur für abgewanderte Kunden.
      </>
    ),
  },

  rfm: {
    title: 'Champions haben einen größeren Anteil an den Ausgaben als an den Kunden',
    ariaLabel:
      'Anteil der Kunden und Anteil der Ausgaben je Segment, auf einer Skala von keinem bis zu allen: Champions halten einen viel größeren Anteil der Ausgaben als der Kunden, Dormant-Kunden das Gegenteil',
    axis: { x: 'Anteil aller Kunden oder aller Ausgaben', y: 'Segment' },
    series: { customers: 'Kunden', spend: 'Ausgaben' },
    result: (p) => (
      <>
        Champions sind {p.fact('retention.rfm.champions_customer_share')} der Kunden und halten{' '}
        {p.fact('retention.rfm.champions_revenue_share')} der Ausgaben bis zum Stichtag, teilweise konstruktionsbedingt:
        Ausgaben sind einer der drei Scores, die sie definieren.
      </>
    ),
    caption: (p) => (
      <>
        Kunden eines britischen Online-Geschenkhändlers aus einem öffentlichen Datensatz, in Segmenten zum Stichtag im
        September 2011. Jeder Kunde wird nach Rang bei Recency, Häufigkeit und Ausgaben bewertet. Champions erreichen bei
        Recency, Häufigkeit und Ausgaben jeweils {p.num(p.d.championsMin, 'count', RS)} oder{' '}
        {p.num(p.d.topScore, 'count', RS)} von {p.num(p.d.topScore, 'count', RS)} Punkten (grob die obersten zwei Fünftel
        bei jedem), sie sind also nicht einfach die Kunden mit den höchsten Ausgaben. Umrandete Balken sind Anteile der
        Kunden und gefüllte Balken Anteile der Ausgaben, auf derselben Skala. Die Segmentnamen stehen so, wie der Export
        sie schreibt.
      </>
    ),
  },
};
