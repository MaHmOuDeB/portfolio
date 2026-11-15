// The questions a team asks, as two rows of chips that slide in opposite directions with the scroll.
// Each row reuses the ribbon's mechanic as it is (the data-depth-ribbon attribute: the row clips and
// fades its own edges, and its list slides where scroll timelines exist and motion is allowed); the
// second list runs the same slide in reverse. Anywhere else both rows are static and wrap. Each
// question appears once; the chips are text, not links. Server-safe.
import { HOME_QUESTIONS } from '../../../content/home.ts';
import { Chip, SectionHead } from '@/components/frame';
import { cx } from '@/lib/cx';

const TITLE_ID = 'questions-title';

export function QuestionsRows() {
  const { head, rows } = HOME_QUESTIONS;
  return (
    <section data-home-questions="" data-rule="" aria-labelledby={TITLE_ID} className="pb-12 md:pb-16">
      <SectionHead id={TITLE_ID} chip={head.chip} title={head.title} quiet={head.quiet} />
      <div className="grid gap-2.5">
        {rows.map((row, i) => (
          <div key={i} data-depth-ribbon="">
            <ul role="list" className={cx(
                'mx-auto justify-center text-center [&>li]:border-0 [&>li]:p-0 [&_[data-chip]]:min-h-12 [&_[data-chip]]:bg-clear [&_[data-chip]]:rounded-xl [&_[data-chip]]:px-5 [&_[data-chip]]:text-lg',
                i === 1 && '[animation-direction:reverse]',
              )}>
              {row.map((q) => (
                <li key={q}>
                  <Chip>{q}</Chip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
