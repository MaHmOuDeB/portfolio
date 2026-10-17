'use client';

// Restores its Figure's preset, instantly (no animation). A secondary button, 44 px tall. Hidden
// without JavaScript, like every control.
import { buttonClass } from './ButtonLink';

export function ResetButton({ onReset }: { onReset: () => void }) {
  return (
    <button type="button" data-touch-target data-js-only className={buttonClass('secondary')} onClick={onReset}>
      Reset
    </button>
  );
}
