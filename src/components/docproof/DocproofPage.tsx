// The Docproof build note, in the shared build-note frame (../build-notes/BuildNote.tsx). It leads
// with its best exhibit, one recorded run of the verify check under "How I checked this" (how the
// tools themselves are tested sits one click deeper), then the problem, the architecture with its
// diagram, the outcome, the limits and the sources and links. The prose comes from
// content/docproof.tsx. A plain static page: no Figure here has data, so the diagram is a diagram
// Figure with no badge, table or controls.
import type { ReactNode } from 'react';
import { FigureSheet, LeadIn, MethodDetails, Takeaway } from '@/components/frame';
import { Figure } from '@/components/kit/Figure';
import { KIT_TEXT_EN } from '@/components/kit/text';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import {
  DOCPROOF_REPO,
  DocproofLinks,
  DocproofRunEvidence,
  RunLeadIn,
  VERIFY_RUN,
} from '../../../content/docproof';
import { buildNoteText } from '../build-notes/copy';
import { keyed } from '../build-notes/slots';
import { BUILD_NOTE_SECTIONS, BuildNote, DiagramConnector, DiagramStep, NoteList, Paragraphs, TEXT } from '../build-notes/BuildNote';
import { docproofCopy } from './copy';

/** The document title (content/seo.ts); the h1 is DOCPROOF_H1 with its quiet clause. */
export const DOCPROOF_TITLE = 'Docproof: agents write, checks decide';

/** The sections in page order: the recorded run first, then the rest in the shared order. */
export const DOCPROOF_SECTIONS = [
  ...BUILD_NOTE_SECTIONS.filter((s) => s.id === 'how-i-checked-this'),
  ...BUILD_NOTE_SECTIONS.filter((s) => s.id !== 'how-i-checked-this'),
];

/** Input, orchestration, checks and report, as an ordered list of outlined stages. */
export function DocproofDiagram({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const { diagram } = docproofCopy(locale);
  return (
    <Figure
      kind="diagram"
      id="docproof-architecture"
      title={diagram.title}
      caption={diagram.caption}
      text={locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN}
    >
      <ol data-diagram="docproof-architecture" className="grid max-w-text gap-0">
        {diagram.stages.map((s, i) => (
          <li key={s.id} data-stage={s.id} className="min-w-0">
            {i > 0 ? <DiagramConnector /> : null}
            <DiagramStep name={s.name} detail={s.body} />
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function DocproofPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = docproofCopy(locale);
  const text = buildNoteText(locale);
  return (
    <BuildNote
      slug="docproof"
      locale={locale}
      title={copy.h1}
      quiet={copy.quiet}
      intro={copy.intro}
      actions={[{ href: DOCPROOF_REPO, label: text.github, icon: 'github', external: true }]}
      glance={copy.glance}
      lead="how-i-checked-this"
      sections={{
        'how-i-checked-this': (
          <>
            <LeadIn label={text.leadIn}>
              <RunLeadIn copy={copy.run} />
            </LeadIn>
            <FigureSheet label={copy.run.sheetLabel}>
              <DocproofRunEvidence run={VERIFY_RUN} copy={copy.run} locale={locale} />
            </FigureSheet>
            <Takeaway label={text.takeaway}>{copy.run.takeaway}</Takeaway>
            <MethodDetails summary={copy.verificationSummary}>{copy.verification}</MethodDetails>
          </>
        ),
        problem: <Paragraphs items={keyed(copy.problem)} />,
        architecture: (
          <>
            <Paragraphs items={keyed(copy.architecture)} />
            <FigureSheet>
              <DocproofDiagram locale={locale} />
            </FigureSheet>
          </>
        ),
        outcome: <div className={TEXT}>{copy.outcome}</div>,
        limits: (
          <div className={TEXT}>
            <NoteList items={keyed(copy.limits)} />
          </div>
        ),
        sources: (
          <div className={TEXT}>
            <DocproofLinks copy={copy.links} workHref={localHref(locale, '/work')} />
          </div>
        ),
      }}
      close={{ body: <p>{copy.close}</p>, links: [{ href: DOCPROOF_REPO, label: text.github, external: true }] }}
    />
  );
}
