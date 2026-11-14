// The second track, "Automation and agents": four lean cards to the pages that tell each story.
// Server-safe.
import { HOME_AUTOMATION, HOME_TRACKS } from '../../../content/home.ts';
import { LeanCard } from '@/components/depth/LeanCard';
import { prefetchFor } from '@/lib/nav';
import { Parts } from './Parts';

export function AutomationTrack() {
  return (
    <section data-home-track="automation" aria-labelledby="track-automation-title" className="mt-12 md:mt-section">
      <h2 id="track-automation-title" data-depth-rise="heading" className="max-w-text text-display-sm font-semibold md:text-display">
        {HOME_TRACKS.automation.title}
      </h2>
      <p className="mt-4 max-w-text text-lg text-muted">{HOME_TRACKS.automation.lede}</p>
      <div data-home-cards="automation" className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {HOME_AUTOMATION.map((c) => (
          <LeanCard key={c.id} href={c.href} prefetch={prefetchFor(c.href)} data-home-card={c.id} title={c.title} meta={c.meta} size="md">
            <Parts parts={c.description} />
          </LeanCard>
        ))}
      </div>
    </section>
  );
}
