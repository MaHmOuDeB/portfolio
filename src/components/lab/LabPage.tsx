// The Lab: four ways an A/B test can mislead and how I catch each one, as one reading page in the
// order of a test's life (sample size, split check, peeking, the winner's curse). The head says what the page is
// for; four cards, each with a small sketch, link to the four sections; each section is the short
// label as a chip, the question as its h2, the trap (one everyday picture of the mistake) and one
// exhibit in the reading model: a sentence on what to try, the Figure on its sheet, a sentence on what I do about it and the method one click deeper. Then
// what the examples cannot show, what the page shows about how I work, and the shared call to action.
// Every number is in the exhibits (simulated, or computed from values the visitor sets); the page's
// own copy is plain words (content/lab.tsx).
//
// The section anchors differ from the Figure ids, so both can be linked: `/lab#sample-size` lands on
// a section heading, `/lab#peeking` on the peeking Figure itself. `LabPeekingPage` is the peeking
// example alone, the page `/lab/peeking` mounts: the same PeekingFigure (id `peeking`, so its URL
// state and the interview link `?peeking.preset=interview` are the same) under its own headline, with
// a link back to the whole Lab. Both are server components; each Figure loads its own island.
import type { ReactNode } from 'react';
import { LeanCard } from '@/components/depth/LeanCard';
import { PeekingFigure } from '@/components/figures/PeekingFigure';
import { Chip, LeadIn, PageClose, SECTION_H2 } from '@/components/frame';
import { Derived } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { labCopy } from '@/lib/lab/copy';
import { sentenceNodes } from '@/lib/retention/sentence';
import { FRAME_DE } from '../../../content/de/frame';
import type { LabSectionId } from '../../../content/lab';
import { CurseFigure } from './CurseFigure';
import { FullPlanner } from './FullPlanner';
import { LAB_SKETCHES } from './LabSketches';
import { CURSE_PRESET_LINK } from '@/lib/lab/diagnostics-values';
import { FULL_PLANNER_REFS, PLANNER_PRESET_HREF, PLANNER_PRESET_RISE } from '@/lib/lab/full-planner-values';
import { PEEK_PRESET_LINKS } from '@/lib/lab/peeking-values';
import { PresetLinks, SrmEvenLink, SrmFigure } from './SrmFigure';

/** The document's title (the tab and the search result). The h1 says what the page is for. */
export const LAB_TITLE = 'Lab';

const TEXT = 'max-w-text';
const BAND = 'mt-12 pt-12 md:mt-16 md:pt-16';

/**
 * One check: the short label as a chip, the question as the h2, the trap in the frame's lead-in, then
 * the exhibit, which its Figure renders itself (the sentence above, the Figure on its sheet, the
 * sentence below, the method row).
 */
