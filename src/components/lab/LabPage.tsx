// The Lab: four worked examples of what a test can and cannot tell me, as one reading page. It copies
// the Retention page's structure: a heading and a short opening in the readable column, a list of the
// examples with one sentence on what each is for, then one section per example with its own h2 and
// its Figure at the figure width, and the limits last. Sections are spaced, not boxed: no card grid
// and no motion. Every number is in the Figures (simulated or computed from values the visitor sets);
// the page's own copy is plain words (content/lab.tsx).
//
// The section anchors differ from the Figure ids, so both can be linked: `/lab#sample-size` lands on
// a section heading, `/lab#peeking` on the peeking Figure itself. `LabPeekingPage` is the peeking
// example alone, the page `/lab/peeking` mounts: the same PeekingFigure (id `peeking`, so its URL
// state and the interview link `?peeking.preset=interview` are the same), under the heading Lab, with
// a link back to the whole Lab. Both are server components; each Figure loads its own island.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';
import { PeekingFigure } from '@/components/figures/PeekingFigure';
import { LAB_SECTIONS, LabIntro, LabLimits, LabPeekingIntro } from '../../../content/lab';
import { CurseFigure } from './CurseFigure';
import { FullPlanner } from './FullPlanner';
import { SrmEvenLink, SrmFigure } from './SrmFigure';

export const LAB_TITLE = 'Lab';

type SectionId = (typeof LAB_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';

function Heading() {
  return (
    <h1 id="lab-title" className="text-2xl font-semibold md:text-3xl">
      {LAB_TITLE}
    </h1>
  );
}

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = LAB_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`lab: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className={`${TEXT} text-xl font-semibold`}>
        {entry.title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** The examples in page order, each a 44 px link with one sentence on what it is for. */
function Examples() {
  return (
    <nav aria-label="On this page" className={`${TEXT} mt-8`}>
      <ul>
        {LAB_SECTIONS.map((s) => (
          <li key={s.id} className="mt-3 first:mt-0">
            <TextLink href={`#${s.id}`} standalone>
              {s.title}
            </TextLink>
            <p className="text-base">{s.purpose}</p>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LabPage(): ReactNode {
  return (
    <article aria-labelledby="lab-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <Heading />
        <div className="mt-4 text-lg text-muted">
          <LabIntro />
        </div>
      </div>

      <Examples />

      <Section id="sample-size">
        <FullPlanner />
      </Section>

      <Section id="peeking-at-results">
        <PeekingFigure />
      </Section>

      <Section id="split-check">
        <SrmFigure />
        <SrmEvenLink />
      </Section>

      <Section id="exaggeration">
        <CurseFigure />
      </Section>

      <section id="limits" aria-labelledby="limits-title" className={`${TEXT} mt-12 md:mt-section`}>
        <h2 id="limits-title" className="text-xl font-semibold">
          Limits
        </h2>
        <div className="mt-4">
          <LabLimits />
        </div>
      </section>
    </article>
  );
}

/** The peeking example on its own page: the same Figure as on the Lab, and a link to the rest. */
export function LabPeekingPage(): ReactNode {
  return (
    <article aria-labelledby="lab-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <Heading />
        <div className="mt-4 text-lg text-muted">
          <LabPeekingIntro />
        </div>
      </div>

      <Section id="peeking-at-results">
        <PeekingFigure />
      </Section>

      <div className={`${TEXT} mt-8`}>
        <TextLink href="/lab" standalone>
          All the examples in the Lab
        </TextLink>
      </div>
    </article>
  );
}
