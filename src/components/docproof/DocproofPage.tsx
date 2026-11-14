// The Docproof build note, in the shared build-note frame (../build-notes/BuildNote.tsx): the
// problem, the architecture with its diagram, how I checked this (with one recorded run of the
// verify check), the outcome, the limits and the sources and links. The prose comes from
// content/docproof.tsx. A plain static page: no Figure here has data, so the diagram is a diagram
// Figure with no badge, table or controls.
import type { ReactNode } from 'react';
import { Figure } from '@/components/kit/Figure';
import {
  ARCHITECTURE_CAPTION,
  ARCHITECTURE_STAGES,
  ARCHITECTURE_TITLE,
  DOCPROOF_GLANCE,
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
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep, EVIDENCE, TEXT } from '../build-notes/BuildNote';

export const DOCPROOF_TITLE = 'Docproof: a multi-agent document pipeline';

/** The sections in page order: the ones every build note shares. */
export const DOCPROOF_SECTIONS = BUILD_NOTE_SECTIONS;

/** Input, orchestration, checks and report, as an ordered list of outlined stages. */
export function DocproofDiagram(): ReactNode {
  return (
    <Figure kind="diagram" id="docproof-architecture" title={ARCHITECTURE_TITLE} caption={ARCHITECTURE_CAPTION}>
      <ol data-diagram="docproof-architecture" className="grid max-w-text gap-0">
        {ARCHITECTURE_STAGES.map((s, i) => (
          <li key={s.id} data-stage={s.id} className="min-w-0">
            {i > 0 ? <DiagramConnector /> : null}
            <DiagramStep name={s.name} detail={s.body} />
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function DocproofPage(): ReactNode {
  return (
    <BuildNote
      slug="docproof"
      title={DOCPROOF_TITLE}
      intro={<DocproofIntro />}
      glance={DOCPROOF_GLANCE}
      sections={{
        problem: (
          <div className={TEXT}>
            <DocproofProblem />
          </div>
        ),
        architecture: (
          <>
            <div className={TEXT}>
              <DocproofArchitecture />
            </div>
            <div className={EVIDENCE}>
              <DocproofDiagram />
            </div>
          </>
        ),
        'how-i-checked-this': (
          <>
            <div className={TEXT}>
              <DocproofVerification />
            </div>
            <DocproofRunEvidence run={VERIFY_RUN} />
          </>
        ),
        outcome: (
          <div className={TEXT}>
            <DocproofOutcome />
          </div>
        ),
        limits: (
          <div className={TEXT}>
            <DocproofLimits />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <DocproofLinks />
          </div>
        ),
      }}
    />
  );
}
