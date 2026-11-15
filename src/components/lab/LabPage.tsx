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
import {
  LAB_CLOSE_LINKS,
  LAB_HEAD,
  LAB_LIMITS_TITLE,
  LAB_PEEKING_HEAD,
  LAB_SECTIONS,
  LAB_START,
  LabClose,
  LabIntro,
  LabLimits,
  LabPeekingIntro,
} from '../../../content/lab';
import { CurseFigure } from './CurseFigure';
import { FullPlanner } from './FullPlanner';
import { LAB_SKETCHES } from './LabSketches';
import { CURSE_PRESET_LINK } from '@/lib/lab/diagnostics-values';
import { FULL_PLANNER_REFS, PLANNER_PRESET_HREF, PLANNER_PRESET_RISE } from '@/lib/lab/full-planner-values';
import { PEEK_PRESET_LINKS } from '@/lib/lab/peeking-values';
import { PresetLinks, SrmEvenLink, SrmFigure } from './SrmFigure';

/** The document's title (the tab and the search result). The h1 says what the page is for. */
export const LAB_TITLE = 'Lab';

type SectionId = (typeof LAB_SECTIONS)[number]['id'];

/** The planner's place in the list of checks, as its card numbers it. */
const PLANNER_CHECK = LAB_SECTIONS.findIndex((s) => s.figure === 'planner') + 1;

const TEXT = 'max-w-text';
/** The label of the sentence under each check's h2. */
const LAB_TRAP_LABEL = 'The trap';
const BAND = 'mt-12 pt-12 md:mt-16 md:pt-16';

/**
 * One check: the short label as a chip, the question as the h2, the trap in the frame's lead-in, then
 * the exhibit, which its Figure renders itself (the sentence above, the Figure on its sheet, the
 * sentence below, the method row).
 */
function Section({ id, chip = true, children }: { id: SectionId; chip?: boolean; children: ReactNode }) {
  const entry = LAB_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`lab: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className={BAND}>
      {chip ? <Chip>{entry.label}</Chip> : null}
      <h2 id={`${id}-title`} className={`${TEXT} ${chip ? 'mt-4 ' : ''}${SECTION_H2}`}>
        {entry.question}
      </h2>
      <LeadIn label={LAB_TRAP_LABEL}>{entry.trap}</LeadIn>
      {children}
    </section>
  );
}

/**
 * The four checks as cards, in the order of a test's life: when the check comes, the question, one
 * line and a sketch. Each card links to its section. The step number is the card's place in the list.
 */
function Checks() {
  return (
    <nav aria-label="On this page" data-lab-checks="" className="mt-8">
      <h2 id="lab-checks-title" className="sr-only">
        The four checks
      </h2>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LAB_SECTIONS.map((s, i) => {
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
                      <Derived value={i + 1} unit="count" refs={['build']} /> {s.when}
                    </span>
                    {s.question}
                  </>
                }
                meta={s.id === LAB_START.id ? <Chip>{LAB_START.chip}</Chip> : null}
                vignette={<Sketch />}
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

export function LabPage(): ReactNode {
  return (
    <article aria-labelledby="lab-title">
      <CaseHead id="lab-title" chip={LAB_HEAD.chip} title={LAB_HEAD.title} quiet={LAB_HEAD.quiet} intro={<LabIntro />} />

      <Checks />

      <Section id="sample-size">
        <FullPlanner />
        <PresetLinks
          links={[
            {
              href: PLANNER_PRESET_HREF,
              label: (
                <>
                  Try a smaller rise: <Derived value={PLANNER_PRESET_RISE} unit="count" refs={FULL_PLANNER_REFS} /> points
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="split-check">
        <SrmFigure />
        <SrmEvenLink />
      </Section>

      <Section id="peeking-at-results">
        <PeekingFigure />
        <PresetLinks links={PEEK_PRESET_LINKS} />
      </Section>

      <Section id="exaggeration">
        <CurseFigure />
        <PresetLinks
          links={[
            {
              href: CURSE_PRESET_LINK.href,
              // "check 1": the planner's place in the list of checks, the number its card prints
              label: (
                <>
                  {CURSE_PRESET_LINK.label} <Derived value={PLANNER_CHECK} unit="count" refs={['build']} />
                </>
              ),
            },
          ]}
        />
      </Section>

      <section id="limits" aria-labelledby="limits-title" data-rule="" className={BAND}>
        <h2 id="limits-title" className={`${TEXT} ${SECTION_H2}`}>
          {LAB_LIMITS_TITLE}
        </h2>
        <div className={`${TEXT} mt-4`}>
          <LabLimits />
        </div>
      </section>

      <PageClose id="lab-close" links={LAB_CLOSE_LINKS}>
        <LabClose />
      </PageClose>

      <div className="mt-12 md:mt-16">
        <PageCallToAction />
      </div>
    </article>
  );
}

/** The peeking example on its own page: the same exhibit as on the Lab, and a link to the rest. */
export function LabPeekingPage(): ReactNode {
  return (
    <article aria-labelledby="lab-title">
      <CaseHead
        id="lab-title"
        chip={LAB_PEEKING_HEAD.chip}
        title={LAB_PEEKING_HEAD.title}
        quiet={LAB_PEEKING_HEAD.quiet}
        intro={<LabPeekingIntro />}
      />

      <Section id="peeking-at-results" chip={false}>
        <PeekingFigure />
        <PresetLinks links={PEEK_PRESET_LINKS} />
      </Section>

      <div className={`${TEXT} mt-8 pb-12 md:pb-16`}>
        <TextLink href="/lab" standalone>
          All the examples in the Lab
        </TextLink>
      </div>
    </article>
  );
}
