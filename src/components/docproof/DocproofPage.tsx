// The Docproof build note, in the shared build-note frame (../build-notes/BuildNote.tsx). It leads
// with its best exhibit, one recorded run of the verify check under "How I checked this" (how the
// tools themselves are tested sits one click deeper), then the problem, the architecture with its
// diagram, the outcome, the limits and the sources and links. The prose comes from
// content/docproof.tsx. A plain static page: no Figure here has data, so the diagram is a diagram
// Figure with no badge, table or controls.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import {
  ARCHITECTURE_CAPTION,
  ARCHITECTURE_STAGES,
  ARCHITECTURE_TITLE,
  DOCPROOF_ACTIONS,
  DOCPROOF_GLANCE,
  DOCPROOF_H1,
  DOCPROOF_QUIET,
  DocproofArchitecture,
  DocproofIntro,
  DocproofLimits,
  DocproofLinks,
  DocproofOutcome,
  DocproofProblem,
  DocproofRunEvidence,
  DocproofVerification,
  DOCPROOF_REPO,
  RUN_TAKEAWAY,
  RunLeadIn,
  VERIFY_RUN,
} from '../../../content/docproof';
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep, TEXT } from '../build-notes/BuildNote';

/** The document title (content/seo.ts); the h1 is DOCPROOF_H1 with its quiet clause. */
export const DOCPROOF_TITLE = 'Docproof: agents write, checks decide';

/** The sections in page order: the recorded run first, then the rest in the shared order. */
export const DOCPROOF_SECTIONS = [
  ...BUILD_NOTE_SECTIONS.filter((s) => s.id === 'how-i-checked-this'),
  ...BUILD_NOTE_SECTIONS.filter((s) => s.id !== 'how-i-checked-this'),
];

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
      title={DOCPROOF_H1}
      quiet={DOCPROOF_QUIET}
      intro={<DocproofIntro />}
      actions={DOCPROOF_ACTIONS}
      glance={DOCPROOF_GLANCE}
      lead="how-i-checked-this"
      sections={{
        'how-i-checked-this': (
          <>
            <LeadIn>
              <RunLeadIn />
            </LeadIn>
            <FigureSheet label="Recorded run">
              <DocproofRunEvidence run={VERIFY_RUN} />
            </FigureSheet>
            <Takeaway>{RUN_TAKEAWAY}</Takeaway>
            <MethodDetails summary="How the tools themselves are tested">
              <DocproofVerification />
            </MethodDetails>
          </>
        ),
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
            <FigureSheet>
              <DocproofDiagram />
            </FigureSheet>
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
      close={{
        body: <p>I build AI tools in which code, not the model, has the last word on facts.</p>,
        links: [{ href: DOCPROOF_REPO, label: 'See the code on GitHub', external: true }],
      }}
    />
  );
}
