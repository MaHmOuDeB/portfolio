// The n8n build note, the last Work item: document and process automation in n8n. The frame is the
// build-note outline (../build-notes/BuildNote.tsx); the prose comes from content/n8n.tsx; the
// evidence is the flow diagram, drawn as two ordered lists so it is its own text alternative.
// Static, server only.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import { KIT_TEXT_EN } from '@/components/kit/text';
import type { Locale } from '@/lib/i18n/locale';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { N8N_REPO, N8N_TITLE, N8nSources, type N8nCopy } from '../../../content/n8n';
import {
  BUILD_NOTE_SECTIONS,
  BuildNote,
  DiagramConnector,
  DiagramStep,
  NoteList,
  Paragraphs,
  TEXT,
} from '../build-notes/BuildNote';
import { buildNoteText } from '../build-notes/copy';
import { NoteShot } from '../build-notes/NoteShot';
import { keyed, noteSlots } from '../build-notes/slots';
import { n8nCopy } from './copy';

export { N8N_TITLE };
export const N8N_SECTIONS = BUILD_NOTE_SECTIONS;

/** The intake and the alerts, each an ordered list of steps joined by hidden connectors. */
function FlowDiagram({ copy, locale }: { copy: N8nCopy; locale: Locale }) {
  return (
    <Figure
      kind="diagram"
      id="n8n-flow"
      title={copy.flow.title}
      caption={copy.flow.caption}
      text={locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN}
    >
      <div className="grid max-w-text gap-6">
        {copy.flow.tracks.map((track) => (
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

export function N8nPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = n8nCopy(locale);
  const text = buildNoteText(locale);
  const slots = noteSlots(locale);
  const allChecks = keyed(copy.checks(slots));
  const checks = allChecks.slice(0, 1);
  const checkDetail = allChecks.slice(1);
  const allLimits = keyed(copy.limits());
  const limits = allLimits.filter(([key]) => key !== 'needs');
  const needs = allLimits.filter(([key]) => key === 'needs');
  const code = `${N8N_REPO.base}/tree/${N8N_REPO.commit}`;
  return (
    <BuildNote
      slug="n8n"
      locale={locale}
      title={copy.title}
      quiet={copy.quiet(slots)}
      intro={copy.intro()}
      actions={[{ href: code, label: text.github, icon: 'github', external: true }]}
      glance={copy.glance(slots)}
      sections={{
        problem: <Paragraphs items={keyed(copy.problem())} />,
        architecture: (
          <>
            <Paragraphs items={keyed(copy.architecture())} />
            <LeadIn label={text.leadIn}>{copy.flow.leadIn}</LeadIn>
            <FigureSheet>
              <FlowDiagram copy={copy} locale={locale} />
            </FigureSheet>
            <Takeaway label={text.takeaway}>{copy.flow.takeaway}</Takeaway>
            <FigureSheet label={text.screenshot}>
              <NoteShot shot="n8nDecision" locale={locale} />
            </FigureSheet>
          </>
        ),
        'how-i-checked-this': (
          <>
            <Paragraphs items={checks} />
            <MethodDetails summary={copy.checksSummary}>
              <Paragraphs items={checkDetail} />
            </MethodDetails>
          </>
        ),
        outcome: <Paragraphs items={keyed(copy.outcome())} />,
        limits: (
          <>
            <div className={TEXT}>
              <NoteList items={limits} />
            </div>
            <MethodDetails summary={copy.needsSummary}>
              <Paragraphs items={needs} />
            </MethodDetails>
          </>
        ),
        sources: (
          <div className={TEXT}>
            <N8nSources copy={copy.sources} />
          </div>
        ),
      }}
      close={{ body: <p>{copy.close}</p>, links: [{ href: code, label: text.github, external: true }] }}
    />
  );
}
