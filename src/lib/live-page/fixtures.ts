// The Live test page's states for the dev host: one per Home mode, the narrative fixtures, and the
// cases only the page tells apart (a held test on the interval check, a calibration whose checks are
// ready with an A/B start set, a failed calibration with a restart set). Built like the Home
// fixtures, with the real snapshot builder; the data is fictional, so every ref is simulated, never
// live. Server only (it projects through the server-only model); never shown on a production page.
import type { DerivedRef } from '@/components/kit/Derived';
import { NO_FLAGS } from '@/lib/experiment/flags';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import type { HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];
const SIMULATED: readonly DerivedRef[] = ['simulated'];

/** The display with every ref simulated: the data is fictional. */
function simulated(d: LivePageDisplay): LivePageDisplay {
  return { ...d, refs: SIMULATED, nextStep: d.nextStep === null ? null : { ...d.nextStep, refs: SIMULATED } };
}
function display(s: ExperimentSnapshot): LivePageDisplay {
  return simulated(toLivePageDisplay(toLivePageModel(s, { commit: null }, s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION)));
}

const extra: readonly { id: string; snapshot: () => ExperimentSnapshot }[] = [
  { id: 'held-interval', snapshot: () => snapshotFixture('held', { held: { on: '2026-12-02', reason: 'band-conflict' } }) },
  {
    id: 'calibration-ready-ab-start',
    snapshot: () => {
      const s = narrativeFixture('calibration-ready');
      return { ...s, live: { ...s.live, abStartedOn: '2026-12-01T00:00:00+01:00' } };
    },
  },
  {
    id: 'aa-failed-restart',
    snapshot: () =>
      buildFixture({
        config: FIXTURE_CALIBRATION,
        now: '2026-11-20T10:00:00Z',
        rows: [{ day: '2026-11-03', a: { entry: 30, inview: 20 }, b: { entry: 30, inview: 20 } }],
        flags: { ...NO_FLAGS, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a script error dropped some views', restartsOn: '2026-12-01T00:00:00+01:00' } },
      }),
  },
];

export const LIVE_PAGE_FIXTURES: readonly { id: string; display: () => LivePageDisplay }[] = [
  ...MODES.map((m) => ({ id: m, display: () => display(snapshotFixture(m)) })),
  ...NARRATIVE_FIXTURES.map((n) => ({ id: n, display: () => display(narrativeFixture(n)) })),
  ...extra.map((e) => ({ id: e.id, display: () => display(e.snapshot()) })),
];
