// The Home planner Figure, drawn from its two inputs: a hypothetical sign-up test, the visitors each
// group needs to detect the chosen rise. Shared and hook-free: the server draws the preset with it
// (the static HTML, also the no-JS view) and the island draws the live view with the same markup.
// Every number is marked 'simulated'; the formula in <code> is a build constant.
// The readout is the Figure's lead, above the controls, so a phone reader sees the number with the
// title; the body draws nothing more. If the view throws, the fallback shows the preset readout
// (`preview`: the island passes the server's, the server view its own).
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { formatNumber } from '@/lib/figure/format';
import {
  PLANNER_ALPHA,
  PLANNER_POWER,
  PLANNER_REFS,
  normalizePlanner,
  percentText,
  planModel,
  plannerTable,
  pointsText,
  type PlannerValues,
} from '@/lib/lab/planner';
import { SAMPLE_SIZE_FORMULA } from '@/lib/stats';

const SIMULATED = derivedAttr(PLANNER_REFS);

export const PLANNER_TITLE = 'Smaller rises need more visitors per group.';
export const HYPOTHETICAL = 'Hypothetical sign-up test';
export const BASELINE_NOTE = 'The baseline is a hypothetical sign-up conversion rate, not a figure from the case studies below.';

/**
 * The large number and its unit. The number keeps room for the widest result the inputs allow, so
 * nothing beside or under it moves while it changes.
 */
export function PlannerReadout({ values, presetNote }: { values: PlannerValues; presetNote?: boolean }) {
  const v = normalizePlanner(values);
  const { nPerArm } = planModel(v);
  return (
    <div data-planner-readout="">
      {presetNote ? (
        <p data-planner-preset="" className="mb-2 text-sm text-muted" {...SIMULATED}>
          Preset result at {percentText(v.baseline)} baseline conversion and a rise of {pointsText(v.risePoints)}.
        </p>
      ) : null}
      <p className="text-3xl font-semibold">
        <data data-planner-n="" data-num="" value={nPerArm} className="inline-block min-w-[6ch]" {...SIMULATED}>
          {formatNumber(nPerArm, 0)}
        </data>
      </p>
      <p className="mt-1 text-base">visitors per group</p>
    </div>
  );
}

export type PlannerFigureViewProps = {
  id: string;
  values: PlannerValues;
  controls?: ReactNode;
  announcement?: string;
  titleLevel?: 2 | 3 | 4;
  /** The server's preset readout for the error fallback; the island passes it. */
  preview?: ReactNode;
};

export function PlannerFigureView({ id, values, controls, announcement, titleLevel = 2, preview }: PlannerFigureViewProps) {
  const v = normalizePlanner(values);
  const { target } = planModel(v);
  return (
    <Figure
      id={id}
      title={PLANNER_TITLE}
      titleLevel={titleLevel}
      provenance="simulated"
      table={plannerTable(v)}
      lead={<PlannerReadout values={v} />}
      controls={controls}
      preview={preview ?? <PlannerReadout values={v} presetNote />}
      announcement={announcement}
      result={
        <>
          <span data-planner-result="" {...SIMULATED}>
            To detect a rise from {percentText(v.baseline)} to {percentText(target)}.
          </span>{' '}
          <span className="inline-flex flex-wrap items-center gap-x-2 align-baseline">
            <ProvenanceBadge kind="simulated" />
            <span className="text-sm text-muted">{HYPOTHETICAL}</span>
          </span>
        </>
      }
      caption={
        <>
          {BASELINE_NOTE} Sample sizes from Cohen&apos;s h for a two-sided test at a significance level of{' '}
          <span {...SIMULATED}>{PLANNER_ALPHA}</span> and a power of{' '}
          <span {...SIMULATED}>{Math.round(PLANNER_POWER * 100)}%</span>:{' '}
          <code className="wrap-anywhere" {...derivedAttr(['build'])}>
            {SAMPLE_SIZE_FORMULA}
          </code>
          .
        </>
      }
    >
      {null}
    </Figure>
  );
}
