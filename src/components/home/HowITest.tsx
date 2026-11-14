// "How I test": three stacked tabs at the left (a title and one line each) and one preview panel per
// tab at the right. The tabs are native radio inputs inside their labels, the first checked, so the
// widget works without JavaScript: the browser moves the selection with the arrow keys, and CSS shows
// the panel whose radio is checked (`:has(#id:checked)` on the wrapper). Each panel is a decorative
// sketch; the words a reader needs are in the tabs. The same for every visitor. Server-safe.
import { HOME_HOW } from '../../../content/home.ts';
import { SectionHead } from '@/components/frame';
import { HOW_SKETCHES } from '@/components/frame/sketches';

const TITLE_ID = 'how-title';
const NAME = 'how-tab';
const radioId = (id: string) => `how-${id}`;

/** The wrapper's classes: each checked radio shows its own panel (Tailwind writes the `:has` rules). */
const SHOW = [
  '[&:has(#how-plan:checked)_[data-how-panel=plan]]:block',
  '[&:has(#how-read:checked)_[data-how-panel=read]]:block',
  '[&:has(#how-recommend:checked)_[data-how-panel=recommend]]:block',
].join(' ');

export function HowITest() {
  const { head, tabs } = HOME_HOW;
  return (
    <section data-home-how="" data-rule="" aria-labelledby={TITLE_ID} className="pb-12 md:pb-16">
      <SectionHead id={TITLE_ID} chip={head.chip} title={head.title} quiet={head.quiet} sub={head.sub} />
      <div data-how-tabs="" className={`grid grid-cols-1 gap-2.5 lg:grid-cols-2 ${SHOW}`}>
        <div role="radiogroup" aria-labelledby={TITLE_ID} className="grid content-start gap-2.5">
          {tabs.map((tab, i) => (
            <label
              key={tab.id}
              className="block cursor-pointer rounded-xl border border-hairline px-5.5 py-4.5 text-muted transition-colors duration-(--duration-fast) has-[:checked]:bg-surface has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent has-[:focus-visible]:outline-solid hover:bg-surface"
            >
              <input type="radio" name={NAME} id={radioId(tab.id)} value={tab.id} defaultChecked={i === 0} className="sr-only" />
              <span data-how-title="" className="block text-lg font-semibold text-ink">
                {tab.title}
              </span>
              <span data-how-line="" className="mt-1 block text-sm">
                {tab.line}
              </span>
            </label>
          ))}
        </div>
        <div className="relative min-h-60 rounded-xl border border-hairline bg-surface">
          {tabs.map((tab) => {
            const Sketch = HOW_SKETCHES[tab.id];
            return (
              <div key={tab.id} data-how-panel={tab.id} aria-hidden="true" className="hidden h-full [&>[data-vignette]]:h-full [&>[data-vignette]]:min-h-60 [&>[data-vignette]]:rounded-xl [&>[data-vignette]]:border-t-0">
                <Sketch />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
