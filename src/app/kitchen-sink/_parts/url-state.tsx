'use client';

// The "URL state" section of the kitchen sink: two fictional Figures, `demo` and `demo-b`, on one
// page. Each reads its own `?<id>.<param>` keys through useFigureParams and writes them back as the
// controls move; Reset clears only its own keys. Each sits in a <Suspense> whose fallback is the
// same view at the default preset: that is what the static HTML shows (a prerendered page cannot
// see the query), and the client renders the URL's state in its place without hydrating it.
// Every number here is marked 'simulated'.
import { Suspense } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import { useFigureParams } from '@/components/kit/useFigureParams';
import type { ParamValues, Presets } from '@/lib/figure/url-state';
import { Specimen } from './Specimen';

const SCHEMA = {
  baseline: { kind: 'number', min: 0.01, max: 0.5, step: 0.01 },
  tail: { kind: 'enum', values: ['two', 'one'] },
} as const;
type Values = ParamValues<typeof SCHEMA>;
type Key = keyof typeof SCHEMA;

const PRESETS: Presets<typeof SCHEMA> = {
  default: { baseline: 0.29, tail: 'two' },
  interview: { baseline: 0.1, tail: 'one' },
};

const TAIL_OPTIONS = [
  { value: 'two', label: 'Two-sided' },
  { value: 'one', label: 'One-sided' },
] as const;
const TAIL_WORD = { two: 'two-sided', one: 'one-sided' } as const;

const REFS = ['simulated'] as const;
const SIMULATED = derivedAttr(REFS);
const baselineText = (v: number) => `${v} baseline rate`;
const noop = () => {};

type ViewProps = {
  id: string;
  values: Values;
  preset: string;
  /** 'server' for the static fallback, 'url' once the client has read the URL. */
  from: 'server' | 'url';
  onSet: <K extends Key>(key: K, value: Values[K]) => void;
  onReset: () => void;
};

function View({ id, values, preset, from, onSet, onReset }: ViewProps) {
  return (
    <div data-figure={id} data-preset={preset} data-state-from={from} className="min-w-0">
      <p className="text-sm font-semibold">
        Figure <code>{id}</code>
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="w-full xs:w-80">
          <Slider
            id={`${id}-baseline`}
            label="Baseline rate"
            {...SCHEMA.baseline}
            value={values.baseline}
            onChange={(v) => onSet('baseline', v)}
            valueText={baselineText}
            refs={REFS}
          />
        </div>
        <Segmented
          name={`${id}-tail`}
          legend="Test"
          options={TAIL_OPTIONS}
          value={values.tail}
          onChange={(v) => onSet('tail', v)}
        />
        <ResetButton onReset={onReset} />
      </div>
      <p data-readout {...SIMULATED} className="mt-4 text-sm text-muted">
        Baseline rate {values.baseline}, {TAIL_WORD[values.tail]}, from the {preset} preset.
      </p>
    </div>
  );
}

function FromUrl({ id }: { id: string }) {
  const { values, preset, set, reset } = useFigureParams(id, SCHEMA, PRESETS);
  return <View id={id} values={values} preset={preset} from="url" onSet={set} onReset={reset} />;
}

function UrlFigure({ id }: { id: string }) {
  return (
    <Suspense
      fallback={<View id={id} values={PRESETS.default} preset="default" from="server" onSet={noop} onReset={noop} />}
    >
      <FromUrl id={id} />
    </Suspense>
  );
}

export function UrlStateSection() {
  return (
    <Specimen
      id="url-state--two-figures"
      title="Two Figures sharing one URL"
      note="Each Figure keeps its own keys in the query string, like ?demo.tail=one, and a preset key picks a named starting point that explicit keys override. Moving a control rewrites the URL a quarter of a second after the last change, without adding to the Back history. Reset clears only its own Figure's keys."
    >
      <div className="flex flex-col gap-8">
        <UrlFigure id="demo" />
        <UrlFigure id="demo-b" />
      </div>
    </Specimen>
  );
}
