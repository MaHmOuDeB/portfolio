// A one-line text or e-mail field: the Field anatomy around a native input. Server-safe and
// uncontrolled (defaultValue), so a page re-rendered without JavaScript returns the visitor's text.
// Always required: the form says once that every field is, and is noValidate, so the browser's own
// bubbles never show and the server's messages are the only ones.
import { cx } from '@/lib/cx';
import { Field, fieldControlClass } from './Field';

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  type?: 'text' | 'email';
  autoComplete?: string;
  maxLength?: number;
  defaultValue?: string;
  disabled?: boolean;
  spellCheck?: boolean;
};

export function TextField({ id, name, label, hint, error, type = 'text', autoComplete, maxLength, defaultValue, disabled, spellCheck }: Props) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={id}
          name={name}
          type={type}
          required
          autoComplete={autoComplete}
          maxLength={maxLength}
          defaultValue={defaultValue}
          disabled={disabled}
          spellCheck={spellCheck}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cx(fieldControlClass, 'mt-2')}
        />
      )}
    </Field>
  );
}
