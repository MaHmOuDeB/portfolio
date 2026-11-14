// The proof row: four figures, two for experiments and two for automation. Every number is a Fact
// (passed as parts); "about" and "min" are plain words around it, set in a smaller unit size so each
// figure keeps one line and the four marks and captions line up across the row. The "Why so many?"
// link keeps its place at the end of the adoption caption. Server-safe.
import { Fragment } from 'react';
import { HOME_PROOF, WHY_SO_MANY, type HeadlinePart } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { Parts } from './Parts';

/** A figure's parts: each number a Fact, each word around it a unit. */
function Figure({ parts }: { parts: readonly HeadlinePart[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{typeof part === 'string' ? <span data-proof-unit="">{part}</span> : <Fact id={part.fact} />}</Fragment>
      ))}
    </>
  );
}

export function ProofRow() {
  return (
    <section data-home-proof="" aria-label="Evidence at a glance" className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {HOME_PROOF.map((p) => (
        <ProofFigure key={p.id} side={p.side} figure={<Figure parts={p.figure} />}>
          <Parts parts={p.caption} />
          {p.whySoMany ? (
            <>
              {' '}
              <TextLink href={HOME_LINKS.whySoMany}>{WHY_SO_MANY}</TextLink>
            </>
          ) : null}
        </ProofFigure>
      ))}
    </section>
  );
}
