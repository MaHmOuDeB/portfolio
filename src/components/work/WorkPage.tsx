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
import { ButtonLink } from '@/components/kit/ButtonLink';
import { prefetchFor } from '@/lib/nav';
import { HOME_CASES, HOME_SITE } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { WORK_GROUPS, WORK_SITE } from '../../../content/work.tsx';

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

export function WorkPage(): ReactNode {
  return (
    <article aria-labelledby="work-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="work-title" className="text-display-sm font-semibold md:text-display">
          {WORK_TITLE}
        </h1>
        <p data-work-intro="" className="mt-4 text-lg text-muted">
          Experiments and analyses first, then the tools I&apos;ve built.
        </p>
      </div>

      {WORK_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="mt-16 md:mt-section">
          <h2
            id={`${section.id}-title`}
            className={`${TEXT} text-2xl font-semibold md:text-display-sm`}
            data-depth-rise="heading"
          >
            {section.label}
          </h2>
          {section.lede ? (
            <p data-work-lede="" className={`mt-4 ${TEXT} text-lg text-muted`}>
              {section.lede}
            </p>
          ) : null}
          {/* The rule that draws on entry is its own decorative element, so the cards are never scaled with it. */}
          <span data-depth-draw="" aria-hidden="true" className="mt-8 block h-px bg-ink" />
          <ul className="grid gap-6 pt-8 md:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => (
              <li key={item.href} data-work-item={item.href} className="grid">
                <LeanCard href={item.href} title={item.title} meta={kindOf(item.href)} size="md" prefetch={prefetchFor(item.href)}>
                  {item.description}
                </LeanCard>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="mt-16 md:mt-section">
      <Tile data-work-site="" data-depth-rise="">
        <h2 className={`${TEXT} text-2xl font-semibold md:text-display-sm`}>{WORK_SITE.title}</h2>
        <p className={`mt-4 ${TEXT} text-lg`}>{WORK_SITE.text}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={HOME_LINKS.experiment} variant="primary">
            {HOME_SITE.live}
          </ButtonLink>
        </div>
      </Tile>
      </div>
    </article>
  );
}
