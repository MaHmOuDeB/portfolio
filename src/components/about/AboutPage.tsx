// The About page: the head (the page's chip beside the "Open to roles" chip, the h1 and a "Read my CV"
// button), then the photograph beside the story from lg up (on a phone the photo comes first, under the
// headline), the timeline (Audible as a working student), the tools and where I used them, and the
// languages, then the FAQ (moved from Home; the questions rows, also from Home, sit after the story).
// It ends on the ink call to action, which says what roles I am open to, with "Write to me".
// Static: the prose comes from content/about.tsx and the photo's description from content/about-photo.ts.
// Sections are spaced, not boxed, like the Retention page, and each is a <section> named by its h2.
//
// The photo renders at 480 px wide and 960 px for dense screens (next.config.ts limits the
// optimiser to those widths), loads lazily and is never cropped further than its 4:5 file.
import Image from 'next/image';
import type { ReactNode } from 'react';
import { Chip, Quiet, SECTION_H2 } from '@/components/frame';
import { HomeFaq } from '@/components/home/HomeFaq';
import { QuestionsRows } from '@/components/home/QuestionsRows';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { cvPdf } from '@/lib/cv-pdf';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT, CV_LINK } from '@/lib/site';
import { aboutPhoto } from '../../../content/about-photo';
import { aboutCopy, cvCopy, languagesIn } from './copy';
import { body } from './slots';
import { CvDownload } from './CvDownload';
import { TimelineRow } from './TimelineRow';

export const ABOUT_TITLE = 'About';

/** The sections in page order. */
export const ABOUT_SECTIONS = [
  { id: 'timeline', title: 'Timeline' },
  { id: 'tools', title: 'Tools, and where I used them' },
  { id: 'languages', title: 'Languages' },
] as const;

type SectionId = (typeof ABOUT_SECTIONS)[number]['id'];

/** The rendered width of the photo, in CSS px; the 2x candidate is twice this. */
const PHOTO_WIDTH = 480;

function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  if (!ABOUT_SECTIONS.some((s) => s.id === id)) throw new Error(`about: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} data-depth-rise="heading" className={`max-w-text ${SECTION_H2}`}>
        {title}
      </h2>
      <div className="mt-6">{children}</div>
    </section>
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
  [5, 6],
];

export function AboutPage({ locale = 'en' }: { locale?: Locale } = {}): ReactNode {
  const pdf = cvPdf();
  const copy = aboutCopy(locale);
  const { ui } = copy;
  if (STORY_PARAGRAPHS.at(-1)![1] !== copy.story.length) throw new Error('about: the story paragraphs do not cover every sentence');
  return (
    <article aria-labelledby="about-title">
      <div data-page-head="">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{ui.chip}</Chip>
          <Chip dot="ok">{ui.open}</Chip>
        </div>
        <h1 id="about-title" className="max-w-[22em] text-h2-sm md:text-h2">
          {ui.title} <Quiet>{ui.quiet}</Quiet>
        </h1>
        <div data-about-actions="" className="mt-6 flex flex-wrap gap-2.5 max-xs:grid max-xs:grid-cols-1 max-xs:[&_a]:w-full print:hidden">
          <ButtonLink href={localHref(locale, CV_LINK.href)} variant="primary">
            {ui.readCv}
          </ButtonLink>
          {pdf ? <CvDownload pdf={pdf} variant="secondary" locale={locale} before={cvCopy(locale).ui.downloadBefore} /> : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-8 pb-12 lg:grid-cols-12 lg:items-start lg:gap-12 md:pb-16">
        <div className="lg:col-span-7">
          <div data-about-story="" className="max-w-text space-y-4 text-base md:text-lg">
            <p data-about-focus="">{copy.focus}</p>
            {STORY_PARAGRAPHS.map(([from, to]) => (
              <p key={from}>
                {copy.story.slice(from, to).map((sentence, j) => (
                  <span key={from + j} data-sentence="">
                    {j > 0 ? ' ' : null}
                    {body(sentence, locale)}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </div>
        {/* The portrait's column drifts in once from the top left (the photo keeps its own parallax). On a
            phone it comes first, under the headline, across the column as a square head-and-shoulders crop
            (80% of the 4:5 photo's height, placed 25% down, so it starts just above the hair and ends on the
            shoulders); from sm it is the whole photo at a modest size. */}
        <div data-depth-drift="tl" className="order-first lg:order-last lg:col-span-5">
          <Image
            src={aboutPhoto.src}
            alt={ui.photoAlt}
            width={PHOTO_WIDTH}
            height={(PHOTO_WIDTH * aboutPhoto.height) / aboutPhoto.width}
            loading="eager"
            data-depth-parallax=""
            className="h-auto w-full rounded-xl border border-hairline max-sm:aspect-square max-sm:object-cover max-sm:object-[50%_25%] sm:max-w-72 lg:max-w-none print:max-w-48"
          />
          <ul role="list" data-about-profiles="" className="mt-3 flex flex-wrap gap-x-6 print:hidden">
            <li>
              <TextLink href={CONTACT.linkedin} standalone external icon="linkedin">
                LinkedIn
              </TextLink>
            </li>
            <li>
              <TextLink href={CONTACT.github} standalone external icon="github">
                GitHub
              </TextLink>
            </li>
          </ul>
        </div>
      </div>

      <QuestionsRows locale={locale} />

      <Section id="timeline" title={ui.sections.timeline}>
        {/* The rule that draws on entry is its own decorative element: a list may hold only items. */}
        <span data-depth-draw="" aria-hidden="true" className="block h-px max-w-text bg-hairline-strong" />
        {/* A spine with a dot per row: the spine draws down and the dots appear as the rows enter. */}
        <ol data-depth-trace="timeline" className="max-w-text">
          {copy.timeline.map((row) => (
            <TimelineRow key={`${row.range.from}-${row.role}`} {...row} locale={locale} words={ui.months} />
          ))}
        </ol>
      </Section>

      <Section id="tools" title={ui.sections.tools}>
        {/* Hairline rows on a phone, a grid of cards from sm. */}
        <ul role="list" data-about-tools="" className="grid gap-0 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
          {copy.tools.map((t) => (
            <li
              key={t.tool}
              className="h-full border-t border-hairline py-3 last:border-b sm:rounded-xl sm:border sm:bg-surface sm:p-4"
            >
              <span className="block text-base font-semibold">{t.tool}</span>
              <span className="mt-1 block text-sm text-muted">{t.where}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="languages" title={ui.sections.languages}>
        <dl data-about-languages="" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {/* Each card opens like a page on its outer edge: the left ones on their left edge, the right
              ones on their right edge, at a steeper angle than elsewhere. */}
          {languagesIn(locale).map((l, i) => (
            <div
              key={l.language}
              data-depth-book={i < Math.ceil(languagesIn(locale).length / 2) ? 'right' : 'left'}
              className="rounded-xl border border-hairline bg-surface p-4 [--book-angle:18deg]"
            >
              <dt className="text-base font-semibold">{l.language}</dt>
              <dd className="mt-1 text-muted">{l.level}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <HomeFaq locale={locale} />

      <PageCallToAction locale={locale} />
    </article>
  );
}
