// The CV as a page: the same claims as the web CV PDF, in the CV's order (summary, experience,
// skills, education, languages, projects), readable on screen and printable. Static: the text comes
// from content/about.tsx. Each claim carries data-cv-claim, so the tests can hold it against the
// PDF. When the build found a checked PDF (src/lib/cv-pdf.ts), one primary button at the top offers
// it with its size; otherwise there is none. The contact route is LinkedIn. When printed, the site
// header, footer and buttons drop away (globals.css and print:hidden) and entries do not split
// across pages.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';
import { cvPdf } from '@/lib/cv-pdf';
import { CONTACT, SITE } from '@/lib/site';
import {
  CV_EDUCATION,
  CV_EXPERIENCE,
  CV_PROJECTS,
  CV_SKILLS,
  CV_SUMMARY,
  LANGUAGES,
  type CvClaim,
  type CvEntry,
} from '../../../content/about';
import { CvDownload } from './CvDownload';
import { Months } from './Months';

/** The sections in page order. */
export const CV_SECTIONS = [
  { id: 'summary', title: 'Summary' },
  { id: 'experience', title: 'Experience' },
  { id: 'skills', title: 'Skills' },
  { id: 'education', title: 'Education' },
  { id: 'languages', title: 'Languages' },
  { id: 'projects', title: 'Projects' },
] as const;

type SectionId = (typeof CV_SECTIONS)[number]['id'];

/** A profile URL as it prints: no scheme, no "www.". */
const bare = (url: string) => url.replace(/^https?:\/\/(?:www\.)?/, '');

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = CV_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`cv: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 print:mt-6">
      <h2 id={`${id}-title`} data-depth-rise="heading" className="border-b border-line pb-2 text-xl font-semibold">
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Claims({ claims }: { claims: readonly CvClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <ul className="mt-2 max-w-text list-disc space-y-1 pl-5 marker:text-muted">
      {claims.map((c) => (
        <li key={c.id} data-cv-claim={c.id} className="break-inside-avoid">
          {c.body}
        </li>
      ))}
    </ul>
  );
}

/** A job or a degree: title, where, the months, then its bullets and plain lines. */
function DatedEntry({ entry }: { entry: CvEntry }) {
  return (
    <article aria-labelledby={`cv-${entry.id}`} className="mt-6 first:mt-0">
      <div data-cv-entry-head="" className="break-inside-avoid break-after-avoid">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 id={`cv-${entry.id}`} className="text-base font-semibold">
            {entry.title}
          </h3>
          {entry.range ? (
            <p data-cv-dates="" className="text-sm text-muted">
              <Months range={entry.range} />
            </p>
          ) : null}
        </div>
        <p data-cv-where="" className="text-muted">
          {entry.where}
        </p>
      </div>
      <Claims claims={entry.claims} />
      {entry.lines?.map((line) => (
        <p key={line} data-cv-line="" className="mt-1 max-w-text break-inside-avoid">
          {line}
        </p>
      ))}
    </article>
  );
}

/** A project: title (linked when the site has a page for it), what kind, bullets, technologies. */
function ProjectEntry({ entry }: { entry: CvEntry }) {
  return (
    <article aria-labelledby={`cv-${entry.id}`} className="mt-6 first:mt-0">
      <div data-cv-entry-head="" className="break-inside-avoid break-after-avoid">
        <h3 id={`cv-${entry.id}`} className="text-base font-semibold">
          {entry.href ? (
            <TextLink href={entry.href} standalone>
              {entry.title}
            </TextLink>
          ) : (
            entry.title
          )}
        </h3>
        <p data-cv-where="" className="text-muted">
          {entry.where}
          {entry.range ? (
            <>
              , <Months range={entry.range} />
            </>
          ) : null}
        </p>
      </div>
      <Claims claims={entry.claims} />
      {entry.technologies ? (
        <p data-cv-technologies="" className="mt-1 max-w-text break-inside-avoid text-sm text-muted">
          Technologies: {entry.technologies}
        </p>
      ) : null}
    </article>
  );
}

function Terms({ items }: { items: readonly (readonly [term: string, description: string])[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 md:grid-cols-[12rem_1fr]">
      {items.map(([term, description]) => (
        <div key={term} className="contents">
          <dt className="font-semibold">{term}</dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CvPage(): ReactNode {
  const pdf = cvPdf();
  return (
    <article aria-labelledby="cv-title" className="max-w-figure py-12 md:py-section print:py-0">
      <header data-cv-header="">
        <h1 id="cv-title" data-depth-rise="heading" className="text-2xl font-semibold md:text-3xl">
          {SITE.name}
        </h1>
        <p data-cv-role="" className="mt-1 text-lg font-semibold">
          {SITE.role}
        </p>
        <p data-cv-place="" className="text-muted">
          {SITE.city}
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-6">
          <li data-cv-contact="">
            <TextLink href={CONTACT.linkedin} standalone external icon="linkedin">
              {bare(CONTACT.linkedin)}
            </TextLink>
          </li>
          <li>
            <TextLink href={CONTACT.github} standalone external icon="github">
              {bare(CONTACT.github)}
            </TextLink>
          </li>
        </ul>
        {pdf ? (
          <div className="mt-4">
            <CvDownload pdf={pdf} variant="primary" />
          </div>
        ) : null}
      </header>

      <Section id="summary">
        <div className="max-w-text space-y-2">
          {CV_SUMMARY.map((c) => (
            <p key={c.id} data-cv-claim={c.id}>
              {c.body}
            </p>
          ))}
        </div>
      </Section>

      <Section id="experience">
        {CV_EXPERIENCE.map((e) => (
          <DatedEntry key={e.id} entry={e} />
        ))}
      </Section>

      <Section id="skills">
        <Terms items={CV_SKILLS.map((s) => [s.label, s.items] as const)} />
      </Section>

      <Section id="education">
        {CV_EDUCATION.map((e) => (
          <DatedEntry key={e.id} entry={e} />
        ))}
      </Section>

      <Section id="languages">
        <Terms items={LANGUAGES.map((l) => [l.language, l.level] as const)} />
      </Section>

      <Section id="projects">
        {CV_PROJECTS.map((e) => (
          <ProjectEntry key={e.id} entry={e} />
        ))}
      </Section>
    </article>
  );
}
