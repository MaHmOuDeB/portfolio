// The "Figures" section of the kitchen sink: the Figure frame in each runtime state. A static
// Figure, the interactive demo twice (URL ids `demo` and `demo-b`, loaded on intent), the forced
// no-JS and error states, a client island that throws, and a diagram. All data is fictional: a
// hypothetical sign-up page. The live phases are on /kitchen-sink/live.
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { PRESETS, REFS } from '../_demo/DemoControls';
import { DemoFigure } from '../_demo/DemoFigure';
import { DemoChart, DemoFigureView, demoModel, demoTable } from '../_demo/demo-view';
import { InertDemoControls } from '../_demo/islands';
import { Thrower } from '../_demo/Thrower';
import { Specimen } from './Specimen';

const PRESET = PRESETS.default;
const MODEL = demoModel(PRESET);
const STATIC_TITLE = 'A rise of two points takes thousands of visitors per group to detect.';
const SIMULATED = derivedAttr(REFS);
// The preset's values are said, so a still view or a shared link needs no control to read them.
const STATIC_CAPTION = (
  <>
    A hypothetical sign-up page, not a real test, at its preset baseline conversion of{' '}
    <span {...SIMULATED}>{Math.round(PRESET.baseline * 100)}%</span> and power of{' '}
    <span {...SIMULATED}>{Math.round(Number(PRESET.power) * 100)}%</span>. Sample sizes from Cohen&apos;s h for a
    two-sided test.
  </>
);

function StaticFigure({ id, error }: { id: string; error?: boolean }) {
  return (
    <Figure
      id={id}
      titleLevel={4}
      title={STATIC_TITLE}
      state={error ? { runtime: 'error' } : undefined}
      provenance="simulated"
      table={demoTable(MODEL)}
      caption={STATIC_CAPTION}
    >
      <DemoChart id={id} model={MODEL} />
    </Figure>
  );
}

const STEPS = ['A visitor opens the sign-up page.', 'The page puts each visitor in one of two groups.', 'Each group’s sign-ups are counted.'];

function StepsDiagram({ id, error }: { id: string; error?: boolean }) {
  return (
    <Figure
      id={id}
      kind="diagram"
      titleLevel={4}
      title="Every visitor lands in one of two groups before anything is counted."
      state={error ? { runtime: 'error' } : undefined}
      caption="A fictional test, drawn as its steps in order."
    >
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step} className="rounded-md border border-muted p-4 text-sm">
            {step}
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function FiguresSection() {
  return (
    <>
      <Specimen
        id="figures--static"
        title="Static Figure"
        note="A title that states the finding, the chart, a caption with its badge, and the numbers as a table."
      >
        <StaticFigure id="static" />
      </Specimen>
      <Specimen
        id="figures--demo"
        title="Interactive Figure"
        note="The server draws the preset; the controls load when the pointer or focus reaches the Figure, or when the page is idle. Its keys in the URL start with demo."
      >
        <DemoFigure id="demo" titleLevel={4} />
      </Specimen>
      <Specimen
        id="figures--demo-b"
        title="A second interactive Figure"
        note="The same Figure with its own keys, demo-b, so the two never touch each other's URL state."
      >
        <DemoFigure id="demo-b" titleLevel={4} />
      </Specimen>
      <Specimen
        id="figures--no-js"
        title="Without JavaScript"
        note="Forced: the preset chart, then the open table under a note that the controls need JavaScript."
      >
        <DemoFigureView
          id="demo-no-js"
          titleLevel={4}
          values={PRESET}
          state={{ runtime: 'no-js' }}
          controls={<InertDemoControls id="demo-no-js" values={PRESET} />}
        />
      </Specimen>
      <Specimen
        id="figures--error-static"
        title="Chart that could not load"
        note="Forced: the Figure keeps its title; the build-time chart, one sentence and the open table take the chart's place."
      >
        <StaticFigure id="static-error" error />
      </Specimen>
      <Specimen
        id="figures--error-diagram"
        title="Diagram that could not load"
        note="Forced: the diagram's sentence points to the text around it."
      >
        <StepsDiagram id="steps-error" error />
      </Specimen>
      <Specimen
        id="figures--throwing"
        title="A client island that throws"
        note="Its chart throws when the pointer enters it or its button is pressed. Only this Figure shows the fallback."
      >
        <Figure
          id="thrower"
          titleLevel={4}
          title={STATIC_TITLE}
          provenance="simulated"
          table={demoTable(MODEL)}
          caption={STATIC_CAPTION}
          preview={<DemoChart id="thrower-preview" model={MODEL} />}
        >
          <Thrower>
            <DemoChart id="thrower" model={MODEL} />
          </Thrower>
        </Figure>
      </Specimen>
      <Specimen
        id="figures--island-throws"
        title="An interactive Figure whose chart throws"
        note="The same interactive Figure, with a fictional bug: one step up the baseline slider makes its chart throw in the browser. Only this Figure shows the fallback, with the build-time chart."
      >
        <DemoFigure id="fragile" titleLevel={4} failAt={0.11} />
      </Specimen>
      <Specimen id="figures--diagram" title="Diagram" note="A title, the drawing and a caption: no badge, controls or table.">
        <StepsDiagram id="steps" />
      </Specimen>
    </>
  );
}
