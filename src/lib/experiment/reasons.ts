// The reasons the site gives for a stop or a pause, in English, as labels only. The experiment's
// snapshot, its data file and the pause note keep these words (the data file stays English); the
// German Live test page maps each one to its German twin by key (content/de/live.ts). Plain data, no
// imports, so the scripts that read the snapshot can load it with Node's type stripping.
export const STOP_REASONS_EN = {
  /** After "Paused on dd.mm: ": the route stopped counting without a pause flag. */
  malformed: 'the experiment settings could not be read, so counting is stopped until I fix them',
  'band-conflict': 'the interval failed a consistency check, so the test stopped at the last clean look',
  'inconsistent-counts': 'the counts failed a consistency check, so the test stopped at the last clean look',
  /** After "Paused on dd.mm: ". A stored stop never resumes in its namespace, so this must not read as a pause. */
  stoppedForGood: 'I stopped counting for this run and am checking the stored result before showing it',
  /** After "Calibration stopped on dd.mm: ". */
  noNote: 'I no longer have the note explaining why',
  noteDisagrees: 'the day I stored for this stop does not match what I see now, so I am checking it',
  notStarted: 'the experiment has not started yet, so nothing is counted',
  unavailable: 'the live counts could not be read when this page was built, so they show at the next update',
  /** A calibration that stopped by its own check. */
  srm: 'the split check failed',
  'interval-excludes-zero': 'the two identical groups differed',
  'data-fault': 'the counts failed a consistency check',
} as const;

export type StopReasonKey = keyof typeof STOP_REASONS_EN;
export type StopReasons = Record<StopReasonKey, string>;

/** The key of a stored English reason, or null for the owner's own words (a pause flag's note). */
export function stopReasonKey(reason: string): StopReasonKey | null {
  const trimmed = reason.replace(/[.\s]+$/, '');
  for (const key of Object.keys(STOP_REASONS_EN) as StopReasonKey[]) if (STOP_REASONS_EN[key] === trimmed) return key;
  return null;
}
