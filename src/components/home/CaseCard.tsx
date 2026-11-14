// One featured case study, drawn as a lean card. The headline is the element the live experiment
// varies, so the card holds BOTH headline strings in one grid cell: the cell is as tall as the taller
// string in either group, at every width, zoom and font, so the card's size cannot tell the groups
// apart. Only the selected string is visible and announced; the other is visibility:hidden and
// aria-hidden, and its figures are still Facts. The whole card is the link: it carries the
// experiment's click marker and the card marker, and holds no second link, so the hidden string is
// never a second focus stop. The cell's one column is the headline's width, and a word longer than
// that width (large text in a narrow card) breaks inside the cell, so neither string can push past
// the card's edge, where the card clips it. Server-safe.
import { HEADLINES, HOME_CASES, type Study } from '../../../content/home.ts';
import { LeanCard } from '@/components/depth/LeanCard';
import type { Arm } from '@/experiment.values';
import { cx } from '@/lib/cx';
import { prefetchFor } from '@/lib/nav';
import { Parts } from './Parts';

const ARMS: readonly Arm[] = ['a', 'b'];

/** The headline area never gets shorter than this many lines, so cards in a row line up. */
const TITLE_MIN_LINES = 3;

function lookup(study: Study) {
  const headlines = HEADLINES.find((h) => h.study === study);
  const item = HOME_CASES.find((c) => c.study === study);
  if (!headlines || !item) throw new Error(`no featured case study "${study}"`);
  return { headlines, item };
}

export function CaseCard({ study, headlineArm }: { study: Study; headlineArm: Arm }) {
  const { headlines, item } = lookup(study);
  return (
    <LeanCard
      href={item.href}
      prefetch={prefetchFor(item.href)}
      data-case-card={study}
      data-experiment-click="card"
      data-touch-target=""
      titleMinLines={TITLE_MIN_LINES}
      meta={item.meta}
      title={
        <span id={`case-${study}-headline`} data-case-headline="" className="grid grid-cols-1 wrap-anywhere">
          {ARMS.map((arm) => {
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
          })}
        </span>
      }
    >
      <span data-case-description="">
        <Parts parts={item.description} />
      </span>
    </LeanCard>
  );
}