function Section({ id, chip = true, locale, children }: { id: LabSectionId; chip?: boolean; locale: Locale; children: ReactNode }) {
  const page = labCopy(locale).page;
  const entry = page.sections.find((s) => s.id === id);
  if (!entry) throw new Error(`lab: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className={BAND}>
      {chip ? <Chip>{entry.label}</Chip> : null}
      <h2 id={`${id}-title`} className={`${TEXT} ${chip ? 'mt-4 ' : ''}${SECTION_H2}`}>
        {entry.question}
      </h2>
      <LeadIn label={page.trapLabel}>{entry.trap}</LeadIn>
      {children}
    </section>
  );
}

/**
 * The four checks as cards, in the order of a test's life: when the check comes, the question, one
 * line and a sketch. Each card links to its section. The step number is the card's place in the list.
 */
function Checks({ locale }: { locale: Locale }) {
  const page = labCopy(locale).page;
  return (
    <nav aria-label={locale === 'de' ? FRAME_DE.sectionNav : 'On this page'} data-lab-checks="" className="mt-8">
      <h2 id="lab-checks-title" className="sr-only">
        {page.checksTitle}
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {page.sections.map((s, i) => {
          const Sketch = LAB_SKETCHES[s.figure];
          return (
            <li key={s.id} data-lab-check={s.id} className="grid grid-cols-1 [&>a]:px-5.5 [&>a]:pt-5.5">
              <LeanCard
                href={`#${s.id}`}
                idBase={`check-${s.id}`}
                size="md"
                data-touch-target=""
                title={
                  <>
                    <span data-lab-check-when="" className="mb-1.5 block text-xs font-medium tracking-normal text-muted">
                      <Derived value={i + 1} unit="count" refs={['build']} locale={locale} /> {s.when}
                    </span>
                    {s.question}
                  </>
                }
                meta={s.id === page.start.id ? <Chip>{page.start.chip}</Chip> : null}
                vignette={locale === 'de' ? <Sketch text={page.sketch} /> : <Sketch />}
              >
                {s.line}
              </LeanCard>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function LabPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = labCopy(locale);
  const { page } = copy;
  /** The planner's place in the list of checks, as its card numbers it. */
  const plannerCheck = page.sections.findIndex((s) => s.figure === 'planner') + 1;
  return (
    <article aria-labelledby="lab-title">
      <CaseHead id="lab-title" chip={page.head.chip} title={page.head.title} quiet={page.head.quiet} intro={<p>{page.intro}</p>} />
      <Checks locale={locale} />
      <Section id="sample-size" locale={locale}>
        <FullPlanner locale={locale} />
        <PresetLinks
          links={[
            {
              href: PLANNER_PRESET_HREF,
              label: sentenceNodes(page.plannerLink, {
                rise: <Derived value={PLANNER_PRESET_RISE} unit="count" refs={FULL_PLANNER_REFS} locale={locale} />,
              }),
            },
          ]}
        />
      </Section>
      <Section id="split-check" locale={locale}>
        <SrmFigure locale={locale} />
        <SrmEvenLink locale={locale} />
      </Section>
      <Section id="peeking-at-results" locale={locale}>
        <PeekingFigure locale={locale} />
        <PresetLinks links={peekLinks(copy.peek)} />
      </Section>
      <Section id="exaggeration" locale={locale}>
        <CurseFigure locale={locale} />
        <PresetLinks
          links={[
            {
              href: CURSE_PRESET_LINK.href,
              // "check 1": the planner's place in the list of checks, the number its card prints
              label: sentenceNodes(copy.curse.presetLink, {
                check: <Derived value={plannerCheck} unit="count" refs={['build']} locale={locale} />,
              }),
            },
          ]}
        />
      </Section>
      <section id="limits" aria-labelledby="limits-title" data-rule="" className={BAND}>
        <h2 id="limits-title" className={`${TEXT} ${SECTION_H2}`}>
          {page.limitsTitle}
        </h2>
        <div className={`${TEXT} mt-4`}>
          <ul className="list-disc pl-5">
            {page.limits.map((item) => (
              <li key={item} className="mt-2 first:mt-0">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <PageClose
        id="lab-close"
        links={page.closeLinks.map((link) => ({ ...link, href: localHref(locale, link.href) }))}
        {...(locale === 'de' ? { title: FRAME_DE.pageClose } : {})}
      >
        <p>{page.close}</p>
      </PageClose>
      <div className="mt-12 md:mt-16">
        {locale === 'de' ? <PageCallToAction locale={locale} /> : <PageCallToAction />}
      </div>
    </article>
  );
}

/** The links under the peeking exhibit: the same setting with each fix. */
function peekLinks(peek: { presetLinks: { obf: string; cs: string } }) {
  return PEEK_PRESET_LINKS.map((link, i) => ({ href: link.href, label: i === 0 ? peek.presetLinks.obf : peek.presetLinks.cs }));
}

/** The peeking example on its own page: the same exhibit as on the Lab, and a link to the rest. */
export function LabPeekingPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = labCopy(locale);
  const { page } = copy;
  return (
    <article aria-labelledby="lab-title">
      <CaseHead
        id="lab-title"
        chip={page.peekingHead.chip}
        title={page.peekingHead.title}
        quiet={page.peekingHead.quiet}
        intro={<p>{page.peekingIntro}</p>}
      />
      <Section id="peeking-at-results" chip={false} locale={locale}>
        <PeekingFigure locale={locale} />
        <PresetLinks links={peekLinks(copy.peek)} />
      </Section>
      <div className={`${TEXT} mt-8 pb-12 md:pb-16`}>
        <TextLink href={localHref(locale, '/lab')} standalone>
          {page.allExamples}
        </TextLink>
      </div>
    </article>
  );
}
