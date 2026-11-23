// The frame of a build note, the short page about a tool I built, in the inner pages' reading model:
// the chip, a two-tone h1 (the name, then a quiet clause), a plain opening, the actions (the code, a
// demo) and the glance card with its pull figures and its Scope cell; then the in-page chips and one
// <section id> per part. The note may lead with the section that holds its best exhibit (`lead`);
// the others follow in the shared order: the problem, the architecture (with its diagram), how I
// checked this, the outcome, the limits and the sources and links. A note may leave a section out,
// never rename one; the chips name only the sections it has. Each section is labelled by its own h2
// at the inner section size; prose sits in the readable column and evidence runs to the figure width.
// The page ends with what it shows about how I work, previous and next in the build notes' order,
// and the ink call to action. Every diagram draws its steps with DiagramStep and joins them with
// DiagramConnector. No motion. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { GlanceBlock, type GlanceParts } from '@/components/depth/GlanceBlock';
import { NextRow, PageClose, SECTION_H2, SectionNav, type NextRowLink, type PageCloseLink } from '@/components/frame';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead, type CaseAction } from '@/components/work/CaseHead';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { buildNoteText } from './copy';

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
const STEP = 'min-w-0 rounded-md border border-hairline-strong bg-surface p-4';

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

/** Whether a body has something to draw: null, undefined, true, false and '' draw nothing in React. */
const drawn = (body: ReactNode): boolean => body !== null && body !== undefined && typeof body !== 'boolean' && body !== '';

/** The build notes in reading order, after Pulse (Weather first); the last one leads on to the live test. */
export const BUILD_NOTE_ORDER = {
  weather: { prev: { href: '/work/pulse', label: 'Pulse' }, next: { href: '/work/docproof', label: 'Docproof' } },
  docproof: { prev: { href: '/work/weather', label: 'Weather pipeline' }, next: { href: '/work/n8n', label: 'n8n e-invoice intake' } },
  n8n: { prev: { href: '/work/docproof', label: 'Docproof' }, next: { href: '/work/marketingws', label: 'MarketingWS' } },
  marketingws: { prev: { href: '/work/n8n', label: 'n8n e-invoice intake' }, next: { href: '/experiment', label: 'The live test' } },
} as const satisfies Record<string, { prev: NextRowLink; next: NextRowLink }>;

export type BuildNoteClose = {
  /** One or two short paragraphs on what the note shows about how I work. */
  body: ReactNode;
  links: readonly PageCloseLink[];
};

export function BuildNote({
  slug,
  title,
  quiet,
  intro,
  role,
  actions,
  glance,
  lead,
  sections,
  close,
  locale = 'en',
}: {
  /** The base of the h1 id (`<slug>-title`) and the note's place in the reading order. */
  slug: string;
  title: string;
  /** The quiet second clause of the h1. */
  quiet?: ReactNode;
  /** The plain opening under the title, usually one paragraph; the frame adds no paragraph of its own. */
  intro: ReactNode;
  /** One short paragraph under the intro: what the project is and what I did. */
  role?: ReactNode;
  /** The buttons that close the head: the code, a demo. */
  actions?: readonly CaseAction[];
  /** The 20-second top block, drawn under the head. */
  glance?: GlanceParts;
  /** The section that holds the best exhibit, drawn first; the rest keep the shared order. */
  lead?: BodyId;
  /** The body of each section the note has; a section left out (or empty) is neither drawn nor linked. */
  sections: Readonly<Partial<Record<BodyId, ReactNode>>>;
  /** What the note shows about how I work, before previous and next. */
  close?: BuildNoteClose;
  /** The page's language: the frame's words, and the language of every internal link. */
  locale?: Locale;
}): ReactNode {
  const text = buildNoteText(locale);
  const ordered = lead
    ? [...BUILD_NOTE_SECTIONS.filter((s) => s.id === lead), ...BUILD_NOTE_SECTIONS.filter((s) => s.id !== lead)]
    : [...BUILD_NOTE_SECTIONS];
  const present = ordered.filter((s) => drawn(sections[s.id]));
  const order = (BUILD_NOTE_ORDER as Record<string, { prev: NextRowLink; next: NextRowLink } | undefined>)[slug];
  const names = (text.order as Record<string, { prev: string; next: string } | undefined>)[slug];
  return (
    <article aria-labelledby={`${slug}-title`}>
      <CaseHead
        id={`${slug}-title`}
        chip={text.chip}
        title={title}
        quiet={quiet}
        intro={intro}
        role={drawn(role) ? role : undefined}
        actions={actions}
      />

      {glance ? <GlanceBlock {...glance} labels={text.glance} /> : null}

      <SectionNav items={present.map((s) => ({ href: `#${s.id}`, label: text.sections[s.id].link }))} label={text.sectionNav} />

      {present.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
          <h2 id={`${s.id}-title`} className={`${TEXT} ${SECTION_H2}`} data-depth-rise="heading">
            {text.sections[s.id].title}
          </h2>
          <div className="mt-6">{sections[s.id]}</div>
        </section>
      ))}
      {close ? (
        <PageClose id={`${slug}-shows`} title={text.closeTitle} links={close.links}>
          {close.body}
        </PageClose>
      ) : null}
      {order && names ? (
        <NextRow
          prev={{ ...order.prev, href: localHref(locale, order.prev.href), label: names.prev, kicker: text.kicker.prev }}
          next={{ ...order.next, href: localHref(locale, order.next.href), label: names.next, kicker: text.kicker.next }}
          label={text.nextRow}
        />
      ) : null}
      <div className="mt-12 md:mt-16">
        <PageCallToAction locale={locale} />
      </div>
    </article>
  );
}
