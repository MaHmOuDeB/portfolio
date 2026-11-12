// The Docproof build note. It copies the golden page's outline (src/components/retention) and
// follows the build-note template: the problem, the architecture with its diagram, how it is
// verified (with one recorded run of the verify check), the outcome, the limits and the links. The
// prose comes from content/docproof.tsx; each section is a <section> with its own h2. A plain static
// page: no Figure here has data, so the diagram is a diagram Figure with no badge, table or controls.
import type { ReactNode } from 'react';
import { Figure } from '@/components/kit/Figure';
import { TextLink } from '@/components/kit/TextLink';
import {
  ARCHITECTURE_CAPTION,
  ARCHITECTURE_STAGES,
  ARCHITECTURE_TITLE,
  DocproofArchitecture,
  DocproofIntro,
  DocproofLimits,
  DocproofLinks,
  DocproofOutcome,
  DocproofProblem,
  DocproofRunEvidence,
  DocproofVerification,
  VERIFY_RUN,
} from '../../../content/docproof';

export const DOCPROOF_TITLE = 'Docproof: a multi-agent document pipeline';

/** The sections in page order: anchor id, heading and the short label of its section link. */
export const DOCPROOF_SECTIONS = [
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'architecture', title: 'Architecture', link: 'Architecture' },
  { id: 'verification', title: 'How it is verified', link: 'Verification' },
  { id: 'outcome', title: 'Outcome', link: 'Outcome' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'links', title: 'Links', link: 'Links' },
] as const;

type SectionId = (typeof DOCPROOF_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const STAGE = 'min-w-0 rounded-sm border border-muted p-4';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = DOCPROOF_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`docproof: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className={`${TEXT} text-xl font-semibold`}>
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <div className={TEXT}>{children}</div>;
}

function SectionLinks() {
  return (
    <nav aria-label="On this page" className={`${TEXT} mt-8`}>
      <ul className="flex flex-wrap gap-x-4">
        {DOCPROOF_SECTIONS.map((s) => (
          <li key={s.id}>
            <TextLink href={`#${s.id}`} standalone>
              {s.link}
            </TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Input, orchestration, checks and report, as an ordered list of outlined stages. */
export function DocproofDiagram(): ReactNode {
  return (
    <Figure kind="diagram" id="docproof-architecture" title={ARCHITECTURE_TITLE} caption={ARCHITECTURE_CAPTION}>
      <ol data-diagram="docproof-architecture" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ARCHITECTURE_STAGES.map((s) => (
          <li key={s.id} data-stage={s.id} className={STAGE}>
            <p className="text-sm font-semibold">{s.name}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function DocproofPage(): ReactNode {
  return (
    <article aria-labelledby="docproof-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="docproof-title" className="text-2xl font-semibold md:text-3xl">
          {DOCPROOF_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <DocproofIntro />
        </div>
      </div>

      <SectionLinks />

      <Section id="problem">
        <Prose>
          <DocproofProblem />
        </Prose>
      </Section>

      <Section id="architecture">
        <Prose>
          <DocproofArchitecture />
        </Prose>
        <div className="mt-8">
          <DocproofDiagram />
        </div>
      </Section>

      <Section id="verification">
        <Prose>
          <DocproofVerification />
        </Prose>
        <DocproofRunEvidence run={VERIFY_RUN} />
      </Section>

      <Section id="outcome">
        <Prose>
          <DocproofOutcome />
        </Prose>
      </Section>

      <Section id="limits">
        <Prose>
          <DocproofLimits />
        </Prose>
      </Section>

      <Section id="links">
        <Prose>
          <DocproofLinks />
        </Prose>
      </Section>
    </article>
  );
}
