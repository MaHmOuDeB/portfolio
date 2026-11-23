// One featured case study, drawn as a lean card. The headline is the element the live experiment
// varies, so the card holds BOTH headline strings in one grid cell: the cell is as tall as the taller
// string in either group, at every width, zoom and font, so the card's size cannot tell the groups
// apart. Only the selected string is visible and announced; the other is visibility:hidden and
// aria-hidden, and its figures are still Facts. The whole card is the link: it carries the
// experiment's click marker and the card marker, and holds no second link, so the hidden string is
// never a second focus stop. The cell's one column is the headline's width, and a word longer than
// that width (large text in a narrow card) breaks inside the cell, so neither string can push past
// the card's edge, where the card clips it. The card ends in its study's sketch (the same in both
// groups, decorative). Server-safe.
import { HEADLINES, type Study } from '../../../content/home.ts';
import { LeanCard } from '@/components/depth/LeanCard';
import type { Arm } from '@/experiment.values';
import { cx } from '@/lib/cx';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { prefetchFor } from '@/lib/nav';
import { homeCopy } from './copy';
import { Parts } from './Parts';
import { CASE_SKETCHES } from '@/components/frame/sketches';

const ARMS: readonly Arm[] = ['a', 'b'];

/** The headline area never gets shorter than this many lines, so cards in a row line up. */
const TITLE_MIN_LINES = 3;

function lookup(study: Study, locale: Locale) {
  const copy = homeCopy(locale);
  const headlines = HEADLINES.find((h) => h.study === study);
  const item = copy.featured.cases.find((c) => c.study === study);
  if (!headlines || !item) throw new Error(`no featured case study "${study}"`);
  return { headlines, item, fixed: copy.headlines?.find((h) => h.study === study)?.parts, sketches: copy.sketches };
}

export function CaseCard({ study, headlineArm, locale = 'en' }: { study: Study; headlineArm: Arm; locale?: Locale }) {
  const { headlines, item, fixed, sketches } = lookup(study, locale);
  const Sketch = CASE_SKETCHES[study];
  // Outside the experiment (a German page) the card has one fixed headline and no click marker.
  const watched = fixed === undefined ? { 'data-experiment-click': 'card' } : {};
  return (
    <LeanCard
      href={localHref(locale, item.href)}
      prefetch={prefetchFor(item.href)}
      data-case-card={study}
      {...watched}
      data-touch-target=""
      titleMinLines={TITLE_MIN_LINES}
      meta={item.meta}
      vignette={<Sketch text={sketches} />}
      title={
        <span id={`case-${study}-headline`} data-case-headline="" className="grid grid-cols-1 wrap-anywhere">
          {fixed !== undefined ? (
            <span className="col-start-1 row-start-1">
              <Parts parts={fixed} locale={locale} />
            </span>
          ) : (
            ARMS.map((arm) => {
              const shown = arm === headlineArm;
              return (
                <span
                  key={arm}
                  data-headline-twin={arm}
                  data-headline-shown={shown ? '' : undefined}
                  aria-hidden={shown ? undefined : 'true'}
                  className={cx('col-start-1 row-start-1', !shown && 'invisible')}
                >
                  <Parts parts={headlines[arm]} />
                </span>
              );
            })
          )}
        </span>
      }
    >
      <span data-case-description="">
        <Parts parts={item.description} locale={locale} />
      </span>
    </LeanCard>
  );
}
