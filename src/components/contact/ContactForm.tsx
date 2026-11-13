'use client';

// The contact form. Without JavaScript it is a plain POST to the Server Action: the page comes back
// with the errors and the visitor's values in the response body, or a 303 to /contact?sent=1. With
// JavaScript the same action runs without a reload: the form validates on submit with the server's
// own rules and words (no round trip for a missing field), shows "Sending…" while the request runs,
// and moves focus to the status block that answers. Nothing is kept in the browser: no cookie, no
// storage, no draft.
import { startTransition, useActionState, useEffect, useRef, useState, type FocusEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { SelectField } from '@/components/kit/SelectField';
import { SubmitButton } from '@/components/kit/SubmitButton';
import { TextArea } from '@/components/kit/TextArea';
import { TextField } from '@/components/kit/TextField';
import { TextLink } from '@/components/kit/TextLink';
import { sendContact } from '@/app/contact/actions';
import { revealRing } from '@/lib/focus/reveal-ring';
import { CONTACT_LIMITS, FIELD_ORDER, HONEYPOT_FIELD, REASONS, readValues, validate, validateField, type FieldErrors, type FieldName } from '@/lib/contact/fields';
import type { ContactState } from '@/lib/contact/handle';
import { CONTACT } from '@/lib/site';
import { STATUS_ID, StatusBlock } from './StatusBlock';

const IDLE: ContactState = { status: 'idle' };
const TITLE = 'Contact';
const NOT_SENT = 'Message not sent';

/** The id of a field's control: the error summary links to it. */
export const fieldId = (name: FieldName) => `contact-${name}`;

const LABELS: Record<FieldName, string> = {
  name: 'Name',
  email: 'E-mail address',
  reason: 'Why are you getting in touch?',
  subject: 'Subject',
  message: 'Message',
};

function errorsOf(state: ContactState): FieldErrors {
  return state.status === 'invalid' ? state.errors : {};
}

function LinkedIn() {
  return (
    <TextLink href={CONTACT.linkedin} external>
      LinkedIn
    </TextLink>
  );
}

const FAILURE: Record<'fast' | 'limit' | 'delivery', ReactNode> = {
  delivery: (
    <p>
      Nothing was sent: the message could not be delivered. Your text is still in the form. Try again later, or message me on <LinkedIn />.
    </p>
  ),
  limit: (
    <p>
      Nothing was sent: this form has reached its limit for now. Your text is still in the form. Try again later, or message me on <LinkedIn />.
    </p>
  ),
  fast: <p>Nothing was sent, because the form was sent very soon after the page opened. Your text is still in the form, so you can send it again.</p>,
};

/** A focused field whose ring does not fit on screen is scrolled to the nearest edge (see revealRing). */
function onFieldFocus(event: FocusEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) revealRing(event.target);
}

