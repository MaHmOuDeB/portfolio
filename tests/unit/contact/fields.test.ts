// The contact form's fields and their validation: the same rules and the same words on the server
// and in the browser.
import { CONTACT_LIMITS, ERRORS, FIELD_ORDER, REASONS, readValues, reasonLabel, validate, validateField, type ContactValues } from '@/lib/contact/fields';

const VALID: ContactValues = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  reason: 'job',
  subject: 'A role on our growth team',
  message: 'Hello, I would like to talk about a role.',
};
const with_ = (patch: Partial<ContactValues>): ContactValues => ({ ...VALID, ...patch });

describe('the contact fields', () => {
  it('are the five fields in page order, with the limits the brief sets', () => {
    expect(FIELD_ORDER).toEqual(['name', 'email', 'reason', 'subject', 'message']);
    expect(CONTACT_LIMITS).toEqual({ name: 100, email: 254, subject: 150, message: 4000 });
  });

  it('offer exactly the five reasons, in order', () => {
    expect(REASONS.map((r) => r.label)).toEqual([
      'Job opportunity',
      'Interview or recruiting',
      'Question about a project',
      'Privacy or data request',
      'Something else',
    ]);
    expect(reasonLabel('privacy')).toBe('Privacy or data request');
    expect(reasonLabel('nope')).toBeUndefined();
  });

  it('read every field as a string, missing ones as empty, and CRLF as LF', () => {
    const fd = new FormData();
    fd.set('name', 'Ada');
    fd.set('message', 'one\r\ntwo');
    expect(readValues(fd)).toEqual({ name: 'Ada', email: '', reason: '', subject: '', message: 'one\ntwo' });
    const file = new FormData();
    file.set('name', new Blob(['x']), 'x.txt');
    expect(readValues(file).name).toBe('');
  });
});

describe('validate', () => {
  it('accepts a complete message', () => {
    expect(validate(VALID)).toEqual({});
  });

  it('asks for every empty field, in the design wording', () => {
    expect(validate({ name: ' ', email: '', reason: '', subject: '\n', message: '  ' })).toEqual({
      name: 'Enter your name',
      email: 'Enter your e-mail address, so I can reply',
      reason: 'Choose why you are getting in touch',
      subject: 'Enter a subject',
      message: 'Enter your message',
    });
  });

  it('enforces the length limits without naming a number', () => {
    expect(validate(with_({ name: 'a'.repeat(101) }))).toEqual({ name: 'Enter a shorter name' });
    expect(validate(with_({ name: 'a'.repeat(100) }))).toEqual({});
    expect(validate(with_({ email: `${'a'.repeat(245)}@example.test` }))).toEqual({ email: 'Enter a shorter e-mail address' });
    expect(validate(with_({ subject: 's'.repeat(151) }))).toEqual({ subject: 'Enter a shorter subject' });
    expect(validate(with_({ message: 'm'.repeat(4001) }))).toEqual({ message: 'Shorten your message to the character limit' });
    expect(validate(with_({ message: 'm'.repeat(4000) }))).toEqual({});
    for (const message of Object.values(ERRORS).flatMap((e) => Object.values(e))) expect(message).not.toMatch(/\d/);
  });

  it('counts a line break as one character, as the counter does', () => {
    expect(validate(with_({ message: 'a\n'.repeat(2000) }))).toEqual({});
  });

  it('rejects header injection: no line break in the name, e-mail or subject', () => {
    expect(validate(with_({ name: 'Ada\r\nBcc: x@example.test' }))).toEqual({ name: 'Enter your name on one line' });
    expect(validate(with_({ subject: 'Hi\nBcc: x@example.test' }))).toEqual({ subject: 'Enter the subject on one line' });
    expect(validate(with_({ subject: 'Hi\rthere' }))).toEqual({ subject: 'Enter the subject on one line' });
    expect(validate(with_({ email: 'ada@example.test\nBcc: x@example.test' }))).toEqual({ email: 'Enter a full e-mail address, with an @ and a domain' });
  });

  it('accepts only a single plain address, never a list or a display name', () => {
    for (const bad of ['ada', 'ada@', '@example.test', 'ada@example', 'ada@@example.test', 'a b@example.test', 'ada@example.test, eve@example.test', 'Ada <ada@example.test>', 'ada@example.test;eve@example.test', 'ada@exa mple.test']) {
      expect(validate(with_({ email: bad })), bad).toEqual({ email: 'Enter a full e-mail address, with an @ and a domain' });
    }
    for (const good of ['ada@example.test', 'ada.lovelace+work@mail.example.co.uk', 'ADA@EXAMPLE.TEST']) {
      expect(validate(with_({ email: good })), good).toEqual({});
    }
  });

  it('accepts only a reason from the list', () => {
    expect(validate(with_({ reason: 'free text' }))).toEqual({ reason: 'Choose one of the reasons in the list' });
  });

  it('validateField gives the same answer for one field', () => {
    expect(validateField('name', '')).toBe('Enter your name');
    expect(validateField('name', 'Ada')).toBeUndefined();
    expect(validateField('reason', 'job')).toBeUndefined();
  });
});
