import 'server-only';
import { EXPERIMENT } from '../../src/experiment.values.ts';
import { CONTACT, CONTACT_HREF, SITE } from '../../src/lib/site.ts';
import { HASH_MINUTES, n, PRIVACY_EN, PV_MINUTES, type PrivacyCopy } from '../privacy.ts';

// The privacy notice in German: a full translation of content/privacy.ts, typed by PrivacyCopy. The
// sections, their order, anchors, numbers, links and the version date are the English ones; a test
// (tests/unit/de/privacy-de.test.tsx) ties the two block for block. Two paragraphs are German only
// (`extra`): that the English version is binding, and that the language choice is stored nowhere.
// Formal "Sie", the owner's statements in the first person. Legal terms: DSGVO for the GDPR, TDDDG
// for the German telecommunications and digital services data protection act, and "Datenschutzrahmen
// EU-USA" for the EU-US Data Privacy Framework, the name the German version of the Commission's
// adequacy decision uses (Durchführungsbeschluss (EU) 2023/1795 vom 10. Juli 2023, EUR-Lex).

/** The controller's city in German, from the site data, never retyped. */
const CITY = SITE.city.replace(/, Germany$/, ', Deutschland');

export const PRIVACY_DE: PrivacyCopy = {
  title: 'Datenschutz',
  quiet: 'was diese Website erfasst und was nicht.',
  chip: 'Datenschutz',
  navLabel: 'Abschnitte',
  placeholder: {
    title: 'Noch nicht bestätigt',
    sentence: '{question}. Ich ergänze diese Angabe hier, bevor das Experiment beginnt.',
    questions: {
      'vercel-request-logs': 'Welche Felder die Anfrageprotokolle von Vercel zu einem Besucher enthalten',
      'vercel-log-retention': 'Wie lange die Laufzeitprotokolle im Vercel-Konto im Hobby-Tarif aufbewahrt werden',
      'vercel-regions': 'Wo die Funktionen und der Proxy laufen',
      'vercel-transfers': 'Der Übermittlungsmechanismus in den Bedingungen zur Auftragsverarbeitung von Vercel',
      'upstash-transfers': 'Der Übermittlungsmechanismus in den Bedingungen zur Auftragsverarbeitung von Upstash und die Region des Speichers',
      'resend-transfers': 'Wer Resend ist, wo es die Nachrichten verarbeitet und der Übermittlungsmechanismus in seinen Bedingungen zur Auftragsverarbeitung',
      'resend-retention': 'Wie lange Resend die zugestellten E-Mails im Free-Tarif aufbewahrt',
      'google-transfers': 'Ob Google angibt, dass Google LLC nach dem Datenschutzrahmen EU-USA zertifiziert ist',
      'google-provider': 'Welches Google-Unternehmen Gmail für Kontoinhaber im EWR bereitstellt',
      'upstash-backups': 'Ob die Zähldatenbank Sicherungen anlegt und wie lange',
    },
  },
  // The same version as the English notice: the translation never has a date of its own.
  updatedOn: PRIVACY_EN.updatedOn,
  sections: [
    {
      heading: 'Wer verantwortlich ist',
      id: 'who-is-responsible',
      paragraphs: [
        ['Verantwortlich für diese Website und für die hier beschriebenen Daten bin ich: ', SITE.name, ', ', CITY, '.'],
        ['Sie erreichen mich über das Kontaktformular auf dieser Website oder über mein LinkedIn-Profil:'],
        [{ link: { href: CONTACT_HREF, text: 'Kontaktformular' } }],
        [{ link: { href: CONTACT.linkedin, text: CONTACT.linkedin.replace(/^https:\/\/www\./, ''), external: true } }],
      ],
    },
    {
      heading: 'Was ein Seitenaufruf sendet',
      id: 'what-a-page-view-sends',
      paragraphs: [
        [
          'Die englische Startseite führt ein kleines Experiment mit ihren Kartenüberschriften durch. Wenn Sie sie öffnen, sendet das Skript der Seite einige kurze Nachrichten an den eigenen Server dieser Website. Jede Nachricht enthält eine zufällige Kennung, die nur für diesen einen Aufruf erzeugt wird, eine Bezeichnung für die Runde des Experiments, die Gruppe, deren Fassung Ihnen gezeigt wurde, und welches der folgenden Ereignisse eingetreten ist: die Seite wurde von außerhalb der Website geöffnet; die Karten kamen in den sichtbaren Bereich; Sie haben mit der Seite interagiert oder sind ',
          n(EXPERIMENT.guardrail.quickExitSeconds),
          ' Sekunden geblieben; Sie haben eine ausgewählte Karte, eine Fallstudie oder das Lab, die Lebenslauf-Seite oder das Lebenslauf-PDF oder einen Kontaktlink (LinkedIn, GitHub oder das Kontaktformular dieser Website) angeklickt.',
        ],
        [
          'Wenn der Aufruf nicht zählen kann, sendet das Skript stattdessen eine einzige Nachricht, die den Grund nennt: ein automatisierter Browser, eine über die Seitenadresse gewählte Gruppe oder kein neuer Besuch von außerhalb der Website.',
        ],
        [
          'Das Skript sendet weder die verweisende Website noch die Adresse eines Links, den Sie anklicken (Ihr Browser sendet mit jeder Anfrage die Seitenadresse und die verweisende Seite, siehe „Ihre IP-Adresse und Ihr Browsertyp“). Was der Server aufbewahrt, sind Zählungen je Tag und je Gruppe. Er speichert keine Seitenadresse, keine verweisende Website, keine IP-Adresse und keinen Browsertyp. Die Kennung des Aufrufs behält er nur, um jeden Aufruf einmal zu zählen, und löscht sie spätestens ',
          PV_MINUTES,
          ' Minuten, nachdem Ihr Browser sie zum ersten Mal gesendet hat, aus der Datenbank.',
        ],
        ['Bevor das Experiment beginnt, speichert der Server nichts aus diesen Nachrichten.'],
      ],
    },
    {
      heading: 'Was das Skript in Ihrem Browser liest',
      id: 'what-the-script-reads-in-your-browser',
      paragraphs: [
        [
          'Um zu entscheiden, ob ein Aufruf zählt, liest das Skript, wie die Seite geöffnet wurde, die eigene Adresse der Seite, die verweisende Seite, ob die Seite und die Karten sichtbar sind, ob der Browser automatisiert ist und ob Ihr Browser Global Privacy Control oder Do Not Track sendet. Um zu erkennen, ob Sie mit der Seite interagiert haben, bemerkt es das Drücken einer Maustaste oder das Aufsetzen eines Fingers, das Scrollen, Tastendrücke und Berührungen. Wenn Sie einen Link anklicken, liest es die Adresse des Links, um zu wissen, welche Art von Link es war. Es sendet nur das Ergebnis.',
        ],
        ['Wenn Ihr Browser Global Privacy Control oder Do Not Track sendet, sendet die Seite überhaupt keine Daten zum Experiment.'],
        ['Ich betrachte dies als Teil der Darstellung der Seite und bitte nicht um Einwilligung. Auf Ihrem Gerät wird nichts gespeichert.'],
      ],
    },
    {
      heading: 'Cookies und Speicher',
      id: 'cookies-and-storage',
      paragraphs: [
        ['Besucher erhalten von dieser Website keine Cookies, und sie schreibt nichts in den Speicher ihrer Browser.'],
        ['Das einzige Cookie, das sie überhaupt setzt, setze ich auf meinen eigenen Geräten über einen privaten Link, um meine eigenen Besuche aus den Zählungen herauszuhalten.'],
      ],
      extra: [
        [
          'Diese Website speichert Ihre Sprachwahl weder in einem Cookie noch im Speicher Ihres Browsers. Die Links „English“ und „Deutsch“ sind gewöhnliche Links. Diese Website wertet die Spracheinstellung, die Ihr Browser mit jeder Anfrage mitsendet, nicht aus; welche Sprache Sie sehen, hängt allein von der Adresse ab.',
        ],
      ],
    },
    {
      heading: 'Ihre IP-Adresse und Ihr Browsertyp',
      id: 'your-ip-address-and-browser-type',
      paragraphs: [
        ['Ihr Browser sendet beides mit jeder Anfrage, an jede Website.'],
        [
          'Vercel, das diese Website hostet, verarbeitet beides, um sie auszuliefern. Die Anfrageprotokolle von Vercel enthalten Ihre IP-Adresse, Ihren Browsertyp, die Seitenadresse, die verweisende Seite und Ihren ungefähren Standort (Stadt und Land). Die Protokolle, die ich in meinem Vercel-Konto sehen kann, werden in meinem Tarif (Hobby) eine Stunde lang aufbewahrt. Vercel veröffentlicht keine Aufbewahrungsfrist für seine eigenen Aufzeichnungen und kann Sicherheitsaufzeichnungen nach seinen eigenen Bedingungen länger aufbewahren.',
        ],
        ['Diese Website prüft den Browsertyp, um Bots herauszufiltern, und speichert ihn nicht.'],
        [
          'Um Missbrauch der Nachrichten des Experiments zu begrenzen, wandelt der Server Ihre IP-Adresse (bei IPv6 ihren Netzwerkteil) in einen mit einem Schlüssel gebildeten Hashwert um, der spätestens ',
          HASH_MINUTES,
          ' Minuten nach seiner Erzeugung gelöscht wird. Die Adresse selbst wird von dieser Website nie gespeichert. Mit dem Schlüssel ließe sich der Hashwert grundsätzlich auf die Adresse zurückführen, daher behandle ich ihn für diese ',
          HASH_MINUTES,
          ' Minuten als personenbezogene Daten.',
        ],
      ],
    },
    {
      heading: 'Das Kontaktformular',
      id: 'contact-form',
      paragraphs: [
        [
          'Wenn Sie mir über das Kontaktformular schreiben, sendet Ihr Browser Ihre Eingaben an den Server dieser Website: einen Namen (jeden Namen, mit dem ich Sie ansprechen soll), Ihre E-Mail-Adresse, warum Sie sich melden, einen Betreff und Ihre Nachricht. Außerdem sendet er den Zeitpunkt, zu dem Ihnen das Formular angezeigt wurde, und ein verborgenes Feld, das ein Mensch leer lässt, damit der Server von Bots ausgefüllte Formulare abweisen kann. Wie jede Anfrage enthält auch diese Ihre IP-Adresse und Ihren Browsertyp (siehe „Ihre IP-Adresse und Ihr Browsertyp“).',
        ],
        [
          'Der Server, den Vercel für mich in Frankfurt betreibt, prüft das Formular und gibt es an Resend weiter, das es als reine Text-E-Mail in mein E-Mail-Postfach zustellt, mit Ihrer E-Mail-Adresse als der Adresse, an die ich antworte. Ihr Browser sendet das Formular nur an diese Website, nie an Resend, und die Seite lädt nichts von einer anderen Website.',
        ],
        [
          'Diese Website speichert nichts aus dem Formular. Sie legt keine Kopie in einer Datenbank oder einer Datei ab, setzt kein Cookie und schreibt Ihre Eingaben nicht in ihre Protokolle. Wenn die Nachricht nicht gesendet werden kann, sagt die Seite das, und nichts wird aufbewahrt.',
        ],
        [
          'Um Missbrauch zu begrenzen, hält der Server einen mit einem Schlüssel gebildeten Hashwert Ihrer IP-Adresse (bei IPv6 ihres Netzwerkteils) in seinem Arbeitsspeicher, um zu zählen, wie viele Nachrichten von einer Adresse kommen. Er verwirft den Hashwert, sobald dessen Stunde abgelaufen ist; war der Server pausiert, verwirft er ihn, sobald er weiterläuft, und wenn der Server beendet wird, ist der Hashwert nicht mehr vorhanden. Der Hashwert wird nie in eine Datenbank, eine Datei oder ein Protokoll geschrieben, und die Adresse selbst wird nie gespeichert. Mit dem Schlüssel ließe sich der Hashwert grundsätzlich auf die Adresse zurückführen, daher behandle ich ihn als personenbezogene Daten, solange er besteht.',
        ],
        ['Bitte senden Sie mir über das Formular keine Gesundheitsdaten oder andere sensible Informationen.'],
      ],
    },
    {
      heading: 'Zwecke und Rechtsgrundlagen',
      id: 'purposes-and-legal-bases',
      paragraphs: [
        ['Bereitstellung und Absicherung der Website, einschließlich der Protokolle von Vercel und der Ratenbegrenzungen: Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse ist eine Website, die funktioniert und nicht missbraucht wird.'],
        ['Durchführung und Veröffentlichung des eigenen Experiments dieser Website: Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse ist, offen zu messen, welche Kartenüberschriften besser funktionieren.'],
        ['Die Weiterleitung einer Nachricht aus dem Kontaktformular an mein Postfach und die Prüfungen des Formulars gegen Spam und Missbrauch: Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse ist, die Nachrichten zu erhalten, die Menschen mir schicken möchten, und das Formular frei von Spam zu halten.'],
        ['Antworten auf Ihre Nachrichten, auf LinkedIn oder per E-Mail: Art. 6 Abs. 1 lit. f DSGVO. Mein berechtigtes Interesse ist, den Menschen zu antworten, die mir schreiben. Wenn Sie wegen eines Vertrags schreiben, den Sie selbst mit mir schließen würden, etwa für ein freiberufliches Projekt, ist die Rechtsgrundlage stattdessen Art. 6 Abs. 1 lit. b DSGVO.'],
        ['Das Cookie auf meinen eigenen Geräten: § 25 Abs. 2 Nr. 2 TDDDG.'],
      ],
    },
    {
      heading: 'Wer die Daten verarbeitet',
      id: 'who-processes-the-data',
      paragraphs: [
        [
          'Vercel Inc., USA, hostet die Website. Die Funktionen der Website laufen in Frankfurt. Der Code, der Ihre Gruppe für die englische Startseite auswählt, und das Netzwerk von Vercel, das die Seiten ausliefert, können an dem Standort laufen, der Ihnen am nächsten liegt, und dieser kann außerhalb der EU liegen. Die veröffentlichten Bedingungen zur Auftragsverarbeitung von Vercel nutzen für die Verarbeitung in den USA die EU-Standardvertragsklauseln von 2021. Der Pausenschalter des Experiments liegt in der Edge Config von Vercel.',
        ],
        [
          'Upstash, Inc., USA, betreibt die Zähldatenbank, die in Frankfurt gespeichert ist. Die veröffentlichten Bedingungen zur Auftragsverarbeitung von Upstash stützen sich auf den Datenschutzrahmen EU-USA, mit den Standardvertragsklauseln als Rückfallebene.',
        ],
        [
          'Resend (Plus Five Five, Inc.), USA, stellt die Nachrichten aus dem Kontaktformular in mein Postfach zu und verarbeitet sie hauptsächlich in den USA. Die veröffentlichten Bedingungen zur Auftragsverarbeitung von Resend nutzen die EU-Standardvertragsklauseln von 2021 und geben an, dass Resend nach dem Datenschutzrahmen EU-USA zertifiziert ist.',
        ],
        [
          'Mein Postfach ist ein Gmail-Konto, das mir Google Ireland Limited bereitstellt; Google verarbeitet die Nachrichten dort daher nach seinen eigenen Bedingungen. Google gibt an, dass es sie auf Servern in anderen Ländern verarbeiten kann und dass Google LLC, USA, nach dem Datenschutzrahmen EU-USA zertifiziert ist.',
        ],
        ['Nachrichten, die Sie mir auf LinkedIn senden, verarbeitet LinkedIn nach seinen eigenen Bedingungen.'],
        [
          'Auf dieser Website läuft kein Analyse-, Werbe- oder Social-Media-Dienst eines Dritten, und nichts wird von einer anderen Website geladen. Die einzige Messung sind die oben beschriebenen eigenen Zählungen des Experiments. Die Links zu LinkedIn und GitHub führen Sie zu diesen Websites, unter deren eigenen Bedingungen.',
        ],
      ],
    },
    {
      heading: 'Wie lange',
      id: 'how-long',
      paragraphs: [
        ['Kennungen der Aufrufe: höchstens ', PV_MINUTES, ' Minuten.'],
        ['Hashwerte der IP-Adresse für die Ratenbegrenzung des Experiments: höchstens ', HASH_MINUTES, ' Minuten.'],
        ['Hashwerte der IP-Adresse für die Begrenzung des Kontaktformulars: eine Stunde, nur im Arbeitsspeicher des Servers (siehe „Das Kontaktformular“).'],
        ['Die Protokolle von Vercel: wie oben beschrieben.'],
        ['Nachrichten, auf LinkedIn oder in meinem Postfach, einschließlich derer aus dem Kontaktformular: aufbewahrt, bis ich sie lösche, was ich tue, wenn das Gespräch beendet ist, es sei denn, ich muss sie aufbewahren, zum Beispiel für eine Bewerbung, die noch offen ist.'],
        ['Eine Nachricht, die ich lösche, bleibt bis zu dreißig Tage im Papierkorb von Gmail, sofern ich ihn nicht früher leere, und Google kann nach seinen eigenen Bedingungen für begrenzte Zeit Sicherungskopien aufbewahren.'],
        ['Resend bewahrt die zugestellte E-Mail dreißig Tage lang in meinem Resend-Konto auf, die Aufbewahrungsfrist meines Tarifs, und kann nach seinen eigenen Bedingungen Aufzeichnungen länger aufbewahren.'],
        [
          'Die Zählungen, auch die früherer Runden des Experiments, werden als dessen öffentliche Aufzeichnung aufbewahrt. Sie werden auf dieser Website unter /experiment/data.json als zusammengefasste tägliche Zählungen ohne Kennungen veröffentlicht, über die Zeit aufaddiert, und jede Zählung über null und unter ',
          n(EXPERIMENT.smallCellBelow),
          ' wird als „<',
          n(EXPERIMENT.smallCellBelow),
          '“ angezeigt. Klicks auf die Lebenslauf-Seite oder das Lebenslauf-PDF und auf Kontaktlinks werden nur als Endsummen veröffentlicht, nach dem Ende des Experiments.',
        ],
        ['Edge Config enthält keine personenbezogenen Daten: nur, ob das Experiment pausiert ist oder seine Kalibrierung fehlgeschlagen ist, mit einer kurzen Begründung und einem Datum.'],
        ['Die tägliche Sicherung der Zähldatenbank bei Upstash ist abgeschaltet.'],
      ],
    },
    {
      heading: 'Ihre Rechte',
      id: 'your-rights',
      paragraphs: [
        [
          'Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16 DSGVO), Löschung (Art. 17 DSGVO), Einschränkung der Verarbeitung (Art. 18 DSGVO), Datenübertragbarkeit (Art. 20 DSGVO) und Widerspruch (Art. 21 DSGVO). Sie können sich außerdem bei einer Aufsichtsbehörde beschweren (Art. 77 DSGVO), zum Beispiel bei der Berliner Beauftragten für Datenschutz und Informationsfreiheit.',
        ],
        [
          'Um diese Rechte auszuüben, schreiben Sie mir über das Kontaktformular (wählen Sie „Datenschutz oder Auskunftsanfrage“) oder auf LinkedIn. Nennen Sie mir bei einer Nachricht, die Sie über das Formular gesendet haben, die E-Mail-Adresse, die Sie verwendet haben, damit ich sie finde; ich antworte an diese Adresse.',
        ],
        [
          'Sie können der Verarbeitung auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO jederzeit widersprechen (Art. 21 DSGVO). Für das Experiment ist der einfachste Weg, dass Ihr Browser Global Privacy Control oder Do Not Track sendet; andernfalls schicken Sie mir eine Nachricht auf LinkedIn oder über das Kontaktformular.',
        ],
        [
          'Ich kann nicht erkennen, welche Zählungen von Ihnen stammen, daher gibt es über Sie nichts nachzuschlagen (Art. 11 Abs. 2 DSGVO). Damit Ihre Aufrufe nicht gezählt werden, lassen Sie Ihren Browser Global Privacy Control oder Do Not Track senden.',
        ],
        ['Sie müssen nichts davon bereitstellen: Die Website funktioniert genauso, wenn die Nachrichten des Experiments blockiert werden.'],
        ['Ob Sie mir schreiben, entscheiden Sie. Das Kontaktformular braucht alle fünf Felder, um eine Nachricht zu senden; wenn Sie diese nicht angeben möchten, schreiben Sie mir stattdessen auf LinkedIn.'],
        ['Es gibt keine automatisierten Entscheidungen über Sie und kein Profiling. Die Gruppe wird zufällig gezogen und ändert nichts außer den Kartenüberschriften.'],
      ],
    },
    {
      heading: 'Änderungen',
      id: 'changes',
      paragraphs: [
        ['Wenn sich ändert, was diese Website erfasst, aktualisiere ich diese Seite und ihr Datum.'],
        ['Diese Fassung ist vom ', { updatedOn: true }, '.'],
      ],
      extra: [['Diese Seite ist eine Übersetzung der englischen Fassung. Wo beide voneinander abweichen, ist die englische Fassung maßgeblich.']],
    },
  ],
};