export function ContactForm({ issuedAt }: { issuedAt: number }) {
  const [state, formAction, pending] = useActionState(sendContact, IDLE);
  // The errors on show: the server's after a response, the browser's after a submit it stopped. Each
  // field's own error clears as soon as the field becomes valid; the summary (and the title) keep the
  // list of that submit until the next one, so nothing above the field moves while the visitor types.
  const [shown, setShown] = useState<{ from: ContactState; errors: FieldErrors; summary: FieldErrors; attempt: number }>({
    from: state,
    errors: errorsOf(state),
    summary: errorsOf(state),
    attempt: 0,
  });
  if (shown.from !== state) setShown({ from: state, errors: errorsOf(state), summary: errorsOf(state), attempt: shown.attempt + 1 });
  const status = useRef<HTMLDivElement>(null);

  const values = state.status === 'invalid' || state.status === 'failed' ? state.values : undefined;
  const stamp = (state.status === 'invalid' || state.status === 'failed' ? state.issuedAt : null) ?? issuedAt;
  const errorNames = FIELD_ORDER.filter((name) => shown.summary[name] !== undefined);
  const failure = state.status === 'failed' && errorNames.length === 0 ? state.reason : null;
  const notSent = errorNames.length > 0 || failure !== null;

  // Each answer moves focus to its block, at once.
  useEffect(() => {
    if (shown.attempt > 0) status.current?.focus();
  }, [shown.attempt]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const errors = validate(readValues(data));
    if (Object.keys(errors).length > 0) {
      setShown({ from: state, errors, summary: errors, attempt: shown.attempt + 1 });
      return;
    }
    setShown({ from: state, errors: {}, summary: {}, attempt: shown.attempt });
    startTransition(() => formAction(data));
  }

  function onInput(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    const name = target.name as FieldName;
    if (shown.errors[name] === undefined || validateField(name, target.value.replace(/\r\n/g, '\n')) !== undefined) return;
    const errors = { ...shown.errors };
    delete errors[name];
    setShown({ ...shown, errors });
  }

  // A summary link moves focus into its field, not just the view, and scrolls the way the link would
  // without JavaScript: the control to the top, less its scroll margin, so its label and error stay in
  // view above it.
  function onSummaryClick(event: MouseEvent<HTMLElement>) {
    const link = (event.target as Element).closest('a[href^="#contact-"]');
    if (link === null) return;
    const field = document.getElementById(link.getAttribute('href')!.slice(1));
    if (field === null) return;
    event.preventDefault();
    field.focus({ preventScroll: true });
    field.scrollIntoView({ block: 'start' });
  }

  return (
    <>
      {notSent ? <title>{`${NOT_SENT}: ${TITLE}`}</title> : null}
      {errorNames.length > 0 ? (
        <StatusBlock ref={status} tone="warn" word={NOT_SENT} className="mt-12">
          <div onClick={onSummaryClick}>
            <p>Check these fields:</p>
            {/* role="list": WebKit drops the list role from a list drawn without bullets. */}
            <ul role="list" className="mt-2">
              {errorNames.map((name) => (
                <li key={name}>
                  <TextLink href={`#${fieldId(name)}`} standalone>
                    {shown.summary[name]}
                  </TextLink>
                </li>
              ))}
            </ul>
          </div>
        </StatusBlock>
      ) : failure !== null ? (
        <StatusBlock ref={status} tone="warn" word={NOT_SENT} className="mt-12">
          {FAILURE[failure]}
        </StatusBlock>
      ) : null}
      <form
        action={formAction}
        onSubmit={onSubmit}
        onInput={onInput}
        noValidate
        onFocus={onFieldFocus}
        aria-describedby={notSent ? STATUS_ID : undefined}
        className={notSent ? 'mt-8' : 'mt-12'}
      >
        <p className="text-sm text-muted">All fields are required.</p>
        <input type="hidden" name="issuedAt" value={stamp} />
        {/* One gap between every field and before the button, so the rhythm is even down the form. */}
        <div className="mt-6 flex flex-col gap-8">
          <TextField id={fieldId('name')} name="name" label={LABELS.name} autoComplete="name" maxLength={CONTACT_LIMITS.name} defaultValue={values?.name} error={shown.errors.name} />
          <TextField
            id={fieldId('email')}
            name="email"
            type="email"
            label={LABELS.email}
            hint="I reply to this address."
            autoComplete="email"
            spellCheck={false}
            maxLength={CONTACT_LIMITS.email}
            defaultValue={values?.email}
            error={shown.errors.email}
          />
          <SelectField id={fieldId('reason')} name="reason" label={LABELS.reason} options={REASONS} defaultValue={values?.reason} error={shown.errors.reason} />
          <TextField id={fieldId('subject')} name="subject" label={LABELS.subject} autoComplete="off" maxLength={CONTACT_LIMITS.subject} defaultValue={values?.subject} error={shown.errors.subject} />
          <TextArea id={fieldId('message')} name="message" label={LABELS.message} limit={CONTACT_LIMITS.message} refs={['build']} defaultValue={values?.message} error={shown.errors.message} />
        </div>
        {/* A person never sees or reaches this field; a bot that fills it is told the message went. */}
        <div className="sr-only" aria-hidden="true" inert>
          <label htmlFor="contact-hp">Leave this field empty</label>
          <input id="contact-hp" name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <div className="mt-8">
          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send message
          </SubmitButton>
          <span className="sr-only" aria-live="polite">
            {pending ? 'Sending your message' : ''}
          </span>
          <p className="mt-4 text-sm text-muted">
            I receive your message by e-mail: Resend, in the USA, delivers it to my Gmail inbox, and this site stores nothing. More, including your rights, in the{' '}
            <TextLink href="/privacy#contact-form">privacy notice</TextLink>.
          </p>
        </div>
      </form>
    </>
  );
}
