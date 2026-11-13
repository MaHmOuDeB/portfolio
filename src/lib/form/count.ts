// The character counter's words, as data: how many characters are left, none, or how many too many.
// Pure, so the kit's CharacterCount and the tests share it.

export type CountState = { kind: 'left' | 'none' | 'over'; n: number };

export function countState(length: number, limit: number): CountState {
  if (length < limit) return { kind: 'left', n: limit - length };
  if (length === limit) return { kind: 'none', n: 0 };
  return { kind: 'over', n: length - limit };
}

/**
 * Whether a screen reader hears the count: only in the last tenth of the limit and over it, so it
 * never chatters on every key while there is plenty of room.
 */
export function shouldAnnounce(length: number, limit: number): boolean {
  return limit - length < limit / 10;
}

/** The sentence a screen reader hears (the visible counter says the same). */
export function countSentence(state: CountState, format: (n: number) => string): string {
  if (state.kind === 'none') return 'No characters left';
  const unit = state.n === 1 ? 'character' : 'characters';
  return state.kind === 'left' ? `${format(state.n)} ${unit} left` : `${format(state.n)} ${unit} too many`;
}
