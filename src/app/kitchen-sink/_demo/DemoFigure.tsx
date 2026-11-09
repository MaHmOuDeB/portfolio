// The kitchen sink's interactive Figure, as a page would place one: the server draws the preset
// (the static HTML, also what a visitor without JavaScript keeps), and LoadOnIntent swaps in the
// island on hover, focus or idle time. The island gets the server's preset chart as its error
// preview, so a chart that throws in the browser is never drawn again by the fallback.
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import { PRESETS } from './DemoControls';
import { DemoChart, DemoFigureView, demoModel } from './demo-view';
import { DemoIsland, InertDemoControls, UnreachableDemoIsland } from './islands';

export function DemoFigure({
  id,
  titleLevel,
  failAt,
  eager,
  unreachable,
}: {
  id: string;
  titleLevel?: 2 | 3 | 4;
  failAt?: number;
  eager?: boolean;
  /** The island's code never loads: the preview comes back in its no-JS form. */
  unreachable?: boolean;
}) {
  const values = PRESETS.default;
  const Island = unreachable ? UnreachableDemoIsland : DemoIsland;
  return (
    <LoadOnIntent
      eager={eager}
      preview={
        <DemoFigureView
          id={id}
          titleLevel={titleLevel}
          values={values}
          controls={<InertDemoControls id={id} values={values} />}
        />
      }
    >
      <Island
        id={id}
        titleLevel={titleLevel}
        failAt={failAt}
        preview={<DemoChart id={`${id}-preview`} model={demoModel(values)} presetPreview />}
      />
    </LoadOnIntent>
  );
}
