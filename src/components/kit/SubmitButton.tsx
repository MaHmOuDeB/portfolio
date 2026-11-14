// A form's submit button, drawn as the primary ButtonLink (`buttonClass('primary')`). Server-safe and
// stateless: the form passes `pending`. While pending the label changes and the button is
// aria-disabled, never disabled, so focus stays on it; the fill stays ink, there is no spinner, and
// a 9rem minimum keeps the width when the label is shorter, capped at the column so enlarged text
// never pushes it past a 320 px screen. The caller ignores submits while pending.
// `disabled` is the tokens' disabled state (the kitchen sink shows it; a form validates on submit
// instead of disabling its button). Never full width, never an icon.
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { buttonClass } from './ButtonLink';

type Props = {
  children: ReactNode;
  pending?: boolean;
  /** The label while pending, such as "Sending…". */
  pendingLabel?: ReactNode;
  disabled?: boolean;
};

const DISABLED =
  'inline-flex min-h-(--size-target) max-w-full items-center justify-center rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-muted cursor-not-allowed';

export function SubmitButton({ children, pending, pendingLabel, disabled }: Props) {
  return (
    <button
      type="submit"
      data-touch-target
      disabled={disabled}
      aria-disabled={pending && !disabled ? true : undefined}
      className={cx(disabled ? DISABLED : buttonClass('primary'), 'min-w-[min(9rem,100%)]', pending && !disabled && 'cursor-progress')}
    >
      {pending && !disabled ? (pendingLabel ?? children) : children}
    </button>
  );
}
