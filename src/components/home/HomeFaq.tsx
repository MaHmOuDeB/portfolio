// The Home FAQ: the foundation's Faq (native details rows, the first open) with the questions hiring
// teams ask. Each figure in an answer is a Fact. Server-safe.
import { HOME_FAQ } from '../../../content/home.ts';
import { Faq } from '@/components/frame';
import { Parts } from './Parts';

export function HomeFaq() {
  const { head, items } = HOME_FAQ;
  return (
    <div data-home-faq="" data-rule="" className="pb-12 md:pb-16">
      <Faq
        id="faq-title"
        chip={head.chip}
        title={head.title}
        sub={head.sub}
        items={items.map((item) => ({ question: item.question, answer: <Parts parts={item.answer} /> }))}
      />
    </div>
  );
}
