// The second track, "Automation and agents": the section head, four lean cards to the pages that tell
// each story (the project's name as a small label above a title that says what it does), each ending in its sketch and drifting in from its outer corner, then one ruled row with the three "I automate." lines as a
// compact list without a title, under a hairline that draws in as it enters. Server-safe.
import { HOME_AUTOMATE_LINES, HOME_AUTOMATION, HOME_AUTOMATION_HEAD } from '../../../content/home.ts';
import { LeanCard } from '@/components/depth/LeanCard';
import { SectionHead } from '@/components/frame';
import { prefetchFor } from '@/lib/nav';
import { Parts } from './Parts';
import { AUTOMATION_SKETCHES } from '@/components/frame/sketches';

export function AutomationTrack() {
  const head = HOME_AUTOMATION_HEAD;
  return (
    <section data-home-track="automation" data-rule="" aria-labelledby="track-automation-title">
      <SectionHead id="track-automation-title" chip={head.chip} title={head.title} quiet={head.quiet} sub={head.sub} />
      <div data-home-cards="automation" className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {HOME_AUTOMATION.map((c, i) => {
          const Sketch = AUTOMATION_SKETCHES[c.id];
          // Each card drifts in from the section's outer corner on its side. The wrapper moves, never
          // the card, which keeps its own lean; so the card does not also rise.
          return (
            <div key={c.id} data-depth-drift={i % 2 === 0 ? 'bl' : 'br'} className="grid min-w-0 grid-cols-1">
              <LeanCard
                data-depth-rise={undefined}
                href={c.href}
                prefetch={prefetchFor(c.href)}
                data-home-card={c.id}
                title={
                  <>
                    <span data-card-label="">{c.label}</span>
                    <span data-card-title="">
                      <Parts parts={c.title} />
                    </span>
                  </>
                }
                meta={<Parts parts={c.meta} />}
                size="md"
                vignette={Sketch ? <Sketch /> : undefined}
              >
                <Parts parts={c.description} />
              </LeanCard>
            </div>
          );
        })}
      </div>
      <div data-home-automate="" className="mt-2.5">
        <span data-depth-draw="" aria-hidden="true" className="block h-px bg-hairline" />
        <ul role="list" data-depth-trace="row" className="grid grid-cols-1 md:grid-cols-[minmax(0,calc(100%/3_-_0.5rem))_minmax(0,1fr)_minmax(0,calc(100%/3_-_0.5rem))]">
          {HOME_AUTOMATE_LINES.map((line) => (
            <li key={line} className="border-hairline py-5 text-sm text-muted md:px-6 md:first:pl-0 md:last:pr-0 md:[&+li]:border-l max-md:[&+li]:border-t">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
