// The Audible case study, in the reading model of the inner pages: the title and a plain opening with
// one action, the glance card (three pull figures, one sentence, the facts with the scope), the
// in-page links, then one <section> per part with its own h2. The exhibits come first: the ship rule
// with its Figure between a lead-in and a takeaway, why so many recommendations were adopted, the
// tool I built with its two timings. Then the method (what I did myself in view,
// the rest in details rows one click deeper), the limits, and the sources. The page closes on what
// it shows about how I work, the next project, and the shared call to action. The prose comes from
// content/audible.tsx (English) and content/de/audible.tsx (German), picked by `locale`.
//
// Layout: prose sits in the readable column (max-w-text); the Figure and the two timings sit in a
// figure sheet that runs the full rail. Nothing here moves. No result of any real test is on this
// page: the ship-rule Figure is a made-up product with typed-in bounds and carries the "Simulated"
// badge; the two timings are my own, approximate, and say so.
import type { ReactNode } from 'react';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { factText } from '@/lib/facts/text';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT_HREF } from '@/lib/site';
import { AUDIBLE_EN, AUDIBLE_SECTION_IDS, blocks, slotsFor, type AudibleSectionId } from '../../../content/audible';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { FrameworkFigure } from './FrameworkFigure';
import { audibleCopy } from './copy';

/** The words of the h1 after its figure, and the quiet clause that follows them. */
export const AUDIBLE_HEAD = AUDIBLE_EN.head;

/**
 * The page's title as a string, for places that cannot render a <Fact> (the sharing card): the h1's
 * lead, with the test count printed from its fact exactly as the h1 prints it.
 */
export const AUDIBLE_TITLE = `${factText('profile.audible.experiments')} ${AUDIBLE_HEAD.lead}`;

/** The sections in page order: anchor id, heading and the short label of its in-page link (in English). */
export const AUDIBLE_SECTIONS = AUDIBLE_SECTION_IDS.map((id) => ({ id, ...AUDIBLE_EN.sections[id] }));

const PROSE = 'mt-4 max-w-text';

/** Prose in the readable column. */
function Prose({ children }: { children: ReactNode }) {
  return <div className={PROSE}>{children}</div>;
}

export function AudiblePage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const c = audibleCopy(locale);
  const s = slotsFor(locale);
  const b = blocks(c, s);
  const frame = c.frame;
  /** A ruled section named by its own h2. Its children sit directly in it, so a figure sheet can run the full rail. */
  const section = (id: AudibleSectionId, children: ReactNode) => (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`max-w-text ${SECTION_H2}`} data-depth-rise="heading">
        {c.sections[id].title}
      </h2>
      {children}
    </section>
  );
  return (
    <article aria-labelledby="audible-title">
      <CaseHead
        id="audible-title"
        chip={c.chip}
        title={
          <>
            {s.tests} {c.head.lead},
          </>
        }
        quiet={c.head.quiet}
        intro={b.intro()}
        actions={[{ href: s.href(CONTACT_HREF), label: c.ask }]}
      />

      <GlanceBlock {...b.glance()} labels={c.glanceLabels} />

      <SectionNav label={frame.sectionNav} items={AUDIBLE_SECTION_IDS.map((id) => ({ href: `#${id}`, label: c.sections[id].link }))} />

      {section(
        'ship-rule',
        <>
          <Prose>{b.shipRule()}</Prose>
          <LeadIn label={frame.leadIn}>{c.shipLeadIn}</LeadIn>
          <FigureSheet>
            <FrameworkFigure locale={locale} />
          </FigureSheet>
          <Takeaway label={frame.takeaway}>{c.shipTakeaway}</Takeaway>
        </>,
      )}

      {section(
        'why-so-many',
        <Prose>{b.whySoMany()}</Prose>,
      )}

      {section(
        'automation',
        <>
          <Prose>{b.automation()}</Prose>
          <FigureSheet>{b.setupStats()}</FigureSheet>
          <Prose>{b.adoption()}</Prose>
        </>,
      )}

      {section(
        'method',
        <>
          <Prose>{b.method()}</Prose>
          <MethodDetails summary={c.summaries.teams}>{b.teams()}</MethodDetails>
          {/* The anchor other pages may link to sits on the row's summary, which is always in view. */}
          <MethodDetails summary={<span id="how-i-checked-this">{c.summaries.checked}</span>}>{b.checks()}</MethodDetails>
          <MethodDetails summary={c.summaries.data}>{b.data()}</MethodDetails>
        </>,
      )}

      {section('limits', <Prose>{b.limits()}</Prose>)}

      {section('sources', <Prose>{b.links()}</Prose>)}

      <PageClose
        title={frame.pageClose}
        links={[
          { href: s.href(HOME_LINKS.lab), label: c.closeLinks.lab },
          { href: s.href(HOME_LINKS.experiment), label: c.closeLinks.live },
        ]}
      >
        {b.close()}
      </PageClose>
      <NextRow label={frame.nextRow} next={{ href: s.href(HOME_LINKS.retention), label: c.next.label, kicker: c.next.kicker }} />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction locale={locale} />
    </article>
  );
}
