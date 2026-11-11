// Prose with figures, as content/home.ts writes it: plain text as written, and each `{ fact }` part
// printed by the kit's Fact, so every number on the Home page is traceable. Server-safe.
import { Fragment } from 'react';
import type { HeadlinePart } from '../../../content/home.ts';
import { Fact } from '@/components/kit/Fact';

export function Parts({ parts }: { parts: readonly HeadlinePart[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{typeof part === 'string' ? part : <Fact id={part.fact} />}</Fragment>
      ))}
    </>
  );
}
