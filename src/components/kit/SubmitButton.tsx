// A form's submit button, drawn as the primary ButtonLink (`buttonClass('primary')`). Server-safe and
// stateless: the form passes `pending`. While pending the label changes and the button is
// aria-disabled, never disabled, so focus stays on it; the fill stays ink, there is no spinner, and
// min-w-36 keeps the width when the label is shorter. The caller ignores submits while pending.
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
  'inline-flex min-h-(--size-target) max-w-full items-center justify-center rounded-sm border border-line bg-bg px-4 text-sm font-medium text-muted cursor-not-allowed';

export function SubmitButton({ children, pending, pendingLabel, disabled }: Props) {
  return (
    <button
      type="submit"
      data-touch-target
      disabled={disabled}
      aria-disabled={pending && !disabled ? true : undefined}
      className={cx(disabled ? DISABLED : buttonClass('primary'), 'min-w-36', pending && !disabled && 'cursor-progress')}
    >
      {pending && !disabled ? (pendingLabel ?? children) : children}
    </button>
  );
}
