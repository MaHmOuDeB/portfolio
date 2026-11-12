// The frame of a build note, the short page about a tool I built. It copies the Retention page's
// outline (src/components/retention/RetentionPage.tsx) and adapts the analysis template to a build:
// the title with a one-line intro, a Summary box, the section links, then one <section id> per
// part: the problem, the architecture (with its diagram), how I checked it, the outcome, the limits
// and the links. Each section is labelled by its own h2; prose sits in the readable column and
// evidence runs to the figure width. No motion and no card grid. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';

/** The build-note sections after the summary, in page order: anchor id, heading, link label. */
export const BUILD_NOTE_SECTIONS = [
  { id: 'summary', title: 'Summary', link: null },
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'architecture', title: 'Architecture', link: 'Architecture' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'outcome', title: 'Outcome', link: 'Outcome' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type BodyId = Exclude<(typeof BUILD_NOTE_SECTIONS)[number]['id'], 'summary'>;

export const TEXT = 'max-w-text';
export const EVIDENCE = 'mt-8';
const ITEM = 'mt-4 first:mt-0';

/** A list of short paragraphs or limits, spaced like the Retention page's. */
export function NoteList({ items }: { items: readonly [key: string, body: ReactNode][] }) {
  return (
    <ul className="list-disc pl-6">
      {items.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

/** Paragraphs in the readable column. */
export function Paragraphs({ items }: { items: readonly [key: string, body: ReactNode][] }) {
  return (
    <div className={TEXT}>
      {items.map(([key, body]) => (
        <p key={key} className={ITEM}>
          {body}
        </p>
      ))}
    </div>
  );
}

export function BuildNote({
  slug,
  title,
  intro,
  summary,
  sections,
}: {
  /** The base of the h1 id (`<slug>-title`). */
  slug: string;
  title: string;
  intro: ReactNode;
  summary: readonly [label: string, body: ReactNode][];
  sections: Readonly<Record<BodyId, ReactNode>>;
}): ReactNode {
  return (
    <article aria-labelledby={`${slug}-title`} className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id={`${slug}-title`} className="text-2xl font-semibold md:text-3xl">
          {title}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <p>{intro}</p>
        </div>
      </div>

      <section id="summary" aria-labelledby="summary-title" className={`${TEXT} mt-8 border-y border-line py-6`}>
        <h2 id="summary-title" className="text-xl font-semibold">
          Summary
        </h2>
        <dl className="mt-4">
          {summary.map(([label, body]) => (
            <div key={label} className={ITEM}>
              <dt className="font-semibold">{label}</dt>
              <dd className="mt-1">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="On this page" className={`${TEXT} mt-8`}>
        <ul className="flex flex-wrap gap-x-4">
          {BUILD_NOTE_SECTIONS.flatMap((s) =>
            s.link === null ? [] : [
              <li key={s.id}>
                <TextLink href={`#${s.id}`} standalone>
                  {s.link}
                </TextLink>
              </li>,
            ],
          )}
        </ul>
      </nav>

      {BUILD_NOTE_SECTIONS.flatMap((s) =>
        s.id === 'summary' ? [] : [
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="mt-12 md:mt-section">
            <h2 id={`${s.id}-title`} className={`${TEXT} text-xl font-semibold`}>
              {s.title}
            </h2>
            <div className="mt-4">{sections[s.id]}</div>
          </section>,
        ],
      )}
    </article>
  );
}
