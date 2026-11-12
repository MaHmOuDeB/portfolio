// The contact form's fields, limits, reasons and messages, and the one validation both sides run:
// the browser on submit (no round trip for a missing field) and the server on every request. Pure
// and client-safe. The messages name no number: a limit is "shorter", never a figure.

export const FIELD_ORDER = ['name', 'email', 'reason', 'subject', 'message'] as const;
export type FieldName = (typeof FIELD_ORDER)[number];
export type ContactValues = Record<FieldName, string>;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const CONTACT_LIMITS = { name: 100, email: 254, subject: 150, message: 4000 } as const;

export const REASONS = [
  { value: 'job', label: 'Job opportunity' },
  { value: 'interview', label: 'Interview or recruiting' },
  { value: 'project', label: 'Question about a project' },
  { value: 'privacy', label: 'Privacy or data request' },
  { value: 'other', label: 'Something else' },
] as const;

export const ERRORS = {
  name: { empty: 'Enter your name', long: 'Enter a shorter name', lineBreak: 'Enter your name on one line' },
  email: { empty: 'Enter your e-mail address, so I can reply', invalid: 'Enter a full e-mail address, with an @ and a domain', long: 'Enter a shorter e-mail address' },
  reason: { empty: 'Choose why you are getting in touch', invalid: 'Choose one of the reasons in the list' },
  subject: { empty: 'Enter a subject', long: 'Enter a shorter subject', lineBreak: 'Enter the subject on one line' },
  message: { empty: 'Enter your message', long: 'Shorten your message to the character limit' },
} as const;

export function reasonLabel(value: string): string | undefined {
  return REASONS.find((r) => r.value === value)?.label;
}

/** Every field as a string (a missing one or a file is empty), with CRLF as LF, as the browser counts. */
export function readValues(fd: FormData): ContactValues {
  const read = (name: FieldName) => {
    const v = fd.get(name);
    return typeof v === 'string' ? v.replace(/\r\n/g, '\n') : '';
  };
  return { name: read('name'), email: read('email'), reason: read('reason'), subject: read('subject'), message: read('message') };
}

const LINE_BREAK = /[\r\n]/;
// One plain address: no whitespace, list separators, angle brackets or quotes (so it can never become
// a display name or a second recipient), one @, and a domain with a dot.
const ADDRESS_PART = String.raw`[^\s@,;:<>()\[\]"\\]+`;
const ADDRESS = new RegExp(`^${ADDRESS_PART}@[^\\s@,;:<>()\\[\\]"\\\\.]+(?:\\.[^\\s@,;:<>()\\[\\]"\\\\.]+)+$`);

export function validateField(name: FieldName, raw: string): string | undefined {
  const value = name === 'message' ? raw : raw.trim();
  switch (name) {
    case 'name':
    case 'subject': {
      const e = ERRORS[name];
      if (value === '') return e.empty;
      if (LINE_BREAK.test(value)) return e.lineBreak;
      if (value.length > CONTACT_LIMITS[name]) return e.long;
      return undefined;
    }
    case 'email':
      if (value === '') return ERRORS.email.empty;
      if (!ADDRESS.test(value)) return ERRORS.email.invalid;
      if (value.length > CONTACT_LIMITS.email) return ERRORS.email.long;
      return undefined;
    case 'reason':
      if (value === '') return ERRORS.reason.empty;
      return reasonLabel(value) === undefined ? ERRORS.reason.invalid : undefined;
    case 'message':
      if (value.trim() === '') return ERRORS.message.empty;
      return value.replace(/\r\n/g, '\n').length > CONTACT_LIMITS.message ? ERRORS.message.long : undefined;
  }
}

export function validate(values: ContactValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const name of FIELD_ORDER) {
    const error = validateField(name, values[name]);
    if (error !== undefined) errors[name] = error;
  }
  return errors;
}

/** The values as they are sent: one-line fields and the message trimmed. */
export function cleanValues(values: ContactValues): ContactValues {
  return {
    name: values.name.trim(),
    email: values.email.trim(),
    reason: values.reason,
    subject: values.subject.trim(),
    message: values.message.trim(),
  };
}
