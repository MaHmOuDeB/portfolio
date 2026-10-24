// The one-sentence test note. Says what this site is doing to its visitors and, in an A/B test,
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
  if (note.mode === 'paused') {
    return (
      <p className="text-sm">
        The experiment on this site is paused.{' '}
        <TextLink href={href} aria-label="See why the experiment is paused">
          See why
        </TextLink>
        .
      </p>
    );
  }
  if (note.mode === 'calibration') {
    return (
      <p className="text-sm">
        This site runs a live experiment on its own visitors. It is calibrating first, so everyone sees the same page.{' '}
        <TextLink href={href}>See the live results</TextLink>.
      </p>
    );
  }
  const showViews = Math.min(note.nA, note.nB) >= MIN_PER_GROUP;
  return (
    <p className="text-sm">
      This site runs an A/B test on its visitors, and you are in group {note.arm === 'a' ? 'A' : 'B'}.{' '}
      <TextLink href={href}>See the live results</TextLink>
      {showViews ? (
        <>
          {' ('}
          <Derived value={note.nA + note.nB} unit="count" refs={refs} /> views so far)
        </>
      ) : null}
      .
    </p>
  );
}
