// The contact page's words: the page, the side card, the form and its answers, the document titles. The
// words are a `ContactCopy`: CONTACT_EN here, the German twin in content/de/contact.ts typed by the same
// type, so a missing key fails the typecheck. The form is a client file, so it gets the `form` part as a
// prop; a sentence with a link is a Template whose placeholder the form fills with the link. The error
// messages are in src/lib/contact/fields.ts (English) and content/de/contact.ts (German). The e-mail
// to me is always English (src/lib/contact/send.ts), whatever language the form was in.
import type { ReasonValue } from '@/lib/contact/fields';
import type { Template } from '@/lib/i18n/template';

export type ContactFormCopy = {
  required: string;
  labels: { name: string; email: string; reason: string; subject: string; message: string };
  hints: { name: string; email: string };
  /** The reason list's labels by value; the values themselves never change. */
  reasons: Record<ReasonValue, string>;
  notSent: string;
  checkFields: string;
  sending: string;
  sendingAnnounce: string;
  send: string;
  failure: { fast: string; limit: Template<'linkedin'>; delivery: Template<'linkedin'> };
  linkedin: string;
  privacy: Template<'link'>;
  privacyLink: string;
  honeypot: string;
};

export type ContactCopy = {
  chip: string;
  title: string;
  quiet: string;
  intro: string;
  side: { title: string; cv: string };
  form: ContactFormCopy;
  sent: { word: string; text: string; again: string; work: string };
  /** The document titles: the page's own, and the two states that come before the site's name. */
  titles: { page: string; sent: string; notSent: string; description: string };
};

export const CONTACT_EN: ContactCopy = {
  chip: 'Contact',
  title: 'Write to me,',
  quiet: 'I reply by e-mail.',
  intro: 'Tell me who you are and what the role or question is.',
  side: { title: 'Want the facts first?', cv: 'Read my CV' },
  form: {
    required: 'All fields are required.',
    labels: { name: 'Name', email: 'E-mail address', reason: 'Why are you getting in touch?', subject: 'Subject', message: 'Message' },
    hints: { name: 'I use this name when I reply. Any name is fine.', email: 'I reply to this address.' },
    reasons: {
      job: 'Job opportunity',
      interview: 'Interview or recruiting',
      project: 'Question about a project',
      privacy: 'Privacy or data request',
      other: 'Something else',
    },
    notSent: 'Message not sent',
    checkFields: 'Check these fields:',
    sending: 'Sending…',
    sendingAnnounce: 'Sending your message',
    send: 'Send message',
    failure: {
      fast: 'Nothing was sent, because the form was sent very soon after the page opened. Your text is still in the form, so you can send it again.',
      limit: 'Nothing was sent: this form has reached its limit for now. Your text is still in the form. Try again later, or message me on {linkedin}.',
      delivery: 'Nothing was sent: the message could not be delivered. Your text is still in the form. Try again later, or message me on {linkedin}.',
    },
    linkedin: 'LinkedIn',
    privacy:
      'I receive your message by e-mail: Resend, in the USA, delivers it to my Gmail inbox, and this site stores nothing. More, including your rights, in the {link}.',
    privacyLink: 'privacy notice',
    honeypot: 'Leave this field empty',
  },
  sent: { word: 'Message sent', text: 'Thanks, your message is on its way. I reply from my own e-mail.', again: 'Send another message', work: 'Work' },
  titles: {
    page: 'Contact',
    sent: 'Message sent',
    notSent: 'Message not sent',
    description: 'Send me a message about a role, an interview or a project.',
  },
};
