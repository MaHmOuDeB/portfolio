// The n8n build note, the last Work item: document and process automation in n8n. The frame is the
// build-note outline (../build-notes/BuildNote.tsx); the prose comes from content/n8n.tsx; the
// evidence is the flow diagram, drawn as two ordered lists so it is its own text alternative.
// Static, server only.
import type { ReactNode } from 'react';
import { Figure } from '@/components/kit/Figure';
import {
  N8N_ARCHITECTURE,
  N8N_CHECKS,
  N8N_FLOW,
  N8N_FLOW_CAPTION,
  N8N_FLOW_TITLE,
  N8N_GLANCE,
  N8N_LIMITS,
  N8N_OUTCOME,
  N8N_PROBLEM,
  N8N_TITLE,
  N8nIntro,
  N8nRole,
  N8nSources,
} from '../../../content/n8n';
import {
  BUILD_NOTE_SECTIONS,
  BuildNote,
  DiagramConnector,
  DiagramStep,
  EVIDENCE,
  NoteList,
  Paragraphs,
  TEXT,
} from '../build-notes/BuildNote';
import { NoteShot } from '../build-notes/NoteShot';

export { N8N_TITLE };
export const N8N_SECTIONS = BUILD_NOTE_SECTIONS;

/** The intake and the alerts, each an ordered list of steps joined by hidden connectors. */
function FlowDiagram() {
  return (
    <Figure kind="diagram" id="n8n-flow" title={N8N_FLOW_TITLE} caption={N8N_FLOW_CAPTION}>
      <div className="grid max-w-text gap-6">
        {N8N_FLOW.map((track) => (
          <div key={track.id} data-track={track.id}>
            <p aria-hidden="true" className="text-sm font-semibold">
              {track.label}
            </p>
            <ol aria-label={track.label} className="mt-2">
              {track.steps.map((step, i) => (
                <li key={Array.isArray(step) ? 'outcomes' : (step as { name: string }).name}>
                  {i > 0 ? <DiagramConnector /> : null}
                  {Array.isArray(step) ? (
                    <div className="grid gap-3 xs:grid-cols-2">
                      {(step as readonly { name: string; detail: string }[]).map((s) => (
                        <DiagramStep key={s.name} {...s} />
                      ))}
                    </div>
                  ) : (
                    <DiagramStep {...(step as { name: string; detail: string })} />
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Figure>
  );
}

export function N8nPage(): ReactNode {
  return (
    <BuildNote
      slug="n8n"
      title={N8N_TITLE}
      intro={<N8nIntro />}
      role={<N8nRole />}
      glance={N8N_GLANCE}
      sections={{
        problem: <Paragraphs items={N8N_PROBLEM} />,
        architecture: (
          <>
            <Paragraphs items={N8N_ARCHITECTURE} />
            <div className={EVIDENCE}>
              <FlowDiagram />
            </div>
            <NoteShot shot="n8nDecision" />
          </>
        ),
        'how-i-checked-this': <Paragraphs items={N8N_CHECKS} />,
        outcome: <Paragraphs items={N8N_OUTCOME} />,
        limits: (
          <div className={TEXT}>
            <NoteList items={N8N_LIMITS} />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <N8nSources />
          </div>
        ),
      }}
    />
  );
}
