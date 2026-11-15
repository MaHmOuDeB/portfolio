// The Home FAQ: the foundation's Faq (native details rows, the first open, the head centred like the
// other Home heads) with the questions hiring teams ask. Each figure in an answer is a Fact, each link
// a TextLink, and each month a <time> printed the way the About timeline prints it. Server-safe.
import { Fragment } from 'react';
import { HOME_FAQ, type FaqPart } from '../../../content/home.ts';
import { Faq } from '@/components/frame';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2025-11" as "Nov 2025", as the About timeline prints a month. */
function monthText(m: string): string {
  const [year, month] = m.split('-');
  const name = MONTHS[Number(month) - 1];
  if (!year || !name || !/^\d{4}$/.test(year)) throw new Error(`faq: "${m}" is not a yyyy-mm month`);
  return `${name} ${year}`;
}

function Answer({ parts }: { parts: readonly FaqPart[] }) {
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {typeof part === 'string' ? (
            part
          ) : 'fact' in part ? (
            <Fact id={part.fact} />
          ) : 'month' in part ? (
            <time dateTime={part.month}>{monthText(part.month)}</time>
          ) : (
            <TextLink href={part.href} external={part.external}>
              {part.text}
            </TextLink>
          )}
        </Fragment>
      ))}
    </>
  );
}

export function HomeFaq() {
  const { head, items } = HOME_FAQ;
  return (
    <div data-home-faq="" data-rule="" className="pb-12 md:pb-16">
      <Faq
        id="faq-title"
        chip={head.chip}
        title={head.title}
        sub={head.sub}
        align="center"
        items={items.map((item) => ({ question: item.question, answer: <Answer parts={item.answer} /> }))}
      />
    </div>
  );
}
