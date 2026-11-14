// A small label: above a section or page headline, or inline in a sentence where a word is a
// category. Text, never a link. The dot only repeats what the word says (status is a word).
import type { ReactNode } from 'react';

export type ChipProps = {
  children: ReactNode;
  /** A small dot before the word: `ok` (green, open or passed), `live` (the estimate colour), or none. */
  dot?: 'ok' | 'live' | 'none';
  /** Inside a sentence: sits on the text's baseline with a little space each side. */
  inline?: boolean;
  /** On an ink panel: clear fill, light word, a hairline on ink. */
  onInk?: boolean;
};

export function Chip({ children, dot = 'none', inline, onInk }: ChipProps) {
  return (
    <span data-chip="" data-inline={inline ? '' : undefined} data-on-ink={onInk ? '' : undefined}>
      {dot !== 'none' ? <span data-chip-dot={dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
