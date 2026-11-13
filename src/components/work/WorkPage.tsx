// The Work directory: every case study and build note, in the two groups of content/work.tsx and in
// its order (the live test, Audible, Retention and Pulse, then the tools, n8n last). It copies the
// golden page's frame (one h1 with a one-line intro, then one <section id> per part, each named by
// its own h2) and a ruled list under an ink rule: each row is the interval glyph as its marker, the
// title as the row's one link (an h3, in ink), the entry's type under it (case study or build note)
// and the sourced line beside it from 768 px up, in muted grey. No dates, cards, figures or outcome
// numbers: each line is the page's own description, and its one figure is a Fact. Server-safe, no
// hooks.
import type { ReactNode } from 'react';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { HOME_CASES } from '../../../content/home.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';
import { TitleLink } from '../links/TitleLink';

export const WORK_TITLE = 'Work';

/** The anchor id of each group, by its label, so a reordered group keeps its own anchor. */
const SECTION_IDS: Readonly<Record<string, string>> = {
  'Experimentation & analytics': 'experimentation',
  "Tools I've built": 'tools',
};

/** The groups in page order: the section's anchor id and its heading (the group label). */
export const WORK_SECTIONS = WORK_GROUPS.map((group) => {
  const id = SECTION_IDS[group.label];
  if (!id) throw new Error(`work: no section id for group "${group.label}"`);
  return { id, label: group.label, items: group.items };
});

/**
 * The row marker's width: the phone header's 28 px glyph (same bar, caps, dot and halo), so a short
 * title keeps one line beside it at 375 px. Decorative beside a title, so aria-hidden.
 */
const MARKER_LENGTH = 28;

const TEXT = 'max-w-text';

/**
 * Each entry's type, from data the site already has: the Home page's featured case studies, and the
 * "Tools I've built" group, whose pages are build notes. The live test is neither, so it has none. No
 * year: no fact holds one, and a year is a number.
 */
const CASE_HREFS: ReadonlySet<string> = new Set(HOME_CASES.map((c) => c.href));
function kindOf(sectionId: string, href: string): string | null {
  if (CASE_HREFS.has(href)) return 'Case study';
  return sectionId === 'tools' ? 'Build note' : null;
}

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
          <h2 id={`${section.id}-title`} className={`${TEXT} text-xl font-semibold`}>
            {section.label}
          </h2>
          <ul className="mt-6 border-t border-ink">
            {section.items.map((item) => {
              const kind = kindOf(section.id, item.href);
              return (
                <li
                  key={item.href}
                  data-work-item={item.href}
                  className="grid gap-y-1 border-b border-line py-4 md:grid-cols-12 md:gap-x-8 md:py-6"
                >
                  <h3 className="text-lg font-semibold md:col-span-5 md:col-start-1">
                    <TitleLink href={item.href}>
                      {/* One flex item, so the marker sits on the title's first line; a wrapped line hangs
                          under the title, not under the marker (28 px glyph + 12 px gap = 40 px). */}
                      <span className="pl-10 -indent-10">
                        <span data-work-glyph="" className="mr-3 inline-flex align-middle">
                          <IntervalGlyph length={MARKER_LENGTH} />
                        </span>
                        <span data-work-title="">{item.title}</span>
                      </span>
                    </TitleLink>
                  </h3>
                  {kind ? (
                    <p data-work-kind="" className="pl-10 text-sm text-muted md:col-span-5 md:col-start-1 md:row-start-2">
                      {kind}
                    </p>
                  ) : null}
                  <p className={`${TEXT} text-base text-muted md:col-span-7 md:col-start-6 md:row-span-2 md:row-start-1 md:pt-2`}>
                    {item.description}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </article>
  );
}
