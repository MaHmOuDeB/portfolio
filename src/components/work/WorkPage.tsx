// The Work directory: every case study and build note, as even cards in the two groups of
// content/work.tsx and in its order (experiments and analytics, then automation and agents), four
// cards each, two across from md, so no card is left alone in a row. Then a tile that leads to the
// live test. It copies the golden page's frame: one h1 with its intro, then one <section id> per
// group, each named by its own h2, with its cards in a list under an ink rule that draws on entry.
//
// Each card is one link, in the Home card pattern: a provenance chip, the title (an h3), one bold
// "Shows:" sentence, one plain line, then the project's sketch. The link is named by the title and
// described by the paragraph, which holds the chip, so a screen reader hears where the work comes
// from; the paragraph lays its parts out in the card (display: contents), and the chip is ordered
// first, above the title. No dates and no outcome numbers: a figure in a line is a Fact.
// After the page head comes "How I test" (moved from Home), and the Automation group ends with the
// three "I automate." lines. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { LeanCard } from '@/components/depth/LeanCard';
import { Tile } from '@/components/depth/Tile';
import { Chip, PageHead, Quiet, SectionHead } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { AutomateRow } from '@/components/home/AutomateRow';
import { HowITest } from '@/components/home/HowITest';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import {
  AgentsSketch,
  ChecksSketch,
  CohortsSketch,
  ConfidenceSketch,
  EventsSketch,
  ProcessSketch,
  StepsSketch,
  VariantsSketch,
  WorkflowSketch,
  type SketchProps,
} from '@/components/frame/sketches';
import { CallToAction } from '@/components/frame';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import type { SketchText } from '../../../content/home.ts';
import { prefetchFor } from '@/lib/nav';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';
import { homeCopy } from '@/components/home/copy';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';
import { workCopy } from './copy';

export const WORK_TITLE = 'Work';

/** The groups in page order: the section's anchor id, its heading (the group label) and its items. */
export const WORK_SECTIONS = WORK_GROUPS;

const TEXT = 'max-w-text';

/** Each card's sketch: Home's sketch for the same project; Weather has its checks. */
const SKETCHES: Record<string, (props: SketchProps) => ReactNode> = {
  '/work/audible': ProcessSketch,
  [HOME_LINKS.retention]: CohortsSketch,
  [HOME_LINKS.pulse]: EventsSketch,
  '/work/weather': ChecksSketch,
  [HOME_LINKS.automation]: StepsSketch,
  [HOME_LINKS.docproof]: AgentsSketch,
  [HOME_LINKS.n8n]: WorkflowSketch,
  [HOME_LINKS.marketingws]: VariantsSketch,
};

function vignette(href: string, text: SketchText): ReactNode {
  const Sketch = SKETCHES[href];
  return Sketch ? <Sketch text={text} /> : undefined;
}

/**
 * The card's cell. The card's paragraph gives its three parts to the card's own column, and the
 * card's meta line is empty here, so it is not drawn.
 */
const CARD_CELL = 'grid grid-cols-1 [&_p]:contents [&_[data-depth-meta]]:hidden';

/**
 * The closing call to action. English is the shared one; a page with its own words (German) draws the
 * same ruled band around the frame's panel.
 */
function Cta({ copy, locale }: { copy: NonNullable<ReturnType<typeof workCopy>['cta']>; locale: Locale }) {
  return (
    <div data-rule="" data-page-cta="" className="print:hidden pb-12 pt-12 md:pb-16 md:pt-16">
      <CallToAction
        id="page-cta-title"
        title={copy.title}
        quiet={copy.quiet}
        line={copy.line}
        primary={{ label: copy.write, href: localHref(locale, CONTACT_HREF) }}
        secondary={{ label: copy.cv, href: localHref(locale, CV_LINK.href) }}
        tertiary={{ label: copy.linkedin, href: CONTACT.linkedin, external: true }}
      />
    </div>
  );
}

export function WorkPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const copy = workCopy(locale);
  const sketches = homeCopy(locale).sketches;
  return (
    <article aria-labelledby="work-title">
      <PageHead
        id="work-title"
        chip={copy.title}
        title={copy.head.title}
        quiet={copy.head.quiet}
        sub={
          <>
            <span data-work-intro="">{copy.head.intro}</span>
            <span data-work-kinds="" className="mt-2 block text-sm">
              {copy.head.kinds}
            </span>
          </>
        }
      />

      <HowITest locale={locale} />

      {copy.groups.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} data-rule="">
          <div data-work-head="">
            <SectionHead id={`${section.id}-title`} chip={section.kind} title={section.label} align="left" />
          </div>
          {/* The rule that draws on entry is its own decorative element, so the cards are never scaled with it. */}
          <span data-depth-draw="" aria-hidden="true" className="block h-px bg-hairline" />
          <ul role="list" className={`grid grid-cols-1 gap-4 pt-8 md:grid-cols-2 ${section.id === 'automation' ? 'pb-4' : 'pb-12 md:pb-16'}`}>
            {section.items.map((item) => (
              <li key={item.href} data-work-item={item.href} className={CARD_CELL}>
                <LeanCard
                  href={localHref(locale, item.href)}
                  title={item.title}
                  meta={null}
                  size="md"
                  prefetch={prefetchFor(item.href)}
                  vignette={vignette(item.href, sketches)}
                >
                  {/* pr-9 keeps the chip clear of the card's "+" at the top right, as the title is. */}
                  <span data-work-chip="" className="order-first mb-3.5 self-start pr-9">
                    <Chip>{item.chip}</Chip>
                  </span>
                  <strong data-work-shows="" className="mt-2.5 font-semibold text-ink">
                    {copy.shows}
                    {item.shows}
                  </strong>
                  <span data-work-line="" className="mt-1.5 pb-6">
                    {item.description}
                  </span>
                </LeanCard>
              </li>
            ))}
          </ul>
          {/* The "I automate." row ends the Automation group, then the group's own space below. */}
          {section.id === 'automation' ? (
            <div className="pb-12 md:pb-16">
              <AutomateRow locale={locale} />
            </div>
          ) : null}
        </section>
      ))}

      <div data-rule="" className="pb-12 pt-12 md:pb-16 md:pt-16">
        <Tile data-work-site="">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Chip dot="live">{copy.site.chip}</Chip>
              <h2 className="mt-4.5 max-w-[22em] text-h2-sm md:text-h2">
                {copy.site.lead} <Quiet>{copy.site.quiet}</Quiet>
              </h2>
              <p className={`mt-3.5 ${TEXT} text-muted`}>{copy.site.text}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <ButtonLink href={localHref(locale, HOME_LINKS.experiment)} variant="primary">
                  {copy.site.live}
                </ButtonLink>
              </div>
            </div>
            {/* The sketch turns in on its centre to its resting tilt as it enters, then leans a little to a
                fine pointer with a sheen that follows it (the Turn family). Its band is never drawn on: a
                band that grows would read as live data. Decorative, so hidden from assistive technology. */}
            <div
              data-work-site-sketch=""
              data-depth-turn=""
              data-depth-follow=""
              aria-hidden="true"
              className="overflow-clip rounded-xl border border-hairline lg:transform-[perspective(56rem)_rotateY(-14deg)_rotateX(6deg)]"
            >
              <div data-site-sketch="" className="[&>[data-vignette]]:h-60 [&>[data-vignette]]:border-t-0">
                <ConfidenceSketch text={sketches} />
              </div>
            </div>
          </div>
        </Tile>
      </div>

      {copy.cta === null ? <PageCallToAction /> : <Cta copy={copy.cta} locale={locale} />}
    </article>
  );
}
