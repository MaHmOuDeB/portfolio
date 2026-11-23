// The proof row: four ruled cells, two for experiments and two for automation, in a section ruled
// from rail to rail. Every number is a Fact (passed as parts); "about" and "min" are plain words
// around it, set in a smaller unit size so each figure keeps one line. The "Why so many?" link keeps
// its place at the end of the adoption caption. The rules between the cells draw in as the row
// enters (data-depth-trace); the numbers never move. Server-safe.
import { Fragment } from 'react';
import type { HeadlinePart } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { homeCopy } from './copy';
import { Parts } from './Parts';

/** A figure's parts: each number a Fact, each word around it a unit. */
function Figure({ parts, locale }: { parts: readonly HeadlinePart[]; locale: Locale }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{typeof part === 'string' ? <span data-proof-unit="">{part}</span> : <Fact id={part.fact} locale={locale} />}</Fragment>
      ))}
    </>
  );
}

export function ProofRow({ locale = 'en' }: { locale?: Locale } = {}) {
  const proof = homeCopy(locale).proof;
  return (
    <section data-home-proof="" data-rule="" data-depth-trace="proof" aria-label={proof.label}>
      {proof.items.map((p) => (
        <ProofFigure key={p.id} side={p.side} figure={<Figure parts={p.figure} locale={locale} />}>
          <Parts parts={p.caption} locale={locale} />
          {p.whySoMany ? (
            <>
              {' '}
              <TextLink href={localHref(locale, HOME_LINKS.whySoMany)}>{proof.why}</TextLink>
            </>
          ) : null}
        </ProofFigure>
      ))}
    </section>
  );
}
