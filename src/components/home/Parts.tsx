// Prose with figures, as content/home.ts writes it: plain text as written, and each `{ fact }` part
// printed by the kit's Fact, so every number on the Home page is traceable. Server-safe.
import { Fragment } from 'react';
import type { HeadlinePart } from '../../../content/home.ts';
import { Fact } from '@/components/kit/Fact';
import type { Locale } from '@/lib/i18n/locale';

export function Parts({ parts, locale = 'en' }: { parts: readonly HeadlinePart[]; locale?: Locale }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{typeof part === 'string' ? part : <Fact id={part.fact} locale={locale} />}</Fragment>
      ))}
    </>
  );
}
