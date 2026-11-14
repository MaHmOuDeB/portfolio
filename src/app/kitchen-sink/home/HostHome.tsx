// The Home host's one composition, shared by /kitchen-sink/home (group A), the forced-group pages
// /kitchen-sink/home/a and /kitchen-sink/home/b and the state pages /kitchen-sink/home/<group>/<state>:
// the Home page's own composition (HomeBody, as the home page renders it, without the beacon), with
// fixed inputs. The group forced here decides which card headline is shown, in every state (the real
// page shows group A's headlines in the calibration), so the two groups' geometry can be compared on
// any state.
import { HomeBody } from '@/components/home/HomeSections';
import type { Arm } from '@/experiment.values';
import type { HomeModel } from '@/lib/home/model';
import { HomeFontPreload } from './FontPreload';
import { hostNoteModel } from './fixtures';

export function HostHome({ arm, model }: { arm: Arm; model?: HomeModel }) {
  const note = { ...(model ?? hostNoteModel()), headlineArm: arm };
  return (
    <div data-host-home={arm} className="pb-section wrap-break-word">
      <HomeFontPreload />
      <HomeBody model={note} />
      <p className="mt-12 max-w-text text-sm text-muted">
        The Home page&apos;s finished parts, in page order. This page exists only in the test build. All data on it is
        fictional.
      </p>
    </div>
  );
}
