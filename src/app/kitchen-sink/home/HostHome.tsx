// The Home host's one composition, shared by /kitchen-sink/home (group A), the forced-group pages
// /kitchen-sink/home/a and /kitchen-sink/home/b and the scroll-moment states
// /kitchen-sink/home/scroll/<state>: the Home page's own composition (HomeSectionsView, as the home
// page renders it, without the beacon), with fixed inputs.
// The note and the scroll moment come from one fixed model, the same in both groups unless a state
// page names its own. The group forced here decides which card headline is shown, in every state
// (the real page shows group A's headlines in the calibration), so the two groups' geometry can be
// compared on any state.
import { HomeSectionsView } from '@/components/home/HomeSections';
import type { ScrollMomentProps } from '@/components/home/ScrollMoment';
import type { Arm } from '@/experiment.values';
import type { HomeModel } from '@/lib/home/model';
import { ChartErrorShell } from './ChartErrorMoment';
import { HomeFontPreload } from './FontPreload';
import { hostNoteModel, hostScrollModel, scrollMomentProps } from './fixtures';

/**
 * `breakChart`: the scroll moment's live chart fails in the browser (the chart-error state). `scroll`:
 * the scroll moment's own props, where a state page composes them itself. `renderedAt`: the scroll
 * moment is composed by the home page's own rule (the tick allowed or not) at this fixed render time.
 */
export function HostHome({
  arm,
  model,
  breakChart = false,
  scroll: given,
  renderedAt,
}: {
  arm: Arm;
  model?: HomeModel;
  breakChart?: boolean;
  scroll?: ScrollMomentProps;
  renderedAt?: string;
}) {
  const note = { ...(model ?? hostNoteModel()), headlineArm: arm };
  const Shell = breakChart ? ChartErrorShell : undefined;
  return (
    <div data-host-home={arm} className="pb-section">
      <HomeFontPreload />
      {renderedAt !== undefined && given === undefined ? (
        <HomeSectionsView model={note} renderedAt={renderedAt} Shell={Shell} />
      ) : (
        <HomeSectionsView model={note} scroll={given ?? scrollMomentProps(model ?? hostScrollModel())} Shell={Shell} />
      )}
      <p className="mt-12 max-w-text text-sm text-muted">
        The Home page&apos;s finished parts, in page order. This page exists only in the test build. All data on it is
        fictional.
      </p>
    </div>
  );
}
