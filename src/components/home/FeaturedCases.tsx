// The three featured case studies: the cards region the live experiment watches. Its DOM contract
// with the experiment beacon is `[data-experiment="cards"]` for the region (exposure is half of it in
// view) and `data-experiment-click="card"` on each card link. Both groups get the same region; only
// the visible headline string differs, and each card ends in the same vignette in both groups. Stacked
// below lg; from lg three columns, as a bento with narrow gaps. Server-safe.
import type { Arm } from '@/experiment.values';
import type { Locale } from '@/lib/i18n/locale';
import { CaseCard } from './CaseCard';
import { homeCopy } from './copy';

export function FeaturedCases({ headlineArm, locale = 'en' }: { headlineArm: Arm; locale?: Locale }) {
  const { featured } = homeCopy(locale);
  // A German page is outside the experiment: the same region without its marker, so nothing is watched.
  const watched = locale === 'en' ? { 'data-experiment': 'cards' } : {};
  return (
    <section {...watched} aria-label={featured.label} className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
      {featured.cases.map((c) => (
        <CaseCard key={c.study} study={c.study} headlineArm={headlineArm} locale={locale} />
      ))}
    </section>
  );
}
