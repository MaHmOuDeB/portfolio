// The Home host's fixed inputs: the note on the live test is drawn from fictional snapshots, never
// from the site's store, so the host looks the same on every run.
import type { Arm } from '@/experiment.values';
import { FIXTURE_AB, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeModel } from '@/lib/home/model';
import { STEP_STATES } from './states';

/** The note's model: a calibration that is collecting, seen from group A. */
export function hostNoteModel(): HomeModel {
  return toHomeModel(snapshotFixture('calibration'), 'a');
}

/** The data here is fictional, so every number the note prints is marked simulated, never live. */
const simulated = (m: HomeModel): HomeModel => ({ ...m, refs: ['simulated'] });

/**
 * An A/B with a look on each of ten days, so the band has an area (the mode fixtures have one look).
 * Group B gets a few more card clicks, so the band moves off zero.
 */
function manyLooks(arm: Arm = 'b'): HomeModel {
  const rows = Array.from({ length: 10 }, (_, i) => {
    const day = `2026-12-${String(i + 1).padStart(2, '0')}`;
    return { day, a: { entry: 30, inview: 25, engaged: 25, card: 3 }, b: { entry: 30, inview: 25, engaged: 25, card: 5 } };
  });
  return simulated(toHomeModel(buildFixture({ config: FIXTURE_AB, now: '2026-12-12T12:00:00+01:00', rows }), arm));
}

/**
 * The host's states: every mode, then the narrative fixtures, then the A/B with a look on each of ten
 * days. `PAIRED_STATES` picks the ones drawn for both groups.
 */
export const HOST_STATES: readonly {
  id: string;
  /** The state's model seen from a group (B unless named). */
  model: (arm?: Arm) => HomeModel;
}[] = [...STEP_STATES, { id: 'ab-many-looks', model: manyLooks }];

/**
 * The states drawn for both groups (/kitchen-sink/home/<group>/<state>), for measurements that
 * compare or cover the two groups on one state: before data, collecting, enough data, and the end
 * states the review screenshots show.
 */
export const PAIRED_STATES = ['before-data', 'calibration', 'ab-many-looks', 'inconclusive', 'aa-failed'] as const;
