// The second track, "Automation and agents": the section head, four lean cards to the pages that tell
// each story (the project's name as a small label above a title that says what it does), each ending in its sketch and drifting in from its outer corner. The "I automate." row is on the
// Work page (AutomateRow). Server-safe.
import { LeanCard } from '@/components/depth/LeanCard';
import { SectionHead } from '@/components/frame';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { prefetchFor } from '@/lib/nav';
import { homeCopy } from './copy';
import { Parts } from './Parts';
import { AUTOMATION_SKETCHES } from '@/components/frame/sketches';

export function AutomationTrack({ locale = 'en' }: { locale?: Locale } = {}) {
  const copy = homeCopy(locale);
  const head = copy.automationHead;
  return (
    <section data-home-track="automation" data-rule="" aria-labelledby="track-automation-title" className="pb-2.5">
      <SectionHead id="track-automation-title" chip={head.chip} title={head.title} quiet={head.quiet} sub={head.sub} />
      <div data-home-cards="automation" className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {copy.automation.map((c, i) => {
          const Sketch = AUTOMATION_SKETCHES[c.id];
          // Each card drifts in from the section's outer corner on its side. The wrapper moves, never
          // the card, which keeps its own lean; so the card does not also rise.
          return (
            <div key={c.id} data-depth-drift={i % 2 === 0 ? 'bl' : 'br'} className="grid min-w-0 grid-cols-1">
              <LeanCard
                data-depth-rise={undefined}
                href={localHref(locale, c.href)}
                prefetch={prefetchFor(c.href)}
                data-home-card={c.id}
                title={
                  <>
                    <span data-card-label="">{c.label}</span>
                    <span data-card-title="">
                      <Parts parts={c.title} locale={locale} />
                    </span>
                  </>
                }
                meta={<Parts parts={c.meta} locale={locale} />}
                size="md"
                vignette={Sketch ? <Sketch text={copy.sketches} /> : undefined}
              >
                <Parts parts={c.description} locale={locale} />
              </LeanCard>
            </div>
          );
        })}
      </div>
    </section>
  );
}
