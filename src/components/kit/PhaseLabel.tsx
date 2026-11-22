// The test note says what this site is doing to its visitors and, in an A/B test,
// which group the reader is in (a page that names no group, such as the German one, leaves `arm` out and
// gets the sentence without it). Server-safe, no hooks.
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { fill } from '@/lib/i18n/template';
import { Derived, type DerivedRef } from './Derived';
import { KIT_TEXT_EN, type KitText } from './text';
import { TextLink } from './TextLink';

export type TestNote =
  | { mode: 'ab'; arm?: 'a' | 'b'; nA: number; nB: number }
  | { mode: 'calibration' }
  | { mode: 'paused' };

type Props = {
  note: TestNote;
  /** The Live test page, or its pause explanation. */
  href: string;
  /** Where the counts come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs: readonly DerivedRef[];
  /** The kit's words and the language of its numbers; default English. */
  text?: Pick<KitText, 'locale' | 'phase'>;
};

export function PhaseLabel({ note, href, refs, text = KIT_TEXT_EN }: Props) {
  const t = text.phase;
  let description: string;
  switch (note.mode) {
    case 'paused':
      description = t.paused;
      break;
    case 'calibration':
      description = t.calibration;
      break;
    case 'ab':
      description = note.arm === undefined ? t.abNoGroup : fill(t.ab, { group: note.arm === 'a' ? 'A' : 'B' });
      break;
  }

  return (
    <div className="text-sm">
      <p>
        {description}
        {note.mode === 'ab' && Math.min(note.nA, note.nB) >= MIN_PER_GROUP ? (
          t.views({ count: <Derived value={note.nA + note.nB} unit="count" refs={refs} locale={text.locale} /> })
        ) : null}
      </p>
      <TextLink href={href} standalone>
        {note.mode === 'paused' ? t.linkPaused : t.linkLive}
      </TextLink>
    </div>
  );
}
