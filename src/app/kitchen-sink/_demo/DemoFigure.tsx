// The kitchen sink's interactive Figure, as a page would place one: the server draws the preset
// (the static HTML, also what a visitor without JavaScript keeps), and LoadOnIntent swaps in the
// island on hover, focus or idle time. The island gets the server's preset chart as its error
// preview, so a chart that throws in the browser is never drawn again by the fallback.
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import { PRESETS } from './DemoControls';
import { DemoChart, DemoFigureView, demoModel } from './demo-view';
import { DemoIsland, InertDemoControls } from './islands';

export function DemoFigure({ id, titleLevel, failAt }: { id: string; titleLevel?: 2 | 3 | 4; failAt?: number }) {
  const values = PRESETS.default;
  return (
    <LoadOnIntent
      preview={
        <DemoFigureView
          id={id}
          titleLevel={titleLevel}
          values={values}
          controls={<InertDemoControls id={id} values={values} />}
        />
      }
    >
      <DemoIsland
        id={id}
        titleLevel={titleLevel}
        failAt={failAt}
        preview={<DemoChart id={`${id}-preview`} model={demoModel(values)} presetPreview />}
      />
    </LoadOnIntent>
  );
}
