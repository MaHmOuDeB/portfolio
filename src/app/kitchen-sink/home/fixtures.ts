// The Home host's fixed inputs: the note under the hero is drawn from a fictional calibration
// snapshot, never from the site's store, so the host looks the same on every run. Later sections
// of the Home page join the host here as they are built.
import { snapshotFixture } from '@/lib/home/fixtures';
import { toHomeModel, type HomeModel } from '@/lib/home/model';

/** The note's model: a calibration that is collecting, seen from group A. */
export function hostNoteModel(): HomeModel {
  return toHomeModel(snapshotFixture('calibration'), 'a');
}
