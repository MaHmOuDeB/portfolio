// The MarketingWS build note, in the shared build-note frame (../build-notes/BuildNote.tsx): the
// problem, the architecture with its diagram, how I checked it, the outcome, at least two limits,
// then the sources and links. The prose comes from content/marketingws.tsx. The page prints no
// figure, has no interactive part and no motion, and links to other sites only as ordinary links.
import type { ReactNode } from 'react';
import { Figure } from '@/components/kit/Figure';
import {
  MARKETINGWS_STEPS,
  MarketingwsArchitecture,
  MarketingwsChecks,
  MarketingwsIntro,
  MarketingwsLimits,
  MarketingwsLinks,
  MarketingwsOutcome,
  MarketingwsProblem,
  STEPS_CAPTION,
  STEPS_TITLE,
} from '../../../content/marketingws';
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep, EVIDENCE, TEXT } from '../build-notes/BuildNote';

export const MARKETINGWS_TITLE = 'MarketingWS';

/** The sections in page order: the ones every build note shares. */
export const MARKETINGWS_SECTIONS = BUILD_NOTE_SECTIONS;

/**
 * One request, step by step: an ordered list of outlined steps, joined by short drawn connectors.
 * The list is the diagram's text and carries its order; the connectors are drawing only.
 */
function StepsDiagram() {
  return (
    <Figure kind="diagram" id="marketingws-steps" title={STEPS_TITLE} caption={STEPS_CAPTION}>
      <ol data-diagram="marketingws-steps" className="max-w-text">
        {MARKETINGWS_STEPS.map((step, i) => (
          <li key={step.id} data-step={step.id}>
            {i > 0 ? <DiagramConnector /> : null}
            <DiagramStep name={step.name} detail={step.text} />
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function MarketingwsPage(): ReactNode {
  return (
    <BuildNote
      slug="marketingws"
      title={MARKETINGWS_TITLE}
      intro={<MarketingwsIntro />}
      sections={{
        problem: (
          <div className={TEXT}>
            <MarketingwsProblem />
          </div>
        ),
        architecture: (
          <>
            <div className={TEXT}>
              <MarketingwsArchitecture />
            </div>
            <div className={EVIDENCE}>
              <StepsDiagram />
            </div>
          </>
        ),
        'how-i-checked-this': (
          <div className={TEXT}>
            <MarketingwsChecks />
          </div>
        ),
        outcome: (
          <div className={TEXT}>
            <MarketingwsOutcome />
          </div>
        ),
        limits: (
          <div className={TEXT}>
            <MarketingwsLimits />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <MarketingwsLinks />
          </div>
        ),
      }}
    />
  );
}
