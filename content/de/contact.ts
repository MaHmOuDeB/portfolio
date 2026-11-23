import 'server-only';
import type { ContactCopy } from '../contact';
import type { ErrorMessages } from '@/lib/contact/fields';

// The contact page in German: formal "Sie", the owner's lines in the first person. Nothing here
// promises a reply in German, and the confirmation says only that I reply from my own e-mail. The
// messages name no number.
export const CONTACT_DE: ContactCopy = {
  chip: 'Kontakt',
  title: 'Schreiben Sie mir,',
  quiet: 'ich antworte per E-Mail.',
  intro: 'Sagen Sie mir, wer Sie sind und worum es bei der Stelle oder der Frage geht.',
  side: { title: 'Möchten Sie erst die Fakten sehen?', cv: 'Lebenslauf lesen' },
  form: {
    required: 'Alle Felder sind Pflichtfelder.',
    labels: { name: 'Name', email: 'E-Mail-Adresse', reason: 'Warum nehmen Sie Kontakt auf?', subject: 'Betreff', message: 'Nachricht' },
    hints: { name: 'Mit diesem Namen antworte ich. Jeder Name ist in Ordnung.', email: 'An diese Adresse antworte ich.' },
    reasons: {
      job: 'Stellenangebot',
      interview: 'Gespräch oder Recruiting',
      project: 'Frage zu einem Projekt',
      privacy: 'Datenschutz- oder Datenanfrage',
      other: 'Etwas anderes',
    },
    notSent: 'Nachricht nicht gesendet',
    checkFields: 'Prüfen Sie diese Felder:',
    sending: 'Wird gesendet…',
    sendingAnnounce: 'Ihre Nachricht wird gesendet',
    send: 'Nachricht senden',
    failure: {
      fast: 'Es wurde nichts gesendet, weil das Formular sehr kurz nach dem Öffnen der Seite abgeschickt wurde. Ihr Text steht noch im Formular, Sie können ihn also erneut senden.',
      limit: 'Es wurde nichts gesendet: Dieses Formular hat sein Limit vorerst erreicht. Ihr Text steht noch im Formular. Versuchen Sie es später erneut oder schreiben Sie mir über {linkedin}.',
      delivery: 'Es wurde nichts gesendet: Die Nachricht konnte nicht zugestellt werden. Ihr Text steht noch im Formular. Versuchen Sie es später erneut oder schreiben Sie mir über {linkedin}.',
    },
    linkedin: 'LinkedIn',
    privacy:
      'Ich erhalte Ihre Nachricht per E-Mail: Resend in den USA stellt sie in mein Gmail-Postfach zu, und diese Website speichert nichts. Mehr, auch zu Ihren Rechten, in der {link}.',
    privacyLink: 'Datenschutzerklärung',
    honeypot: 'Lassen Sie dieses Feld leer',
  },
  sent: {
    word: 'Nachricht gesendet',
    text: 'Danke, Ihre Nachricht ist unterwegs. Ich antworte von meiner eigenen E-Mail-Adresse.',
    again: 'Weitere Nachricht senden',
    work: 'Projekte',
  },
  titles: {
    page: 'Kontakt',
    sent: 'Nachricht gesendet',
    notSent: 'Nachricht nicht gesendet',
    description: 'Schreiben Sie mir zu einer Stelle, einem Gespräch oder einem Projekt.',
  },
};

/** The form's messages in German, the same shape as the English `ERRORS`. */
export const ERRORS_DE: ErrorMessages = {
  name: {
    empty: 'Geben Sie Ihren Namen ein',
    long: 'Geben Sie einen kürzeren Namen ein',
    lineBreak: 'Geben Sie Ihren Namen in einer Zeile ein',
    control: 'Entfernen Sie die Sonderzeichen aus Ihrem Namen',
  },
  email: {
    empty: 'Geben Sie Ihre E-Mail-Adresse ein, damit ich antworten kann',
    invalid: 'Geben Sie eine vollständige E-Mail-Adresse mit @ und Domain ein',
    long: 'Geben Sie eine kürzere E-Mail-Adresse ein',
  },
  reason: { empty: 'Wählen Sie, warum Sie Kontakt aufnehmen', invalid: 'Wählen Sie einen der Gründe aus der Liste' },
  subject: {
    empty: 'Geben Sie einen Betreff ein',
    long: 'Geben Sie einen kürzeren Betreff ein',
    lineBreak: 'Geben Sie den Betreff in einer Zeile ein',
    control: 'Entfernen Sie die Sonderzeichen aus dem Betreff',
  },
  message: { empty: 'Geben Sie Ihre Nachricht ein', long: 'Kürzen Sie Ihre Nachricht auf die Zeichengrenze' },
};
