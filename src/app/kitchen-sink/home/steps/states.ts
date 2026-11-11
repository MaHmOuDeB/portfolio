// The states the scroll-moment pages show: one per Home mode, then the narrative fixtures (low and
// enough data, small counts, stopped tests with little data, closures). Fictional data only.
import type { Arm } from '@/experiment.values';
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeMode, type HomeModel } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';

const MODES: readonly HomeMode[] = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
];

/** The data here is fictional, so every number on these pages is marked simulated, never live. */
const simulated = (m: HomeModel): HomeModel => ({ ...m, refs: ['simulated'] });

/** Each state's Home model, seen from group B unless another group is named. */
export const STEP_STATES: readonly { id: string; model: (arm?: Arm) => HomeModel }[] = [
  ...MODES.map((m) => ({ id: m, model: (arm: Arm = 'b') => simulated(toHomeModel(snapshotFixture(m), arm)) })),
  ...NARRATIVE_FIXTURES.map((n) => ({ id: n, model: (arm: Arm = 'b') => simulated(toHomeModel(narrativeFixture(n), arm)) })),
];
