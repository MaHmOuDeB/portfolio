// A sentence as data, so a client island can take it as a prop: the pieces of its children in order,
// each a text or the name of a value (a number that carries its source refs, a link) that the caller
// supplies. The pieces are exactly the children the JSX of the English sentence had, so rendering the
// English text writes the same markup as before (React separates two neighbouring texts, so where
// the English JSX had two texts side by side the sentence has two strings). Client-safe: no imports
// of copy.
import { createElement, Fragment, type ReactNode } from 'react';

export type Slot = { readonly slot: string };
export type Sentence = readonly (string | Slot)[];

/** The value named `name`, to be placed where the sentence puts it. */
export const slot = (name: string): Slot => ({ slot: name });

/** The sentence as children, with the supplied nodes in the slots. A slot with no value throws. */
export function sentenceNodes(sentence: Sentence, values: Readonly<Record<string, ReactNode>>): ReactNode {
  return createElement(
    Fragment,
    null,
    ...sentence.map((part) => {
      if (typeof part === 'string') return part;
      if (!Object.hasOwn(values, part.slot)) throw new Error(`sentence: no value for ${part.slot}`);
      return values[part.slot];
    }),
  );
}

/** The sentence as plain text, with the supplied strings in the slots. A slot with no value throws. */
export function sentenceText(sentence: Sentence, values: Readonly<Record<string, string>>): string {
  return sentence
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!Object.hasOwn(values, part.slot)) throw new Error(`sentence: no value for ${part.slot}`);
      return values[part.slot]!;
    })
    .join('');
}
