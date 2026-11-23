// The MarketingWS build note, in the shared build-note frame (../build-notes/BuildNote.tsx): the
// problem, the architecture with its diagram, how I checked it, the outcome, at least two limits,
// then the sources and links. The prose comes from content/marketingws.tsx. The page prints no
// figure, has no interactive part and no motion, and links to other sites only as ordinary links.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import { KIT_TEXT_EN } from '@/components/kit/text';
import type { Locale } from '@/lib/i18n/locale';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import {
  MARKETINGWS_COMMIT,
  MARKETINGWS_REPO,
  MarketingwsLinks,
  type MarketingwsCopy,
} from '../../../content/marketingws';
import { buildNoteText } from '../build-notes/copy';
import { keyed } from '../build-notes/slots';
import { NoteShot } from '../build-notes/NoteShot';
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep, NoteList, Paragraphs, TEXT } from '../build-notes/BuildNote';
import { marketingwsCopy } from './copy';

export const MARKETINGWS_TITLE = 'MarketingWS';

/** The sections in page order: the ones every build note shares. */
export const MARKETINGWS_SECTIONS = BUILD_NOTE_SECTIONS;

/**
 * One request, step by step: an ordered list of outlined steps, joined by short drawn connectors.
 * The list is the diagram's text and carries its order; the connectors are drawing only.
 */
function StepsDiagram({ steps, locale }: { steps: MarketingwsCopy['steps']; locale: Locale }) {
  return (
    <Figure
      kind="diagram"
      id="marketingws-steps"
      title={steps.title}
      caption={steps.caption}
      text={locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN}
    >
      <ol data-diagram="marketingws-steps" className="max-w-text">
        {steps.items.map((step, i) => (
          <li key={step.id} data-step={step.id}>
            {i > 0 ? <DiagramConnector /> : null}
            <DiagramStep name={step.name} detail={step.text} />
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function MarketingwsPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = marketingwsCopy(locale);
  const text = buildNoteText(locale);
  const code = `${MARKETINGWS_REPO}/tree/${MARKETINGWS_COMMIT}`;
  return (
    <BuildNote
      slug="marketingws"
      locale={locale}
      title={copy.h1}
      quiet={copy.quiet}
      intro={copy.intro}
      actions={[{ href: code, label: text.github, icon: 'github', external: true }]}
      glance={copy.glance}
      sections={{
        problem: <Paragraphs items={keyed(copy.problem)} />,
        architecture: (
          <>
            <div className={TEXT}>{copy.architecture}</div>
            <LeadIn label={text.leadIn}>{copy.shots.leadIn}</LeadIn>
            <FigureSheet label={text.screenshot}>
              {/* Side by side from lg, the brief beside the draft it produced; stacked below. */}
              <div data-shot-pair="" className="grid items-start gap-6 lg:grid-cols-[1fr_2.2fr] [&>figure]:mt-0">
                <NoteShot shot="marketingwsBrief" locale={locale} />
                <NoteShot shot="marketingwsDraft" locale={locale} />
              </div>
            </FigureSheet>
            <Takeaway label={text.takeaway}>{copy.shots.takeaway}</Takeaway>
            <FigureSheet>
              <StepsDiagram steps={copy.steps} locale={locale} />
            </FigureSheet>
          </>
        ),
        'how-i-checked-this': <Paragraphs items={keyed(copy.checks)} />,
        outcome: <Paragraphs items={keyed(copy.outcome)} />,
        limits: (
          <div className={TEXT}>
            <NoteList items={keyed(copy.limits)} />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <MarketingwsLinks copy={copy.links} />
          </div>
        ),
      }}
      close={{ body: <p>{copy.close}</p>, links: [{ href: code, label: text.github, external: true }] }}
    />
  );
}
