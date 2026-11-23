'use client';

// Restores its Figure's preset, instantly (no animation). A secondary button, 44 px tall. Hidden
// without JavaScript, like every control.
import { buttonClass } from './ButtonLink';
import { EN_RESET } from './text';

export function ResetButton({
  onReset,
  id,
  label = EN_RESET,
}: {
  onReset: () => void;
  /** Set on the button when given; without it the button has no id. */
  id?: string;
  /** The button's words; default English. */
  label?: string;
}) {
  return (
    <button type="button" id={id} data-touch-target data-js-only className={`${buttonClass('secondary')} max-xs:w-full`} onClick={onReset}>
      {label}
    </button>
  );
}
