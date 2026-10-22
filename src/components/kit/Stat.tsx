// A large number with its label and source line. The value is a <Fact> or a <Derived>, so a Stat
// never types a numeral itself. Tabular figures come from the sans font's feature settings.
// Server-safe, no hooks.
import type { ReactNode } from 'react';

type Props = {
  /** A <Fact> or a <Derived>. */
  value: ReactNode;
  label: ReactNode;
  /** Where the number comes from, in a plain line under the label. */
  source: ReactNode;
};

export function Stat({ value, label, source }: Props) {
  return (
    <div>
      <p className="text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-base">{label}</p>
      <p className="mt-1 text-xs text-muted">{source}</p>
    </div>
  );
}
