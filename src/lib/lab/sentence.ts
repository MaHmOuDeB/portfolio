// The Lab's helpers over a `Sentence` (src/lib/retention/sentence.ts): a piece of text may hold `{name}`
// placeholders for a plain word that belongs inside its sentence ("above", "days"), filled in place
// before the sentence is split into children, so a word that sat inside one English text child does
// not turn into a child of its own. Client-safe: no imports of copy.
import { fill } from '@/lib/i18n/template';
import type { Sentence } from '@/lib/retention/sentence';

/** The sentence with `{name}` placeholders of its text pieces filled by `words`; its slots are kept. */
export function withWords(sentence: Sentence, words: Readonly<Record<string, string>>): Sentence {
  return sentence.map((part) => (typeof part === 'string' ? fill(part, words) : part));
}

/** The sentences one after the other, as one. */
export const joinSentences = (...sentences: readonly Sentence[]): Sentence => sentences.flat();
