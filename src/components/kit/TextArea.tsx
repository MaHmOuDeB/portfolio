// A multi-line field with a visible character limit: the Field anatomy around a native textarea,
// eight rows high and resizable in height. Server-safe; the live count is the client child
// CharacterCount, which shows "Up to <limit> characters" until it hydrates (and always without
// JavaScript). There is no native maxLength: it would silently cut off a pasted message. The visitor
// may type past the limit, the counter says by how much, and the server rejects the excess.
import { cx } from '@/lib/cx';
import { CharacterCount } from './CharacterCount';
import type { DerivedRef } from './Derived';
import { Field, fieldControlClass } from './Field';

type Props = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  error?: string;
  /** The character limit the counter shows. */
  limit: number;
  /** Where the limit comes from, for the counter's data-derived. */
  refs: readonly DerivedRef[];
  rows?: number;
  defaultValue?: string;
  disabled?: boolean;
};

export function TextArea({ id, name, label, hint, error, limit, refs, rows = 8, defaultValue, disabled }: Props) {
  const counterId = `${id}-count`;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      counterId={counterId}
      after={<CharacterCount id={counterId} controlId={id} limit={limit} refs={refs} />}
    >
      {(describedBy) => (
        <textarea
          id={id}
          name={name}
          required
          rows={rows}
          defaultValue={defaultValue}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cx(fieldControlClass, 'mt-2 resize-y data-over-limit:border-warn')}
        />
      )}
    </Field>
  );
}
