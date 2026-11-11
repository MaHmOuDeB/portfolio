'use client';

// Restores its Figure's preset, instantly (no animation). A secondary button, 44 px tall. Hidden
// without JavaScript, like every control.
import { buttonClass } from './ButtonLink';

export function ResetButton({
  onReset,
  id,
}: {
  onReset: () => void;
  /** Set on the button when given; without it the button has no id. */
  id?: string;
}) {
  return (
    <button type="button" id={id} data-touch-target data-js-only className={`${buttonClass('secondary')} max-xs:w-full`} onClick={onReset}>
      Reset
    </button>
  );
}
