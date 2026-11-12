// The frame of a build note, the short page about a tool I built. It copies the Retention page's
// outline (src/components/retention/RetentionPage.tsx) and adapts the analysis template to a build:
// the title with its intro (block content, usually one paragraph) and, when a note has one, a line on
// my role, then the section links and one <section id> per part: the problem, the architecture (with
// its diagram), how I checked it, the outcome, the limits and the sources and links. A note may leave
// a section out, never rename one; the links name only the sections it has. Build notes have no
// Summary section. Each section is labelled by its own h2; prose sits in the readable column and
// evidence runs to the figure width. Every diagram draws its steps with DiagramStep and joins them with
// DiagramConnector. No motion and no card grid. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';

/** The build-note sections in page order: anchor id, heading, link label. */
export const BUILD_NOTE_SECTIONS = [
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'architecture', title: 'Architecture', link: 'Architecture' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'outcome', title: 'Outcome', link: 'Outcome' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type BodyId = (typeof BUILD_NOTE_SECTIONS)[number]['id'];

export const TEXT = 'max-w-text';
export const EVIDENCE = 'mt-8';
const ITEM = 'mt-4 first:mt-0';
const STEP = 'min-w-0 rounded-sm border border-muted p-4';

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

/** One step of a build-note diagram: its name and one line on what it does, in an outlined box. */
export function DiagramStep({ name, detail, className }: { name: string; detail: ReactNode; className?: string }) {
  return (
    <div className={className ? `${STEP} ${className}` : STEP}>
      <p className="text-sm font-semibold">{name}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}

/** The short drawn line between two steps of a diagram list; drawing only, hidden from assistive technology. */
export function DiagramConnector() {
  return <span aria-hidden="true" data-connector="" className="ml-6 block h-4 w-px bg-muted" />;
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
  role,
  sections,
}: {
  /** The base of the h1 id (`<slug>-title`). */
  slug: string;
  title: string;
  /** The block under the title, usually one paragraph; the frame adds no paragraph of its own. */
  intro: ReactNode;
  /** One short paragraph under the intro: what the project is and what I did. */
  role?: ReactNode;
  /** The body of each section the note has; a section left out is neither drawn nor linked. */
  sections: Readonly<Partial<Record<BodyId, ReactNode>>>;
}): ReactNode {
  const present = BUILD_NOTE_SECTIONS.filter((s) => sections[s.id] !== undefined);
  return (
    <article aria-labelledby={`${slug}-title`} className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id={`${slug}-title`} className="text-2xl font-semibold md:text-3xl">
          {title}
        </h1>
        <div className="mt-4 text-lg text-muted">{intro}</div>
        {role === undefined ? null : (
          <p data-note-role="" className="mt-4">
            {role}
          </p>
        )}
      </div>

      <nav aria-label="On this page" className={`${TEXT} mt-8`}>
        <ul className="flex flex-wrap gap-x-4">
          {present.map((s) => (
            <li key={s.id}>
              <TextLink href={`#${s.id}`} standalone>
                {s.link}
              </TextLink>
            </li>
          ))}
        </ul>
      </nav>

      {present.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="mt-12 md:mt-section">
          <h2 id={`${s.id}-title`} className={`${TEXT} text-xl font-semibold`}>
            {s.title}
          </h2>
          <div className="mt-4">{sections[s.id]}</div>
        </section>
      ))}
    </article>
  );
}
