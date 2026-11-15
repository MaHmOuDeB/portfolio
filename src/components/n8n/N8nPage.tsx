// The n8n build note, the last Work item: document and process automation in n8n. The frame is the
// build-note outline (../build-notes/BuildNote.tsx); the prose comes from content/n8n.tsx; the
// evidence is the flow diagram, drawn as two ordered lists so it is its own text alternative.
// Static, server only.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import {
  N8N_ACTIONS,
  N8N_ARCHITECTURE,
  N8N_CLOSE,
  N8N_REPO,
  N8N_CHECKS,
  N8N_FLOW,
  N8N_FLOW_CAPTION,
  N8N_FLOW_LEAD_IN,
  N8N_FLOW_TAKEAWAY,
  N8N_FLOW_TITLE,
  N8N_GLANCE,
  N8N_LIMITS,
  N8N_OUTCOME,
  N8N_PROBLEM,
  N8N_TITLE,
  N8nIntro,
  N8nQuiet,
  N8nSources,
} from '../../../content/n8n';
import {
  BUILD_NOTE_SECTIONS,
  BuildNote,
  DiagramConnector,
  DiagramStep,
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
  const checks = N8N_CHECKS.slice(0, 1);
  const checkDetail = N8N_CHECKS.slice(1);
  const limits = N8N_LIMITS.filter(([key]) => key !== 'needs');
  const needs = N8N_LIMITS.filter(([key]) => key === 'needs');
  return (
    <BuildNote
      slug="n8n"
      title={N8N_TITLE}
      quiet={<N8nQuiet />}
      intro={<N8nIntro />}
      actions={N8N_ACTIONS}
      glance={N8N_GLANCE}
      sections={{
        problem: <Paragraphs items={N8N_PROBLEM} />,
        architecture: (
          <>
            <Paragraphs items={N8N_ARCHITECTURE} />
            <LeadIn>{N8N_FLOW_LEAD_IN}</LeadIn>
            <FigureSheet>
              <FlowDiagram />
            </FigureSheet>
            <Takeaway>{N8N_FLOW_TAKEAWAY}</Takeaway>
            <FigureSheet label="Screenshot">
              <NoteShot shot="n8nDecision" />
            </FigureSheet>
          </>
        ),
        'how-i-checked-this': (
          <>
            <Paragraphs items={checks} />
            <MethodDetails summary="The failure cases and what runs on every push">
              <Paragraphs items={checkDetail} />
            </MethodDetails>
          </>
        ),
        outcome: <Paragraphs items={N8N_OUTCOME} />,
        limits: (
          <>
            <div className={TEXT}>
              <NoteList items={limits} />
            </div>
            <MethodDetails summary="What it needs to run">
              <Paragraphs items={needs} />
            </MethodDetails>
          </>
        ),
        sources: (
          <div className={TEXT}>
            <N8nSources />
          </div>
        ),
      }}
      close={{
        body: <p>{N8N_CLOSE}</p>,
        links: [{ href: `${N8N_REPO.base}/tree/${N8N_REPO.commit}`, label: 'See the code on GitHub', external: true }],
      }}
    />
  );
}
