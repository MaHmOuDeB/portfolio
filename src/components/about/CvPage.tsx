// The CV as a page: the same claims as the web CV PDF, in the CV's order (summary, experience,
// skills, education, languages, projects), readable on screen and printable. Static: the text comes
// from content/about.tsx. Each claim carries data-cv-claim, so the tests can hold it against the
// PDF. Under the name an action row: the PDF's download as the primary button when the build found a
// checked PDF (src/lib/cv-pdf.ts), "Print this page" (primary when there is no PDF) and "Write to me".
// From md the dates sit in a left column beside their roles, and Skills and Languages use the same
// grid. The page ends on the ink call to action. When printed, the site header, footer, buttons and
// call to action drop away (globals.css and print:hidden) and entries do not split across pages.
import type { ReactNode } from 'react';
import { Chip } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { TextLink } from '@/components/kit/TextLink';
import { cvPdf } from '@/lib/cv-pdf';
import { CONTACT, CONTACT_HREF, SITE } from '@/lib/site';
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
import { PrintButton } from './PrintButton';

/** The left column of an entry's dates, and of the Skills and Languages terms, from md. */
const GRID = 'md:grid md:grid-cols-[11rem_1fr] md:gap-x-8';

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
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-rule=""
      className="pt-12 pb-12 print:mx-0 print:border-0 print:px-0 print:pt-0 print:pb-0 print:mt-6"
    >
      <h2 id={`${id}-title`} data-depth-rise="heading" className="text-xl font-semibold print:border-b print:border-line print:pb-2">
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
    <article aria-labelledby={`cv-${entry.id}`} className={`mt-6 first:mt-0 ${GRID}`}>
      {entry.range ? (
        <p data-cv-dates="" className="break-after-avoid text-sm text-muted md:pt-0.5">
          <Months range={entry.range} />
        </p>
      ) : null}
      <div className="md:col-start-2">
        <div data-cv-entry-head="" className="break-inside-avoid break-after-avoid">
          <h3 id={`cv-${entry.id}`} className="text-base font-semibold">
            {entry.title}
          </h3>
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
      </div>
    </article>
  );
}

/** A project: title (linked when the site has a page for it), what kind, bullets, technologies. */
function ProjectEntry({ entry }: { entry: CvEntry }) {
  return (
    <article aria-labelledby={`cv-${entry.id}`} className="mt-6 first:mt-0 md:ml-[calc(11rem+2rem)]">
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
    <dl className="grid gap-x-8 gap-y-2 md:grid-cols-[11rem_1fr]">
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
    <article aria-labelledby="cv-title">
      <header data-cv-header="" className="pb-12 pt-12 md:pt-16 print:py-0">
        <div className="print:hidden">
          <Chip>CV</Chip>
        </div>
        <h1 id="cv-title" className="mt-4.5 text-h2-sm md:text-h2 print:mt-0 print:text-3xl print:font-semibold">
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
        <div data-cv-actions="" className="mt-6 flex flex-wrap gap-2.5 print:hidden">
          {pdf ? <CvDownload pdf={pdf} variant="primary" /> : null}
          <PrintButton variant={pdf ? 'secondary' : 'primary'} />
          <ButtonLink href={CONTACT_HREF} variant="secondary">
            Write to me
          </ButtonLink>
        </div>
      </header>

      <Section id="summary">
        <div className="max-w-text space-y-2 md:ml-[calc(11rem+2rem)]">
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

      <PageCallToAction />
    </article>
  );
}
