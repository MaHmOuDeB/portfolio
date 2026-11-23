'use client';

// The contact form. Without JavaScript it is a plain POST to the Server Action: the page comes back
// with the errors and the visitor's values in the response body, or a 303 to /contact?sent=1. With
// JavaScript the same action runs without a reload: the form validates on submit with the server's
// own rules and words (no round trip for a missing field), shows "Sending…" while the request runs,
// and moves focus to the status block that answers. Nothing is kept in the browser: no cookie, no
// storage, no draft.
import { startTransition, useActionState, useEffect, useRef, useState, type FocusEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { ContactFormCopy } from '../../../content/contact';
import type { CountText, FieldText, KitText } from '@/components/kit/text';
import type { Locale } from '@/lib/i18n/locale';
import { aroundPlaceholder } from '@/components/kit/text';
import { SelectField } from '@/components/kit/SelectField';
import { SubmitButton } from '@/components/kit/SubmitButton';
import { TextArea } from '@/components/kit/TextArea';
import { TextField } from '@/components/kit/TextField';
import { TextLink } from '@/components/kit/TextLink';
import { sendContact } from '@/app/(en)/contact/actions';
import { revealRing } from '@/lib/focus/reveal-ring';
import { CONTACT_LIMITS, FIELD_ORDER, HONEYPOT_FIELD, REASONS, readValues, validate, validateField, type FieldErrors, type FieldName } from '@/lib/contact/fields';
import type { ContactState } from '@/lib/contact/handle';
import { CONTACT } from '@/lib/site';
import type { ErrorMessages } from '@/lib/contact/fields';
import { STATUS_ID, StatusBlock } from './StatusBlock';

const IDLE: ContactState = { status: 'idle' };

/** The id of a field's control: the error summary links to it. */
export const fieldId = (name: FieldName) => `contact-${name}`;

function errorsOf(state: ContactState): FieldErrors {
  return state.status === 'invalid' ? state.errors : {};
}

/** A sentence with one placeholder, filled with an element: the text before it, the element, the text after. */
function withLink(template: string, key: string, link: ReactNode): ReactNode {
  const [before, after] = aroundPlaceholder(template, key);
  return (
    <>
      {before}
      {link}
      {after}
    </>
  );
}

/** A focused field whose ring does not fit on screen is scrolled to the nearest edge (see revealRing). */
function onFieldFocus(event: FocusEvent<HTMLFormElement>) {
  if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) revealRing(event.target);
}

/**
 * `notSentTitle` is the document title while a message has not gone (the page passes it from
 * src/lib/contact/title.ts, which this client module does not import: it reads the server's metadata).
 */
export function ContactForm({
  issuedAt,
  notSentTitle,
  locale,
  copy,
  messages,
  kit,
  privacyHref,
}: {
  issuedAt: number;
  notSentTitle: string;
  locale: Locale;
  /** The form's words in the page's language (a server component passes them: a client file imports no dictionary). */
  copy: ContactFormCopy;
  /** The browser's validation messages, the same set the server answers with. */
  messages: ErrorMessages;
  /** The kit's three slices the fields print (error word, empty option, character count). */
  kit: { field: FieldText; select: string; count: CountText };
  /** The privacy notice's address in the page's language. */
  privacyHref: string;
}) {
  // The fields read only these slices of the kit text; the rest of a KitText holds functions, which
  // cannot cross from the server, so the object is built here with just the slices.
  const kitText = { locale, ...kit } as unknown as KitText;
  const NOT_SENT = copy.notSent;
  const privacy = aroundPlaceholder(copy.privacy, 'link');
  const linkedin = (
    <TextLink href={CONTACT.linkedin} external>
      {copy.linkedin}
    </TextLink>
  );
  const FAILURE: Record<'fast' | 'limit' | 'delivery', ReactNode> = {
    delivery: <p>{withLink(copy.failure.delivery, 'linkedin', linkedin)}</p>,
    limit: <p>{withLink(copy.failure.limit, 'linkedin', linkedin)}</p>,
    fast: <p>{copy.failure.fast}</p>,
  };
  const LABELS = copy.labels;
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
    const errors = validate(readValues(data), messages);
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
    if (shown.errors[name] === undefined || validateField(name, target.value.replace(/\r\n/g, '\n'), messages) !== undefined) return;
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
      {notSent ? <title>{notSentTitle}</title> : null}
      {errorNames.length > 0 ? (
        <StatusBlock ref={status} tone="warn" word={NOT_SENT} className="mt-12">
          <div onClick={onSummaryClick}>
            <p>{copy.checkFields}</p>
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
        <p className="text-sm text-muted">{copy.required}</p>
        <input type="hidden" name="issuedAt" value={stamp} />
        {locale !== 'en' ? <input type="hidden" name="locale" value={locale} /> : null}
        {/* One gap between every field and before the button, so the rhythm is even down the form. */}
        <div className="mt-6 flex flex-col gap-8">
          <TextField
            id={fieldId('name')}
            name="name"
            label={LABELS.name}
            hint={copy.hints.name}
            autoComplete="name"
            maxLength={CONTACT_LIMITS.name}
            defaultValue={values?.name}
            error={shown.errors.name}
            text={kitText}
          />
          <TextField
            id={fieldId('email')}
            name="email"
            type="email"
            label={LABELS.email}
            hint={copy.hints.email}
            autoComplete="email"
            spellCheck={false}
            maxLength={CONTACT_LIMITS.email}
            defaultValue={values?.email}
            error={shown.errors.email}
            text={kitText}
          />
          <SelectField id={fieldId('reason')} name="reason" label={LABELS.reason} options={REASONS.map((r) => ({ value: r.value, label: copy.reasons[r.value] }))} defaultValue={values?.reason} error={shown.errors.reason} text={kitText} />
          <TextField id={fieldId('subject')} name="subject" label={LABELS.subject} autoComplete="off" maxLength={CONTACT_LIMITS.subject} defaultValue={values?.subject} error={shown.errors.subject} text={kitText} />
          <TextArea id={fieldId('message')} name="message" label={LABELS.message} limit={CONTACT_LIMITS.message} refs={['build']} defaultValue={values?.message} error={shown.errors.message} text={kitText} />
        </div>
        {/* A person never sees or reaches this field; a bot that fills it is told the message went. */}
        <div className="sr-only" aria-hidden="true" inert>
          <label htmlFor="contact-hp">{copy.honeypot}</label>
          <input id="contact-hp" name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>
        <div className="mt-8">
          <SubmitButton pending={pending} pendingLabel={copy.sending}>
            {copy.send}
          </SubmitButton>
          <span className="sr-only" aria-live="polite">
            {pending ? copy.sendingAnnounce : ''}
          </span>
          <p className="mt-4 text-sm text-muted">
            {privacy[0].trimEnd()}{' '}
            <TextLink href={privacyHref}>{copy.privacyLink}</TextLink>
            {privacy[1]}
          </p>
        </div>
      </form>
    </>
  );
}
