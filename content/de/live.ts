import 'server-only';
import { seq } from '@/components/kit/text';
import type { LiveCopy } from '../live';

// The Live test page in German, typed by LiveCopy so a missing key fails the typecheck: formal "Sie",
// facts in the first person, one German sentence per English sentence. Numbers are never typed: they
// arrive as arguments. A date that ends a sentence already ends with its dot ("25.10."), so no
// sentence here adds a second one after it. The test runs on the English home page only (a German page
// is never assigned, counted or analysed), so the sentences that say where it runs say so. The words
// match the kit's German (Aufrufe, Aufteilungsprüfung, Kalibrierung, Präregistrierung, schneller Absprung).
const NB = ' ';

export const LIVE_DE: LiveCopy = {
  head: {
    chip: 'Live-Test',
    title: 'Ein echter A/B-Test auf dieser Website,',
    quiet: 'offen durchgeführt.',
    intro:
      'Der Test betrifft die drei ausgewählten Karten auf der englischen Startseite. In Gruppe A nennen ihre Überschriften das Thema, in Gruppe B nennen sie das Ergebnis. Die Frage ist, ob die Überschriften, die das Ergebnis nennen, mehr Klicks bekommen. Ich habe den Plan veröffentlicht, bevor die ersten Daten vorlagen, und diese Seite zeigt jeden Schritt, auch ein Ergebnis, das durchaus lauten kann: zu wenig Daten für eine Aussage.',
  },
  sections: {
    results: 'Ergebnis bisher',
    resultsDecided: 'Ergebnis',
    plan: 'Der Plan, vor dem Start festgelegt',
    health: 'Ist der Test in Ordnung?',
    funnel: 'Wie Aufrufe gezählt werden',
    checkItYourself: 'Selbst nachprüfen',
  },
  nav: { plan: 'Der Plan' },
  keyPoints: {
    tested: {
      title: 'Was getestet wird',
      body: 'Die drei ausgewählten Karten auf der englischen Startseite. Gruppe A: Überschriften, die das Thema nennen. Gruppe B: Überschriften, die das Ergebnis nennen. Mehr unterscheidet sich nicht.',
      calibrationExtra: ' Der Vergleich beginnt nach der Kalibrierung; währenddessen sehen beide Gruppen die Überschriften von Gruppe A.',
    },
    standing: {
      title: 'Wo der Test steht',
      inconclusive:
        'Bei „ohne klares Ergebnis“ gebe ich das endgültige Intervall als den Bereich der Effekte an, die zu den Daten passen, nie als „kein Effekt“.',
      decided: 'Die erste Entscheidung ist endgültig, daher ändern spätere Blicke nichts.',
      notRunning: 'Die Karte oben nennt die Einzelheiten.',
      calibration:
        'Die Kalibrierung ist ein Probelauf: Beide Gruppen sehen dieselben Überschriften, damit sich Zählung und Aufteilung prüfen lassen, bevor der eigentliche Vergleich beginnt.',
      running:
        'Die beiden Gruppen sehen unterschiedliche Überschriften. Die Zählungen auf dieser Seite sind aktuell; Intervall und Urteil ändern sich einmal am Tag.',
      body: (p) => seq(p.status, '. ', p.standing),
    },
    expect: {
      title: 'Was ich erwarte',
      titleDecided: 'Was ich erwartet habe',
      body: (p) =>
        seq(
          'Wahrscheinlich keine klare Antwort. Bei den geplanten ',
          p.cap,
          ' Aufrufen je Gruppe würde nur ein Anstieg von etwa ',
          p.lift,
          ' Prozentpunkten in ',
          p.eight,
          ' von ',
          p.ten,
          ' Fällen gefunden, und das habe ich gesagt, bevor der Test startete.',
        ),
    },
    why: {
      title: 'Warum ich ihn dann durchführe',
      body: 'Weil es mehr zählt, wie ein Test geplant, geprüft und berichtet wird, als ob er gewinnt. Die Ergebnisse hier lassen sich aus den veröffentlichten Daten nachrechnen.',
    },
  },
  result: {
    range: 'der Bereich der Unterschiede zwischen den Gruppen, mit dem die Daten vereinbar sind',
    hollow: (range) => `Das leere Zeichen steht für den Balken: ${range}.`,
    calibrationBar: (range) =>
      `Der Balken ist ${range}. In der Kalibrierung sehen beide Gruppen dieselbe Seite, daher sollte der Balken die Null einschließen.`,
    bar: (range, open) =>
      `Der Balken ist ${range}. Liegt er ganz auf der Seite „B höher“, liegt B vorn; über null hinweg gibt es ${open ? 'noch ' : ''}keine klare Antwort.`,
    collecting: (target) =>
      seq('Es wird kein Schätzwert gezeichnet, bevor jede Gruppe ', target, ' Aufrufe hat. Diese Schwelle wurde vor dem Start festgelegt.'),
  },
  plan: {
    meaning:
      'Präregistriert heißt: Das Design, die Zahlen, mit denen ich plane, und die Entscheidungsregel wurden festgelegt und veröffentlicht, bevor ein Besucher gezählt wurde, sodass sie sich nach einem Blick auf die Ergebnisse nicht unbemerkt ändern lassen.',
    fixes:
      'Die Präregistrierung legt das Design, die Zahlen, mit denen ich plane, die Entscheidungsregel und mein Vorgehen bei jedem Ausgang fest. Ihre Hypothese: „Ausgewählte Fallstudien-Karten, die das Ergebnis nennen, bekommen mehr Klicks als Karten, die das Thema nennen.“',
    planning: (p) =>
      seq(
        'Ich habe den Test auf ',
        p.cap,
        ' Aufrufe je Gruppe geplant. Bei dieser Größe beträgt der kleinste Anstieg, den er in ',
        p.eight,
        ' von ',
        p.ten,
        ' Fällen finden würde, etwa ',
        p.lift,
        ' Prozentpunkte. Selbst ein Anstieg von ',
        p.small,
        ' Punkten würde nur in etwa ',
        p.one,
        ' von ',
        p.twenty,
        ' Fällen gefunden. Ohne klares Ergebnis ist der wahrscheinliche, ehrliche Ausgang.',
      ),
    guardrail: (p) =>
      seq(
        'Dazu kommt eine Guardrail-Metrik, eine zweite Kennzahl, die nicht schlechter werden darf: schnelle Absprünge. Ein schneller Absprung ist ein Aufruf, dessen Besucher die Seite innerhalb von ',
        p.secs,
        ' Sekunden ohne Interaktion verlässt. Um B auszurollen, müssen die Daten einen Anstieg der schnellen Absprünge um ',
        p.margin,
        ' Prozentpunkte oder mehr ausschließen. Um das zu zeigen, bräuchten selbst zwei identische Gruppen etwa ',
        p.low,
        ' bis ',
        p.high,
        ' Einstiegsaufrufe (neue Besucher auf der Startseite) je Gruppe. Das ist ein Planungswert, kein Ziel.',
      ),
    views: 'Der Test zählt Aufrufe, nicht Personen: Eine Person kann mehrfach zählen, auch in beiden Gruppen.',
    short: (p) => seq('Präregistrierung ', p.version, ', Design-Hash ', p.hash, '.'),
    readLink: 'Die Präregistrierung unter ihrem Tag lesen',
    recordSummary: 'Eintrag der Präregistrierung',
    record: (p) => seq('Präregistrierung ', p.version, ', Tag ', p.tag, ', Design-Hash ', p.hash, '.'),
    build: (p) => seq('Diese Seite wurde aus dem Commit ', p.commit, ' gebaut.'),
  },
  health: {
    splitTitle: 'Haben beide Gruppen einen fairen Anteil bekommen?',
    detectableTitle: 'Wie kleine Unterschiede dieser Test erkennen kann',
    split: {
      lead: (p) =>
        seq(
          'Die Aufteilungsprüfung fragt, ob die beiden Gruppen den Anteil an Aufrufen bekommen haben, den der Zufall ihnen geben würde (Abweichung vom geplanten Verhältnis, SRM). Schlägt sie fehl, liegt die Aufteilung weiter von gleichmäßig entfernt, als der Zufall plausibel erklären würde; dann könnte etwas Aufrufe zwischen den Gruppen verschoben haben, und es wird kein Ergebnis gezeigt. Weil an jedem abgeschlossenen Tag geprüft wird, liegt die Chance auf eine falsche Markierung über den gesamten Lauf bei etwa ',
          p.one,
          `${NB}% bis `,
          p.three,
          `${NB}%.`,
        ),
      noData: 'Es wird keine Aufteilungsprüfung gezeigt: Diese Seite hat keine Daten.',
      heldFailed: 'Die Aufteilungsprüfung ist ebenfalls fehlgeschlagen, wie der Hinweis oben auf dieser Seite sagt.',
      heldNotReported: 'Die Aufteilungsprüfung wird nicht gemeldet, nachdem die Konsistenzprüfung fehlgeschlagen ist.',
      entry: (status) => seq('Einstiegsaufrufe: ', status),
      analysed: (status) => seq('Ausgewertete Aufrufe: ', status),
      checks: { passed: 'bestanden', failed: 'nicht bestanden', 'not-evaluated': 'noch nicht geprüft' },
      later: 'Eine spätere Aufteilungsprüfung ist fehlgeschlagen; die festgehaltene Entscheidung bleibt unverändert.',
    },
    detectableLead: (p) =>
      seq(
        'Wie groß muss ein Unterschied sein, damit dieser Test ihn bemerkt? Die Linie zeigt den kleinsten Anstieg, den er bei jeder Zahl von Aufrufen in ',
        p.eight,
        ' von ',
        p.ten,
        ' Fällen erkennen würde.',
      ),
    detectableTakeaway: 'Kleinere echte Unterschiede enden meist ohne klares Ergebnis, und das ist nicht dasselbe wie kein Effekt.',
    detectableSummary: 'So wird die Linie berechnet',
  },
  funnel: {
    lead: 'Nicht jeder Seitenaufruf zählt. Rohsignale von der Startseite werden auf die Aufrufe heruntergefiltert, die die Auswertung nutzt.',
    reasonsSummary: 'Warum Aufrufe nicht gezählt wurden',
  },
  decision: {
    none: { ahead: 'Noch keine Entscheidung.', shown: 'Es wird keine Entscheidung gezeigt.' },
    decided: (p) => seq('Entscheidung: ', p.word, p.when !== null ? seq(', am ', p.when) : '.'),
    end: (p) =>
      seq(
        p.earliest ? 'Frühestes Ende' : 'Geplantes Ende',
        ': ',
        p.when,
        p.earliest
          ? ' Während der Kalibrierung ist dies das früheste Datum, an dem die Zeitgrenze des A/B-Tests liegen kann; eine Entscheidung kann den Test früher beenden.'
          : null,
      ),
  },
  check: {
    download: 'Die Daten herunterladen (data.json)',
    data: (p) =>
      seq(
        'Die Daten sind aggregierte Tageszählungen, ohne Kennungen. Sie sind nicht anonym: Wer weiß, wann eine Person zu Besuch war, könnte eine Änderung zwischen zwei Tagen mit diesem Besuch verknüpfen. Eine Zählung von ',
        p.one,
        ' bis ',
        p.four,
        ' wird als „',
        p.small,
        '“ gezeigt, hier und in der Datei.',
      ),
    recomputeHost: 'Um die Ergebnisse selbst nachzurechnen, führen Sie dies in einer Kopie des Repositorys aus:',
    recomputeNoHost:
      'Um die Ergebnisse selbst nachzurechnen, speichern Sie die Datei von der Adresse dieser Seite, gefolgt von /data.json, und führen Sie dann dies in einer Kopie des Repositorys aus:',
    commands: 'Befehle',
    scriptSummary: 'Wie das Skript kleine Zählungen behandelt',
    script1:
      'Das Skript nutzt nur die Standardbibliothek von Python und importiert nichts von dieser Website. Es rechnet die Aufteilungsprüfung, beide Intervalle über die täglichen Blicke, die Entscheidung und den nachweisbaren Effekt nach und prüft die Veröffentlichungsregeln. Jede Prüfung stimmt mit dem veröffentlichten Wert auf ein Hundertmillionstel überein, oder das Skript meldet sie als fehlgeschlagen; eine Prüfung, die die veröffentlichten Daten nicht entscheiden können, wird als unbestimmt gemeldet, mit ihrem Grund.',
    script2: (small) =>
      seq(
        'Hängt eine Prüfung von einer Zählung ab, die als „',
        small,
        '“ gezeigt wird, probiert das Skript jeden Wert durch, den die Zelle haben kann. Die Prüfung gilt als bestanden, wenn alle das veröffentlichte Ergebnis liefern, als fehlgeschlagen, wenn keiner es liefert, und sonst als unbestimmt. Das Skript gibt diese Werte nie aus. Seine eigenen Tests lassen es auf gespeicherten Kopien veröffentlichter Daten laufen, die der Code der Website aus bekannten Zählungen erzeugt hat.',
      ),
    fixture: 'Dieser Build hat keinen Speicher, daher sind die Zahlen auf dieser Seite ein Platzhalter und keine Besucher.',
    local: 'Dieser Build liest einen lokalen Testspeicher, daher sind seine Zahlen simuliert und keine Besucher.',
    readScript: 'Das Skript lesen',
  },
  close: {
    lab: 'Dieselben Prüfungen im Lab ausprobieren',
    prereg: 'Die Präregistrierung ansehen',
    body: 'Hier veröffentliche ich den Plan vor den Daten, zeige die Prüfungen neben dem Ergebnis, sage vorab, wann ein Test zu klein ist, um die Frage zu klären, und gebe Ihnen die Daten, mit denen Sie mir das Gegenteil beweisen können.',
  },
  status: {
    title: 'Wo der Test steht',
    stepsLabel: 'Die Schritte des Tests',
    steps: { calibration: 'Kalibrierung', ab: 'A/B-Test', decision: 'Entscheidung' },
    done: 'Erledigt',
    stepWord: { now: 'Jetzt', paused: 'Pausiert', stopped: 'Gestoppt', closed: 'Geschlossen', reached: 'Erreicht' },
    decisionWords: { 'ship-b': 'B ausrollen', 'stop-for-harm': 'Abbruch wegen Schaden', inconclusive: 'Ohne klares Ergebnis an der Grenze' },
    stateWords: {
      'not-started': 'Nicht gestartet',
      'closure-check': 'Gespeichertes Ergebnis wird geprüft',
      unavailable: 'Zählungen nicht geladen',
      'settings-unreadable': 'Zählung ist gestoppt',
      held: 'Wegen eines Datenfehlers gestoppt',
      'srm-suppressed': 'Aufteilungsprüfung nicht bestanden',
      'aa-failed': 'Kalibrierung gestoppt',
      paused: 'Pausiert',
      calibrating: 'Kalibrierung läuft',
      'ab-running': 'A/B-Test läuft',
      'counting-closed': 'Zählung ist abgeschlossen',
      'result-being-confirmed': 'Ergebnis wird bestätigt',
    },
    statusLabel: 'Status',
    progressLabel: 'Fortschritt',
    progressBoth: (p) => seq(p.a, ' und ', p.b),
    progressBothNote: (target) => seq('ausgewertete Aufrufe in Gruppe A und Gruppe B. Beide Gruppen haben ', target, ' Aufrufe erreicht.'),
    progressOf: (p) => seq(p.smaller, ' von ', p.target),
    progressOfNote: (target) => seq('Aufrufe in der kleineren Gruppe. Schätzwerte erscheinen ab ', target, ' Aufrufen je Gruppe.'),
    decidedOn: 'Entschieden am',
    timeLimit: 'Zeitgrenze',
    plannedEnd: 'Geplantes Ende',
    sooner: 'Eine Entscheidung kann den Test früher beenden.',
    read: (p) =>
      seq(
        'Diese Zahlen wurden am ',
        p.date,
        ' um ',
        p.time,
        ' Uhr gelesen. Die Seite liest die Daten höchstens alle zehn Minuten neu, wenn jemand sie öffnet. Schlägt ein Lesevorgang fehl, zeigt sie weiter die zuletzt gelesenen Zahlen, mit dieser Zeit.',
      ),
  },
  state: {
    notStarted: 'Das Experiment hat noch nicht begonnen. Es wird noch nichts gezählt.',
    closureCheck: 'Die Zählung für diesen Lauf ist beendet. Ich prüfe das gespeicherte Ergebnis, bevor ich es zeige.',
    unavailableClosed: 'Die Live-Zählungen konnten nicht geladen werden, und die Zählung ist abgeschlossen.',
    unavailableCountingClosed: 'Die Live-Zählungen konnten nicht geladen werden.',
    unavailable: 'Die Live-Zählungen konnten nicht geladen werden. Sie erscheinen bei der nächsten Aktualisierung.',
    settingsUnreadable: 'Die Zählung ist gestoppt, weil die Experiment-Einstellungen nicht gelesen werden konnten.',
    heldCounts: 'Der Test wurde gestoppt, weil die Zählungen eine Konsistenzprüfung nicht bestanden haben.',
    heldInterval: 'Der Test wurde gestoppt, weil das Intervall eine Konsistenzprüfung nicht bestanden hat.',
    held: (p) =>
      seq(p.reason, ' Die Ergebnisse nutzen nur die Daten bis zur letzten bestandenen Prüfung. Die Prüfung ist am ', p.on, ' fehlgeschlagen.', p.split),
    srm: (split) => seq('Die Aufteilungsprüfung ist fehlgeschlagen, daher wird kein Ergebnis gezeigt.', split),
    aaFailed: (p) => seq('Die Kalibrierung wurde am ', p.on, ' gestoppt: ', p.reason, '.', p.split),
    aaStopped: (split) => seq('Die Kalibrierung wurde gestoppt.', split),
    paused: (p) => seq('Pausiert am ', p.on, ': ', p.reason, '.'),
    pausedPlain: 'Das Experiment auf dieser Website ist pausiert.',
    outcome: {
      'ship-b': 'B ausrollen.',
      'stop-for-harm': 'Abbruch wegen Schaden.',
      inconclusive: 'Ohne klares Ergebnis an der Grenze; das belegt nicht, dass es keinen Effekt gibt.',
    },
    laterSplit: ' Eine spätere Aufteilungsprüfung ist fehlgeschlagen; die festgehaltene Entscheidung bleibt unverändert.',
    closedNoDecision: 'Die Zählung ist abgeschlossen; in diesem Datenstand ist keine Entscheidung festgehalten.',
    beingConfirmed: 'Das Ergebnis wird bestätigt.',
    abStarted: (when) => seq('Der A/B-Test ist am ', when, ' gestartet.'),
    abRunning: 'Der A/B-Test läuft.',
    calibrating: 'Kalibrierung läuft: Beide Gruppen sehen dieselbe Seite.',
    calibratingPassed: (day) =>
      seq('Kalibrierung läuft: Beide Gruppen sehen dieselbe Seite. Die Kalibrierung hat ihre Prüfungen am ', day, ' bestanden.'),
    splitAlso: 'Die Aufteilungsprüfung ist außerdem fehlgeschlagen am',
    splitIt: 'Sie ist fehlgeschlagen am',
    splitLead: (lead) => ` ${lead} `,
    splitFailure: (p) => seq(p.lead, p.day, ', bezogen auf ', p.base, '.'),
    base: { entry: 'Einstiegsaufrufe', analysed: 'ausgewertete Aufrufe', both: 'Einstiegsaufrufe und ausgewertete Aufrufe' },
    viewsAt: {
      entry: (p) => seq(' Einstiegsaufrufe bei dieser Prüfung: ', p.a, ' in Gruppe A und ', p.b, ' in Gruppe B.'),
      analysed: (p) => seq(' Ausgewertete Aufrufe bei dieser Prüfung: ', p.a, ' in Gruppe A und ', p.b, ' in Gruppe B.'),
    },
  },
  next: {
    closed: 'Die Zählung ist beendet; spätere Blicke ändern nichts.',
    confirming:
      'Der Test hat seine Entscheidung erreicht; das Ergebnis wird bestätigt. Die erste Entscheidung ist endgültig, daher ändern spätere Blicke nichts.',
    restart: 'Am {date} startet die Kalibrierung neu.',
    abStart: 'Am {date} startet der A/B-Test.',
  },
  reasons: {
    malformed: 'Die Experiment-Einstellungen konnten nicht gelesen werden, daher ist die Zählung gestoppt, bis ich sie korrigiere',
    'band-conflict': 'Das Intervall hat eine Konsistenzprüfung nicht bestanden, daher wurde der Test beim letzten sauberen Blick gestoppt',
    'inconsistent-counts': 'Die Zählungen haben eine Konsistenzprüfung nicht bestanden, daher wurde der Test beim letzten sauberen Blick gestoppt',
    stoppedForGood: 'Ich habe die Zählung für diesen Lauf gestoppt und prüfe das gespeicherte Ergebnis, bevor ich es zeige',
    noNote: 'Mir liegt die Notiz mit der Begründung nicht mehr vor',
    noteDisagrees: 'Der Tag, den ich für diesen Stopp gespeichert habe, passt nicht zu dem, was ich jetzt sehe, daher prüfe ich ihn',
    notStarted: 'Das Experiment hat noch nicht begonnen, daher wird nichts gezählt',
    unavailable: 'Die Live-Zählungen konnten beim Bau dieser Seite nicht gelesen werden, daher erscheinen sie bei der nächsten Aktualisierung',
    srm: 'Die Aufteilungsprüfung ist fehlgeschlagen',
    'interval-excludes-zero': 'Die beiden identischen Gruppen haben sich unterschieden',
    'data-fault': 'Die Zählungen haben eine Konsistenzprüfung nicht bestanden',
  },
  funnelFigure: {
    notPublished: 'Nicht veröffentlicht',
    noData: 'Keine Daten',
    stages: {
      beacons: 'Empfangene Beacons',
      bot: 'Nach dem Bot-Filter',
      entry: 'Gezählte Einstiegsaufrufe',
      inview: 'Karten im sichtbaren Bereich (ausgewertete Aufrufe)',
    },
    columns: { stage: 'Stufe', a: 'Gruppe A', b: 'Gruppe B' },
    note: 'Aufrufe je Gruppe. Eine Zählung von eins bis vier wird als kleiner als fünf gezeigt.',
    pair: (p) => seq('Gruppe A ', p.a, ', Gruppe B ', p.b),
    title: 'Nur die letzten beiden Stufen werden veröffentlicht',
    caption:
      'Jede Stufe behält, was die vorherige durchgelassen hat. Die ersten beiden Summen werden nicht veröffentlicht, weil eine Summe eine Zählung verraten könnte, die nur als kleiner als fünf gezeigt wird.',
    method:
      'Das Beacon auf der englischen Startseite (ein kleines Signal, das die Seite beim Laden sendet) sendet Ereignisse, und der Server entscheidet, welche davon zählen. Das sind empfangene Beacons, keine Besucher: Eine Person kann viele senden. Von Bots, die nie JavaScript ausführen, oder von Besuchern, deren Browser das Signal Global Privacy Control oder Do Not Track sendet, kommt nichts, daher gehen sie in keine Zählung ein.',
    noCounts: 'Es werden keine Zählungen gezeigt: Diese Seite hat keine Daten.',
    reasons: {
      bot: ['Bekannte Bots', 'Ein Bot als User-Agent oder ein per Automatisierung gesteuerter Browser'],
      internal: ['Automatisierte Test- und Lighthouse-Läufe', 'Anfragen mit dem eigenen Test-Header der Website'],
      self: ['Meine eigenen Geräte', 'Browser, die ich auf der Ausschlussseite ausgenommen habe'],
      forced: ['Erzwungene Demo-Aufrufe', 'Eine in der Adresse angeforderte Gruppe'],
      not_entry: ['Kein Einstiegsaufruf', 'Ein Aufruf, der keine neue Ankunft auf der Startseite ist'],
      rate_limited: ['Über dem Ratenlimit', 'Zu viele Anfragen von einer Netzwerkadresse in einer Minute'],
      ceiling: ['Nach der Tagesgrenze', 'Einstiege nach Erreichen der Tagesgrenze'],
    },
    exclusionsCaption: 'Abgewiesene Einstiege nach Grund',
    exclusionsColumns: ['Grund', 'Einstiege', 'Was das bedeutet'],
    preview: (zero) =>
      seq('Preview-Deployments: ', zero, '. Ein Preview schreibt nie in den Speicher, daher ist dieser Wert immer ', zero, '.'),
    footnote:
      'Jede Zeile zählt Einstiege, die aus einem Grund abgewiesen wurden, mit zwei Ausnahmen: „Über dem Ratenlimit“ zählt höchstens einen je Netzwerkadresse und Minute, und „Nach der Tagesgrenze“ zählt einen für jeden Tag, an dem die Grenze erreicht wurde. Ist ein Tag voll, werden Einstiege, die gezählt worden wären, abgewiesen, ohne unter irgendeinem Grund gezählt zu werden. Die Zeilen sind keine verlorenen Besucher und ergeben keine Summe: Ein Besucher kann unter mehreren Gründen auftauchen, und manche Besuche erreichen den Server gar nicht.',
  },
  detectable: {
    method: 'Sie wird für einen Blick bei n unter der Grenze der Konfidenzsequenz berechnet, nicht als Teststärke der sequenziellen Stoppregel.',
    caption: (p) =>
      seq(
        'Der kleinste Anstieg, den so viele Aufrufe je Gruppe in ',
        p.power,
        ' von ',
        p.ten,
        ' Fällen erkennen würden, unter der Annahme ',
        p.ab ? seq('der Planungs-Klickrate aus der Kalibrierung, ', p.rate) : seq('der Planungs-Klickrate von ', p.rate),
        ', bei einem Blick.',
      ),
    noData: 'Es werden keine Daten gezeigt, daher gibt es keinen Punkt für die aktuelle Größe.',
    atNowCount: (p) =>
      seq('Bei der aktuellen Größe, ', p.count, ' Aufrufe in der kleineren Gruppe, liegt der kleinste nachweisbare Anstieg bei etwa ', p.lift, ' Prozentpunkten.'),
    atNow: (lift) => seq('Bei der aktuellen Größe liegt der kleinste nachweisbare Anstieg bei etwa ', lift, ' Prozentpunkten.'),
    noViews: 'Es sind noch keine Aufrufe gezählt, daher gibt es keinen Punkt für die aktuelle Größe.',
    smallCell: (five) => seq('Solange eine Gruppe weniger als ', five, ' Aufrufe hat, wird der Punkt für die aktuelle Größe nicht gezeigt.'),
    beyond:
      'Bei der aktuellen Größe liegt der nachweisbare Anstieg außerhalb des Bereichs, den diese Berechnung abdeckt, daher wird kein Punkt gezeigt.',
    title: 'Mehr Aufrufe je Gruppe, kleinere nachweisbare Anstiege',
    columns: ['Aufrufe je Gruppe', 'Kleinster nachweisbarer Anstieg (Punkte)'],
    note: 'Prozentpunkte, für einen Blick bei dieser Größe.',
    aria: (marked) =>
      `Der kleinste nachweisbare Anstieg sinkt, wenn die Aufrufe je Gruppe wachsen${marked ? ', die aktuelle Größe ist markiert' : ''}`,
    xLabel: 'Aufrufe je Gruppe',
    yLabel: 'Kleinster nachweisbarer Anstieg (Prozentpunkte)',
  },
  results: {
    caption:
      'B minus A in Prozentpunkten ausgewerteter Aufrufe, unter der Konfidenzsequenz, die gültig bleibt, wie oft man auch nachsieht. Jeder Blick ist ein abgeschlossener Berliner Tag.',
    seriesCaption: 'Ausgewertete Aufrufe je Gruppe bisher',
    seriesColumns: ['Gruppe', 'Ausgewertete Aufrufe'],
    groups: { a: 'A', b: 'B' },
    seriesNote: 'Noch kein Blick wird gezeichnet: die bisher ausgewerteten Aufrufe je Gruppe.',
    columns: ['Aufrufe Gruppe A', 'Aufrufe Gruppe B', 'Unteres Ende', 'Schätzwert', 'Oberes Ende'],
    note: 'Ausgewertete Aufrufe je Gruppe und B minus A in Prozentpunkten, eine Zeile je gezeichnetem Blick.',
    closedConfirmed: 'Die Zählung ist abgeschlossen, ohne dass ein Schätzwert zu zeigen wäre.',
    beingConfirmed: 'Das Ergebnis wird bestätigt, daher wird kein Schätzwert gezeigt.',
    paused: 'Die Zählung ist pausiert, daher wird kein Schätzwert gezeigt.',
    settings: 'Solange die Experiment-Einstellungen nicht gelesen werden können, wird kein Schätzwert gezeigt.',
    held: 'Der Test wurde gestoppt, bevor ein Schätzwert gezeichnet werden konnte, daher wird keiner gezeigt.',
    decision: 'Zu dieser Entscheidung wird kein Intervall gezeigt.',
    reached: (target) => seq('Beide Gruppen haben ', target, ' Aufrufe erreicht; es wird noch kein Schätzwert gezeigt.'),
    progress: (p) => seq('Fortschritt: ', p.smaller, ' von ', p.target, ' in der kleineren Gruppe.'),
    appear: (target) => seq('Schätzwerte erscheinen ab ', target, ' Aufrufen je Gruppe, wie die Präregistrierung es vorsieht.'),
    xLabel: 'Aufrufe je Gruppe',
    yLabel: 'B − A (Prozentpunkte)',
    unavailable: 'Es werden keine Ergebnisse gezeigt: Diese Seite hat keine Daten.',
    srm: 'Solange die Aufteilungsprüfung fehlgeschlagen ist, wird kein Ergebnis gezeigt.',
    aaFailed: 'Die Kalibrierung wurde gestoppt, daher wird kein Ergebnis gezeigt.',
    figureTitle: 'Das Intervall von B minus A, während die Aufrufe wachsen',
    titles: {
      held: 'Das letzte Intervall vor dem Stopp des Tests',
      paused: 'Das letzte Intervall vor der Pause',
      settings: 'Das letzte Intervall, bevor die Einstellungen nicht gelesen werden konnten',
      final: 'Das endgültige Intervall',
      confirming: 'Das neueste Intervall, während das Ergebnis bestätigt wird',
      latest: 'Das neueste Intervall',
      none: 'Noch kein Schätzwert',
      noneShown: 'Es wird kein Schätzwert gezeigt',
    },
    noEstimateCaption: 'Der Unterschied zwischen den Gruppen, B minus A, in Prozentpunkten, mit dem leeren Zeichen anstelle eines Intervalls.',
  },
};
