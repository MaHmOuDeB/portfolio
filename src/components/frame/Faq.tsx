// Questions and answers: a section head, then one native details row per question, the first open.
// No JavaScript: the browser opens and closes each row. Each summary is a 44 px target with the
// question and a chevron (decorative) that turns when its row is open. An answer is a node, so a
// figure in it can be a <Fact>.
import type { ReactNode } from 'react';
import { Icon } from '@/components/kit/Icon';
import { SectionHead, type SectionHeadProps } from './SectionHead';

export type FaqItem = { question: ReactNode; answer: ReactNode };

export type FaqProps = Omit<SectionHeadProps, 'align'> & {
  items: readonly FaqItem[];
  align?: SectionHeadProps['align'];
};

export function Faq({ id, chip, title, quiet, sub, items, align = 'split' }: FaqProps) {
  return (
    <section data-faq="" aria-labelledby={id}>
      <SectionHead id={id} chip={chip} title={title} quiet={quiet} sub={sub} align={align} />
      <div data-faq-list="">
        {items.map((item, i) => (
          <details key={i} data-faq-row="" open={i === 0 ? true : undefined}>
            <summary
              data-touch-target
              className="flex min-h-(--size-target) cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-medium marker:hidden [&::-webkit-details-marker]:hidden"
            >
              <span>{item.question}</span>
              <span data-faq-chevron="" aria-hidden="true">
                <Icon name="chevron" />
              </span>
            </summary>
            <div data-faq-answer="">{item.answer}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
