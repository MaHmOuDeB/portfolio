// The test note says what this site is doing to its visitors and, in an A/B test,
// which group the reader is in. Server-safe, no hooks.
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { Derived, type DerivedRef } from './Derived';
import { TextLink } from './TextLink';

export type TestNote =
  | { mode: 'ab'; arm: 'a' | 'b'; nA: number; nB: number }
  | { mode: 'calibration' }
  | { mode: 'paused' };

type Props = {
  note: TestNote;
  /** The Live test page, or its pause explanation. */
  href: string;
  /** Where the counts come from: 'live' on the site, 'simulated' in the kitchen sink. */
  refs: readonly DerivedRef[];
};

export function PhaseLabel({ note, href, refs }: Props) {
  let description: string;
  switch (note.mode) {
    case 'paused':
      description = 'The experiment on this site is paused.';
      break;
    case 'calibration':
      description = 'This site runs a live experiment on its own visitors. It is calibrating first, so everyone sees the same page.';
      break;
    case 'ab':
      description = `This site runs an A/B test on its visitors, and you are in group ${note.arm === 'a' ? 'A' : 'B'}.`;
      break;
  }

  return (
    <div className="text-sm">
      <p>
        {description}
        {note.mode === 'ab' && Math.min(note.nA, note.nB) >= MIN_PER_GROUP ? (
          <>
            {' There have been '}
            <Derived value={note.nA + note.nB} unit="count" refs={refs} /> views so far.
          </>
        ) : null}
      </p>
      <TextLink href={href} standalone>
        {note.mode === 'paused' ? 'See why the experiment is paused' : 'See the live results'}
      </TextLink>
    </div>
  );
}
