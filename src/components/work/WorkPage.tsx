// The Work directory: every case study and build note, as lean cards in the groups of
// content/work.tsx and in its order (experiments and analytics, automation and agents, then the one
// data pipeline), full width, then a tile that leads to the live test. It copies the golden page's
// frame (one h1 with a one-line intro, then one <section id> per group, each named by its own h2) and puts each group's cards in a list under an
// ink rule that draws on entry. Each card is a link: the title (an h3), the sourced line and the
// entry's type (case study or build note). No dates, figures or outcome numbers: each line is the
// page's own description, and its one figure is a Fact. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { LeanCard } from '@/components/depth/LeanCard';
import { Tile } from '@/components/depth/Tile';
import { Chip, PageHead, Quiet, SectionHead } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import {
  AgentsSketch,
  ChecksSketch,
  CohortsSketch,
  EventsSketch,
  ProcessSketch,
  VariantsSketch,
  WorkflowSketch,
} from '@/components/frame/sketches';
import { prefetchFor } from '@/lib/nav';
import { HOME_CASES, HOME_SITE } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { WORK_GROUPS, WORK_SITE, WORK_SITE_HEAD } from '../../../content/work.tsx';

export const WORK_TITLE = 'Work';

/** The groups in page order: the section's anchor id, its heading (the group label) and its items. */
export const WORK_SECTIONS = WORK_GROUPS;

const TEXT = 'max-w-text';

/**
 * Each entry's type, from data the site already has: the Home page's featured case studies are case
 * studies, and every other page here is a build note. No year: no fact holds one, and a year is a number.
 */
const CASE_HREFS: ReadonlySet<string> = new Set(HOME_CASES.map((c) => c.href));
const kindOf = (href: string): string => (CASE_HREFS.has(href) ? 'Case study' : 'Build note');

/** Each card's sketch: Home's sketch for the same project; Weather has its checks. */
const SKETCHES: Record<string, () => ReactNode> = {
  [HOME_LINKS.whySoMany]: ProcessSketch,
  [HOME_LINKS.retention]: CohortsSketch,
  [HOME_LINKS.pulse]: EventsSketch,
  [HOME_LINKS.docproof]: AgentsSketch,
  [HOME_LINKS.n8n]: WorkflowSketch,
  [HOME_LINKS.marketingws]: VariantsSketch,
  '/work/weather': ChecksSketch,
};

function vignette(href: string): ReactNode {
  const Sketch = SKETCHES[href];
  return Sketch ? <Sketch /> : undefined;
}

const CHIPS: Record<string, string> = {
  experimentation: 'Experiments',
  automation: 'Automation',
  pipelines: 'Pipelines',
};

export function WorkPage(): ReactNode {
  return (
    <article aria-labelledby="work-title">
      <PageHead
        id="work-title"
        chip={WORK_TITLE}
        title="Open the work"
        quiet="and see how it was done."
        sub={<span data-work-intro="">Experiments and analyses first, then the tools and pipelines I&apos;ve built.</span>}
      />

      {WORK_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} data-rule="">
          <div data-work-head="">
            <SectionHead
              id={`${section.id}-title`}
              chip={CHIPS[section.id] ?? section.label}
              title={section.label}
              sub={section.lede ? <span data-work-lede="">{section.lede}</span> : undefined}
              align="split"
            />
          </div>
          {/* The rule that draws on entry is its own decorative element, so the cards are never scaled with it. */}
          <span data-depth-draw="" aria-hidden="true" className="block h-px bg-hairline" />
          <ul className="grid grid-cols-1 gap-4 pb-12 pt-8 md:grid-cols-2 md:pb-16 lg:grid-cols-3">
            {section.items.map((item) => (
              <li key={item.href} data-work-item={item.href} className="grid grid-cols-1">
                <LeanCard
                  href={item.href}
                  title={item.title}
                  meta={kindOf(item.href)}
                  size="md"
                  prefetch={prefetchFor(item.href)}
                  vignette={vignette(item.href)}
                >
                  {item.description}
                </LeanCard>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div data-rule="" className="pb-12 pt-12 md:pb-16 md:pt-16">
        <Tile data-work-site="" data-depth-rise="">
          <Chip dot="live">Live test</Chip>
          <h2 className="mt-4.5 max-w-[22em] text-h2-sm md:text-h2">
            {WORK_SITE_HEAD.lead} <Quiet>{WORK_SITE_HEAD.quiet}</Quiet>
          </h2>
          <p className={`mt-3.5 ${TEXT} text-muted`}>{WORK_SITE.text}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href={HOME_LINKS.experiment} variant="primary">
              {HOME_SITE.live}
            </ButtonLink>
          </div>
        </Tile>
      </div>

      <PageCallToAction />
    </article>
  );
}
