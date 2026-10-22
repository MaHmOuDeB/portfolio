import { updateSnapshotsMode } from '../e2e/snapshot-mode.ts';

describe('updateSnapshotsMode', () => {
  it('regenerates every baseline when the update-baselines label is on', () => {
    expect(updateSnapshotsMode({ UPDATE_BASELINES: '1' })).toBe('all');
    expect(updateSnapshotsMode({ UPDATE_BASELINES: '1', CI: 'true' })).toBe('all');
  });

  it('fails a missing baseline in CI, so a retry cannot write it and pass', () => {
    expect(updateSnapshotsMode({ CI: 'true' })).toBe('none');
    expect(updateSnapshotsMode({ CI: 'true', UPDATE_BASELINES: '0' })).toBe('none');
  });

  it('writes a missing baseline locally', () => {
    expect(updateSnapshotsMode({})).toBe('missing');
    expect(updateSnapshotsMode({ UPDATE_BASELINES: '0' })).toBe('missing');
  });

  it('treats an empty CI variable as not CI', () => {
    expect(updateSnapshotsMode({ CI: '' })).toBe('missing');
  });
});
