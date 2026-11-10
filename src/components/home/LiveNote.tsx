// The one-sentence note under the Home hero on what the site's live test is doing. Server only: it
// reads the Home model. The active notes are the kit's PhaseLabel; a stopped, failed, unreadable or
// finished test gets its own sentence and a link to the explanation. Nothing before the start.
// Every count prints through PublishedCountText, and split counts only from 50 views a group.
import type { ReactNode } from 'react';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { UpdatedLabel } from '@/components/kit/LiveLabels';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { TextLink } from '@/components/kit/TextLink';
import { serverNow } from '@/lib/experiment/clock';
import { berlinStartOfDay } from '@/lib/experiment/time';
import { serverEnv } from '@/lib/env';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { berlinDate } from '@/lib/figure/time';
import { publishedCount } from '@/lib/home/counts';
import { homeFreshnessAt, type HomeModel } from '@/lib/home/model';
import { NoteFreshness } from './NoteFreshness';
import { PublishedCountText } from './PublishedCountText';

const EXPLANATION = 'Read the live test explanation';

function When({ iso, refs }: { iso: string; refs: readonly DerivedRef[] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso)}
    </time>
  );
}
const Day = ({ day, refs }: { day: string; refs: readonly DerivedRef[] }) => <When iso={berlinStartOfDay(day)} refs={refs} />;

function Exceptional({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm">
      <p>{children}</p>
      <TextLink href={HOME_LINKS.experiment} standalone>
        {EXPLANATION}
      </TextLink>
    </div>
  );
}

const BASE_WORDS = { entry: 'entry views', analysed: 'analysed views', both: 'entry and analysed views' } as const;

/** Where the split failed, and its counts for each failed base where both groups have 50 views. */
function SplitWarning({ split, refs, lead }: { split: NonNullable<HomeModel['split']>; refs: readonly DerivedRef[]; lead: string }) {
  const bases = split.base === 'both' ? (['entry', 'analysed'] as const) : ([split.base] as const);
  return (
    <>
      {` ${lead} `}
      <Day day={split.day} refs={refs} />, on {BASE_WORDS[split.base]}.
      {bases.map((b) => {
        const c = split[b];
        if (Math.min(c.a, c.b) < MIN_PER_GROUP) return null;
        return (
          <span key={b}>
            {` ${b === 'entry' ? 'Entry' : 'Analysed'} views at that check: `}
            <PublishedCountText value={publishedCount(c.a)} refs={refs} /> in group A and{' '}
            <PublishedCountText value={publishedCount(c.b)} refs={refs} /> in group B.
          </span>
        );
      })}
    </>
  );
}

const groupName = (m: HomeModel) => (m.headlineArm === 'a' ? 'A' : 'B');

function ClosedNote({ model: m }: { model: HomeModel }) {
  const late = m.afterDecisionSrm ? ' A later split check failed; the recorded decision is unchanged.' : '';
  return (
    <Exceptional>
      {m.closedConfirmed
        ? `The A/B test on this site has ended and counting has closed. You saw group ${groupName(m)}’s headlines.`
        : `The A/B test on this site has reached its decision; I am confirming the result. You saw group ${groupName(m)}’s headlines.`}
      {late}
    </Exceptional>
  );
}

/**
 * The active note, with the time it holds when it is stale already or may outlive its data. A plain
 * function, not a component, so the client island's props sit in LiveNote's own tree.
 */
function activeNote(m: HomeModel): ReactNode {
  if (m.testNote === null) return null;
  const label = <PhaseLabel note={m.testNote} href={HOME_LINKS.experiment} refs={m.refs} />;
  if (m.testNote.mode === 'paused') return label;
  const fresh = homeFreshnessAt(m, serverNow(serverEnv()).toISOString());
  if (fresh.kind === 'stale') {
    return (
      <>
        {label}
        <p className="mt-2">
          <UpdatedLabel updatedAt={fresh.updatedAt} renderedAt={fresh.renderedAt} refs={m.refs} />
        </p>
      </>
    );
  }
  return (
    <>
      {label}
      <NoteFreshness readAt={m.readAt} freshness={m.live.freshness} plannedEnd={m.live.plannedEnd} refs={m.refs} />
    </>
  );
}

export function LiveNote({ model: m }: { model: HomeModel }): ReactNode {
  const refs = m.refs;
  switch (m.mode) {
    case 'not-started':
      return null;
    case 'closure-check':
      return <Exceptional>Counting has stopped for this run. I am checking the stored result before showing it.</Exceptional>;
    case 'unavailable':
      return (
        <Exceptional>
          {m.closedConfirmed
            ? 'The live counts could not be loaded, and counting has closed.'
            : m.countingClosed
              ? 'The live counts could not be loaded.'
              : 'The live counts could not be loaded. They will appear at the next update.'}
        </Exceptional>
      );
    case 'settings-unreadable':
      return <Exceptional>Counting is stopped because the experiment settings could not be read.</Exceptional>;
    case 'held': {
      const held = m.held!;
      return (
        <Exceptional>
          {held.reason === 'inconsistent-counts'
            ? 'The test stopped because the counts failed a consistency check.'
            : 'The test stopped because a consistency check failed.'}
          {' Results use only the data up to the last check that passed. The check failed on '}
          <Day day={held.on} refs={refs} />.
          {m.split ? <SplitWarning split={m.split} refs={refs} lead="The split check also failed on" /> : null}
        </Exceptional>
      );
    }
    case 'srm-suppressed':
      return (
        <Exceptional>
          The split check failed, so no result is shown.
          {m.split ? <SplitWarning split={m.split} refs={refs} lead="It failed on" /> : null}
        </Exceptional>
      );
    case 'aa-failed': {
      const a = m.live.aaFailed;
      if (!a) return <Exceptional>Calibration stopped.</Exceptional>;
      const restarts = a.restartsOn !== undefined && Date.parse(a.restartsOn) > Date.parse(m.readAt) ? a.restartsOn : null;
      return (
        <Exceptional>
          Calibration stopped on <When iso={a.on} refs={refs} />: {a.reason}.
          {restarts !== null ? (
            <>
              {' Calibration restarts on '}
              <When iso={restarts} refs={refs} />.
            </>
          ) : null}
          {m.split ? <SplitWarning split={m.split} refs={refs} lead="The split check failed on" /> : null}
        </Exceptional>
      );
    }
    case 'paused':
      return activeNote(m);
    case 'ship-b':
    case 'stop-for-harm':
    case 'inconclusive':
      return <ClosedNote model={m} />;
    case 'before-data':
    case 'calibration':
    case 'ab':
      return m.countingClosed ? <ClosedNote model={m} /> : activeNote(m);
  }
}
