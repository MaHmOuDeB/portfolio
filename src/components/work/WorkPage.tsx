// The Work directory: every case study and build note, as lean cards in the groups of
// content/work.tsx and in its order (experiments and analytics, automation and agents, then the one
// data pipeline). It copies the golden page's frame (one h1 with a one-line intro, then one
// <section id> per group, each named by its own h2) and puts each group's cards in a list under an
// ink rule that draws on entry. Each card is a link: the title (an h3), the sourced line and the
// entry's type (case study or build note). No dates, figures or outcome numbers: each line is the
// page's own description, and its one figure is a Fact. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { LeanCard } from '@/components/depth/LeanCard';
import { prefetchFor } from '@/lib/nav';
import { HOME_CASES } from '../../../content/home.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';

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
        <h1 id="work-title" className="text-2xl font-semibold md:text-3xl">
          {WORK_TITLE}
        </h1>
        <p data-work-intro="" className="mt-4 text-lg text-muted">
          Experiments and analyses first, then the tools I&apos;ve built.
        </p>
      </div>

      {WORK_SECTIONS.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-title`}
          className="mt-12 max-w-figure md:mt-section"
        >
          <h2 id={`${section.id}-title`} className={`${TEXT} text-xl font-semibold`} data-depth-rise="heading">
            {section.label}
          </h2>
          <ul data-depth-draw="" className="mt-6 grid gap-4 border-t border-ink pt-6 md:grid-cols-2">
            {section.items.map((item) => (
              <li key={item.href} data-work-item={item.href}>
                <LeanCard href={item.href} title={item.title} meta={kindOf(item.href)} size="md" prefetch={prefetchFor(item.href)}>
                  {item.description}
                </LeanCard>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
