// The Work directory: every case study and build note, in the two groups of content/work.tsx and in
// its order (the live test, Audible, Retention and Pulse, then the tools, n8n last). It copies the
// golden page's frame (one h1 with a one-line intro, then one <section id> per part, each named by
// its own h2) and the Home page's "Tools I've built" rows: a ruled list, the title as the item's one
// link (an h3) and the sourced line beside it from 768 px up. No cards, figures or outcome numbers:
// each line is the page's own description, and its one figure is a Fact. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';
import { WORK_GROUPS } from '../../../content/work.tsx';

export const WORK_TITLE = 'Work';

/** The groups in page order: the section's anchor id and its heading (the group label). */
export const WORK_SECTIONS = WORK_GROUPS.map((group, i) => {
  const id = (['experimentation', 'tools'] as const)[i];
  if (!id) throw new Error(`work: no section id for group "${group.label}"`);
  return { id, label: group.label, items: group.items };
});

const TEXT = 'max-w-text';

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
            {section.items.map((item) => (
              <li
                key={item.href}
                data-work-item={item.href}
                className="grid gap-y-1 border-b border-line py-4 md:grid-cols-12 md:gap-x-8 md:py-6"
              >
                <h3 className="text-lg font-semibold md:col-span-5">
                  <TextLink href={item.href} standalone>
                    {item.title}
                  </TextLink>
                </h3>
                <p className={`${TEXT} text-base text-muted md:col-span-7 md:pt-2`}>{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
