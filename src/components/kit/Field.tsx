// The shared anatomy of the kit's form fields: label, hint, error, control and (for TextArea) a
// counter, top to bottom. The error sits above the control, so a phone keyboard or an autofill bar
// never hides it. Server-safe, no hooks.
//
// - Labels are ink and medium weight (the scan path of a form), with no colon and no asterisk.
// - `aria-describedby` lists, in order, only the parts that exist: hint, error, counter.
// - In the error state the wrapper gets a warn rule at the left (a shape cue as well as a colour) and
//   the error reads "Error: " first. Never overflow-hidden here: it would clip the focus ring.
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Icon } from './Icon';

/**
 * The control box shared by input, textarea and select. Focus is the global ring from tokens.css:
 * the border never changes on focus. No shadow of any kind.
 */
export const fieldControlClass = cx(
  'block w-full min-h-(--size-target) rounded-md border border-muted bg-bg px-3 py-2 text-base text-ink transition-colors',
  'hover:border-ink aria-invalid:border-warn aria-invalid:hover:border-warn',
  'disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:border-line',
);

type Props = {
  /** The control's id; the hint, error and counter ids derive from it. */
  id: string;
  label: string;
  hint?: ReactNode;
  /** The error message, shown only after a failed submit. */
  error?: string;
  /** The id of a counter rendered after the control (TextArea), described after the error. */
  counterId?: string;
  /** Renders the control, given its aria-describedby (undefined when nothing describes it). */
  children: (describedBy: string | undefined) => ReactNode;
  /** The counter, drawn under the control. */
  after?: ReactNode;
};

export function Field({ id, label, hint, error, counterId, children, after }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId, counterId].filter(Boolean).join(' ') || undefined;
  return (
    <div data-field data-invalid={error ? '' : undefined} className={cx('flex min-w-0 flex-col', error && 'border-l-2 border-warn pl-4')}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 flex items-start gap-2 text-sm font-medium text-warn">
          <span className="inline-flex shrink-0 pt-px">
            <Icon name="alert" />
          </span>
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
      {children(describedBy)}
      {after}
    </div>
  );
}
