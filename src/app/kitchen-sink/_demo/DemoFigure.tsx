// The kitchen sink's interactive Figure, as a page would place one: the server draws the preset
// (the static HTML, also what a visitor without JavaScript keeps), and LoadOnIntent swaps in the
// island on hover, focus or idle time.
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import { PRESETS } from './DemoControls';
import { DemoFigureView } from './demo-view';
import { DemoIsland, InertDemoControls } from './islands';

export function DemoFigure({ id, titleLevel }: { id: string; titleLevel?: 2 | 3 | 4 }) {
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
      <DemoIsland id={id} titleLevel={titleLevel} />
    </LoadOnIntent>
  );
}
