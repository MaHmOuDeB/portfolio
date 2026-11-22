// The Home FAQ: the foundation's Faq (native details rows, the first open, the head centred like the
// other Home heads) with the questions hiring teams ask. Each figure in an answer is a Fact, each link
// a TextLink, and each month a <time> printed the way the About timeline prints it. Server-safe.
import { Fragment } from 'react';
import type { FaqPart } from '../../../content/home.ts';
import { Faq } from '@/components/frame';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import { INTL, type Locale } from '@/lib/i18n/locale';
import { homeCopy } from './copy';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2025-11" as "Nov 2025" (German: the month's long name, "November 2025"), as the About timeline prints a month. */
function monthText(m: string, locale: Locale): string {
  const [year, month] = m.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!year || !name || !/^\d{4}$/.test(year)) throw new Error(`faq: "${m}" is not a yyyy-mm month`);
  if (locale === 'en') return `${name} ${year}`;
  return new Intl.DateTimeFormat(INTL[locale], { month: locale === 'de' ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Number(year), Number(month) - 1, 1));
}

function Answer({ parts, locale }: { parts: readonly FaqPart[]; locale: Locale }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {typeof part === 'string' ? (
            part
          ) : 'fact' in part ? (
            <Fact id={part.fact} locale={locale} />
          ) : 'month' in part ? (
            <time dateTime={part.month}>{monthText(part.month, locale)}</time>
          ) : (
            <TextLink href={part.external ? part.href : localHref(locale, part.href)} external={part.external}>
              {part.text}
            </TextLink>
          )}
        </Fragment>
      ))}
    </>
  );
}

export function HomeFaq({ locale = 'en' }: { locale?: Locale } = {}) {
  const { head, items } = homeCopy(locale).faq;
  return (
    <div data-home-faq="" data-rule="" className="pb-12 md:pb-16">
      <Faq
        id="faq-title"
        chip={head.chip}
        title={head.title}
        sub={head.sub}
        align="center"
        items={items.map((item) => ({ question: item.question, answer: <Answer parts={item.answer} locale={locale} /> }))}
      />
    </div>
  );
}
