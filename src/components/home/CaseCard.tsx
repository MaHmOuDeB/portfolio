// One featured case study: the glyph on its own line, the headline, the description and the link.
// The headline is the element the live experiment varies, so the card holds BOTH headline strings
// in one grid cell: the cell is as tall as the taller string in either group, at every width, zoom
// and font, so the card's size cannot tell the groups apart. Only the selected string is visible
// and announced; the other is visibility:hidden and aria-hidden, and its figures are still Facts.
// The headline holds no link, so the hidden string is never a second focus stop. Server-safe.
import Link from 'next/link';
import { HEADLINES, HOME_CASES, CASE_LINK_TEXT, type Study } from '../../../content/home.ts';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import type { Arm } from '@/experiment.values';
import { cx } from '@/lib/cx';
import { prefetchFor } from '@/lib/nav';
import { Parts } from './Parts';

const ARMS: readonly Arm[] = ['a', 'b'];

// The kit's standalone TextLink look; the card link also needs the experiment's click marker,
// which the kit link does not take.
const LINK =
  'inline-flex min-h-(--size-target) max-w-full items-center self-end justify-self-start text-muted underline decoration-muted wrap-anywhere hover:text-ink focus-visible:text-ink';

function lookup(study: Study) {
  const headlines = HEADLINES.find((h) => h.study === study);
  const item = HOME_CASES.find((c) => c.study === study);
  if (!headlines || !item) throw new Error(`no featured case study "${study}"`);
  return { headlines, item };
}

export function CaseCard({ study, headlineArm }: { study: Study; headlineArm: Arm }) {
  const { headlines, item } = lookup(study);
  const headlineId = `case-${study}-headline`;
  return (
    <article
      data-case-card={study}
      className="grid content-start gap-y-3 border-t border-ink pt-4 lg:row-span-4 lg:grid-rows-subgrid"
    >
      <span className="block leading-none">
        <IntervalGlyph />
      </span>
      <h2 id={headlineId} data-case-headline="" className="grid text-lg font-semibold">
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
      </h2>
      <p data-case-description="" className="max-w-text text-base text-muted">
        <Parts parts={item.description} />
      </p>
      <Link
        href={item.href}
        prefetch={prefetchFor(item.href)}
        data-experiment-click="card"
        data-touch-target=""
        aria-describedby={headlineId}
        className={LINK}
      >
        {CASE_LINK_TEXT}
      </Link>
    </article>
  );
}
