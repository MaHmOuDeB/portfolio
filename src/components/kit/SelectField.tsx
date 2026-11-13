// A native select in the Field anatomy, with a muted chevron icon over its right edge (never a CSS
// background image: its stroke would be a colour literal and would not follow forced colours).
// "Choose one" is the first, empty option: selected while nothing is chosen, never disabled or
// hidden, so a keyboard user always sees the current state, and drawn muted while chosen. Server-safe.
// The select clips its own content (overflow-hidden on the control, never on an ancestor, so the focus
// ring is untouched): WebKit lets the chosen option's text, when it is wider than the box (enlarged
// text at 320 px), add to the page's scrollable width although it draws it clipped, so the page would
// scroll sideways onto nothing. Chromium already clips it.
import { cx } from '@/lib/cx';
import { Field, fieldControlClass } from './Field';
import { Icon } from './Icon';

type Props = {
  id: string;
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  /** The empty option's text. */
  emptyLabel?: string;
  hint?: string;
  error?: string;
  defaultValue?: string;
  disabled?: boolean;
};

export function SelectField({ id, name, label, options, emptyLabel = 'Choose one', hint, error, defaultValue = '', disabled }: Props) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <div className="relative mt-2">
          <select
            id={id}
            name={name}
            required
            defaultValue={defaultValue}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cx(fieldControlClass, "appearance-none overflow-hidden pr-11 [&:has(option[value='']:checked)]:text-muted [&_option]:text-ink")}
          >
            <option value="">{emptyLabel}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            <Icon name="chevron" />
          </span>
        </div>
      )}
    </Field>
  );
}
