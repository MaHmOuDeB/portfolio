// The proof row: four figures, two for experiments and two for automation. Every number is a Fact
// (passed as parts); "about" and "min" are plain words around it. The "Why so many?" link keeps its
// place at the end of the adoption caption. Server-safe.
import { HOME_PROOF, WHY_SO_MANY } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { ProofFigure } from '@/components/depth/ProofFigure';
import { TextLink } from '@/components/kit/TextLink';
import { Parts } from './Parts';

export function ProofRow() {
  return (
    <section data-home-proof="" aria-label="Evidence at a glance" className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {HOME_PROOF.map((p) => (
        <ProofFigure key={p.id} side={p.side} figure={<Parts parts={p.figure} />}>
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
