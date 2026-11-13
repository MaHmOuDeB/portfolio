// The About page: the photograph and a five-sentence story, then the timeline (Audible as a working
// student), the tools I have shipped with, the languages and the CV. Static: the prose comes from
// content/about.tsx and the photo's description from content/about-photo.ts. Sections are spaced, not
// boxed, like the Retention page, and each is a <section> named by its h2.
//
// The photo renders at 480 px wide and 960 px for dense screens (next.config.ts limits the
// optimiser to those widths), loads lazily and is never cropped further than its 4:5 file.
import Image from 'next/image';
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';
import { cvPdf } from '@/lib/cv-pdf';
import { CV_LINK } from '@/lib/site';
import { ABOUT_STORY, LANGUAGES, SHIPPED_TOOLS, TIMELINE } from '../../../content/about';
import { aboutPhoto } from '../../../content/about-photo';
import { CvDownload } from './CvDownload';
import { TimelineRow } from './TimelineRow';

export const ABOUT_TITLE = 'About';

/** The sections in page order. */
export const ABOUT_SECTIONS = [
  { id: 'timeline', title: 'Timeline' },
  { id: 'tools', title: 'Tools I have shipped with' },
  { id: 'languages', title: 'Languages' },
  { id: 'cv', title: 'CV' },
] as const;

type SectionId = (typeof ABOUT_SECTIONS)[number]['id'];

/** The rendered width of the photo, in CSS px; the 2x candidate is twice this. */
const PHOTO_WIDTH = 480;

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = ABOUT_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`about: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className="max-w-text text-xl font-semibold">
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A two-column list of terms and their descriptions, stacked on phones. */
function TermList({ items }: { items: readonly (readonly [term: string, description: string])[] }) {
  return (
    <dl className="grid max-w-text gap-x-8 md:grid-cols-[12rem_1fr]">
      {items.map(([term, description]) => (
        <div key={term} className="contents">
          <dt className="border-t border-line pt-3 font-medium md:pb-3">{term}</dt>
          <dd className="pb-3 text-muted md:border-t md:border-line md:pt-3">{description}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The story's paragraphs, as [first, end) sentence indexes: split only at its own sentence breaks,
 * so the words are the story's, in order, with nothing added.
 */
const STORY_PARAGRAPHS: readonly (readonly [from: number, to: number])[] = [
  [0, 2],
  [2, 4],
  [4, 5],
];
if (STORY_PARAGRAPHS.at(-1)![1] !== ABOUT_STORY.length) throw new Error('about: the story paragraphs do not cover every sentence');

export function AboutPage(): ReactNode {
  const pdf = cvPdf();
  return (
    <article aria-labelledby="about-title" className="py-12 md:py-section">
      <div className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-7">
          <h1 id="about-title" className="text-2xl font-semibold md:text-3xl">
            {ABOUT_TITLE}
          </h1>
          <div data-about-story="" className="mt-4 max-w-text space-y-4 text-lg">
            {STORY_PARAGRAPHS.map(([from, to]) => (
              <p key={from}>
                {ABOUT_STORY.slice(from, to).map((sentence, j) => (
                  <span key={from + j} data-sentence="">
                    {from + j > 0 ? ' ' : null}
                    {sentence}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
        <div className="md:col-span-5">
          <Image
            src={aboutPhoto.src}
            alt={aboutPhoto.alt}
            width={PHOTO_WIDTH}
            height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
            loading="eager"
            className="h-auto w-full max-w-120 rounded-sm print:max-w-48"
          />
        </div>
      </div>

      <Section id="timeline">
        <ol className="max-w-text">
          {TIMELINE.map((row) => (
            <TimelineRow key={`${row.range.from}-${row.role}`} {...row} />
          ))}
        </ol>
      </Section>

      <Section id="tools">
        <TermList items={SHIPPED_TOOLS.map((t) => [t.tool, t.where] as const)} />
      </Section>

      <Section id="languages">
        <TermList items={LANGUAGES.map((l) => [l.language, l.level] as const)} />
      </Section>

      <Section id="cv">
        <p className="max-w-text">My CV as a page you can read or print.</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <TextLink href={CV_LINK.href} standalone>
            Read my CV
          </TextLink>
          {pdf ? <CvDownload pdf={pdf} variant="secondary" /> : null}
        </div>
      </Section>
    </article>
  );
}
