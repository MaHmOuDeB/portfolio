// The About page: the photograph beside the story from lg up (stacked below), then the timeline (Audible as a working
// student), the tools I have shipped with, the languages and the CV. Static: the prose comes from
// content/about.tsx and the photo's description from content/about-photo.ts. Sections are spaced, not
// boxed, like the Retention page, and each is a <section> named by its h2.
//
// The photo renders at 480 px wide and 960 px for dense screens (next.config.ts limits the
// optimiser to those widths), loads lazily and is never cropped further than its 4:5 file.
import Image from 'next/image';
import { Fragment, type ReactNode } from 'react';
import { PageHead } from '@/components/frame';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { TextLink } from '@/components/kit/TextLink';
import { cvPdf } from '@/lib/cv-pdf';
import { CV_LINK } from '@/lib/site';
import { ABOUT_FOCUS, ABOUT_LOOKING, ABOUT_STORY, LANGUAGES, SHIPPED_TOOLS, TIMELINE } from '../../../content/about';
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
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} data-depth-rise="heading" className="max-w-text text-xl font-semibold">
        {entry.title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A white hairline card with a small title and a muted line: a language or the CV. */
function SmallCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div data-about-card="" className="rounded-xl border border-hairline bg-surface p-5">
      <p className="text-base font-semibold">{title}</p>
      <div className="mt-1 text-muted">{children}</div>
    </div>
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
    <article aria-labelledby="about-title">
      <PageHead id="about-title" chip="About" title="Experimentation and growth analyst" quiet="in Berlin, Germany." />
      <div className="grid grid-cols-1 gap-8 pb-12 lg:grid-cols-12 lg:items-start lg:gap-12 md:pb-16">
        <div className="lg:col-span-7">
          <div data-about-story="" className="max-w-text space-y-4 text-lg">
            {STORY_PARAGRAPHS.map(([from, to]) => (
              <Fragment key={from}>
                <p>
                  {ABOUT_STORY.slice(from, to).map((sentence, j) => (
                    <span key={from + j} data-sentence="">
                      {from + j > 0 ? ' ' : null}
                      {sentence}
                    </span>
                  ))}
                </p>
                {from === 0 ? (
                  <>
                    <p data-about-focus="">{ABOUT_FOCUS}</p>
                    <p data-about-looking="">{ABOUT_LOOKING}</p>
                  </>
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="lg:col-span-5">
          <Image
            src={aboutPhoto.src}
            alt={aboutPhoto.alt}
            width={PHOTO_WIDTH}
            height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
            loading="eager"
            data-depth-parallax=""
            className="h-auto w-full max-w-120 lg:max-w-none rounded-xl border border-hairline print:max-w-48"
          />
        </div>
      </div>

      <Section id="timeline">
        {/* The rule that draws on entry is its own decorative element: a list may hold only items. */}
        <span data-depth-draw="" aria-hidden="true" className="block h-px max-w-text bg-hairline-strong" />
        <ol className="max-w-text">
          {TIMELINE.map((row) => (
            <TimelineRow key={`${row.range.from}-${row.role}`} {...row} />
          ))}
        </ol>
      </Section>

      <Section id="tools">
        <ul role="list" data-about-tools="" className="flex flex-wrap gap-2.5">
          {SHIPPED_TOOLS.map((t) => (
            <li key={t.tool} className="rounded-md border border-hairline-strong bg-surface px-3.5 py-2.5 text-sm">
              <span className="font-semibold">{t.tool}</span>
              <span className="block text-muted">{t.where}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="languages">
        <dl data-about-languages="" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LANGUAGES.map((l) => (
            <div key={l.language} className="rounded-xl border border-hairline bg-surface p-4">
              <dt className="text-base font-semibold">{l.language}</dt>
              <dd className="mt-1 text-muted">{l.level}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="cv">
        <SmallCard title="My CV as a page you can read or print.">
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <TextLink href={CV_LINK.href} standalone>
              Read my CV
            </TextLink>
            {pdf ? <CvDownload pdf={pdf} variant="secondary" /> : null}
          </div>
        </SmallCard>
      </Section>

      <PageCallToAction />
    </article>
  );
}
