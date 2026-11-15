// The full planner's two Figures, drawn from their inputs: the sizing Figure (the visitors each
// group needs to detect a rise, shown in points or as a percent of the baseline) and the duration
// Figure (the whole weeks the test then needs at a given traffic). Shared and hook-free: the server
// draws the preset pair with them (the static HTML, also the no-JS view) and the island draws the
// live pair with the same markup. Every computed number is marked 'simulated'; the Retention
// context's sourced baseline and target carry their fact refs (content/lab.tsx).
//
// `faultAfterChange` is a test seam, absent in production: with `changed`, the Figure's body throws,
// so a test can see the kit's error fallback after an input change. The island forwards it
// unchanged; the server never sets it.
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import {
  FULL_PLANNER_REFS,
  PLANNER_NOUN,
  countText,
  durationModel,
  fullPlanModel,
  fullPlanTable,
  durationTable,
  normalizeFullPlan,
  normalizeTraffic,
  percentText,
  riseText,
  type FullPlanValues,
  type PlannerContext,
} from '@/lib/lab/full-planner';
import {
  DURATION_LEAD_IN,
  DURATION_TAKEAWAY,
  DurationCaption,
  PLANNER_COPY,
  SIZING_LEAD_IN,
  SIZING_TAKEAWAY,
  SizingContextNote,
  SizingMethod,
  SizingTerms,
} from '../../../content/lab';
import { Exhibit, PhonePoint } from './Exhibit';

const SIMULATED = derivedAttr(FULL_PLANNER_REFS);

/** The pair's layout, the same in the preview and the island, so nothing moves when one replaces the other. */
export const PAIR_CLASS = 'flex flex-col gap-12';

/**
 * Thrown by the test seam: a failure after a change, for the error fallback's tests. Its body is
 * exactly one throw with a literal message, the only shape the fault-seam guard accepts.
 */
function SizingSeamFailure(): never {
  throw new Error('The sizing readout failed after a change (test seam)');
}

/** The duration Figure's counterpart of SizingSeamFailure. */
function DurationSeamFailure(): never {
  throw new Error('The duration readout failed after a change (test seam)');
}

/** The kind of case beside the result. The provenance badge comes from the Figure, not from here. */
function ResultBadge({ context }: { context: PlannerContext }) {
  return <span className="text-sm text-muted">{PLANNER_COPY[context].label}</span>;
}

/**
 * A large number and its unit. The number keeps room for the widest result the inputs allow, so
 * nothing beside or under it moves while it changes.
 */
function Readout({ value, unit, mark }: { value: number; unit: string; mark: 'data-planner-n' | 'data-duration-weeks' }) {
  return (
    <div data-planner-readout="">
      <p className="text-3xl font-semibold">
        <data {...{ [mark]: '' }} data-num="" value={value} className="inline-block min-w-[6ch]" {...SIMULATED}>
          {formatNumber(value, 0)}
        </data>
      </p>
      <p className="mt-1 text-base">{unit}</p>
    </div>
  );
}

export type SizingFigureViewProps = {
  id: string;
  context: PlannerContext;
  values: FullPlanValues;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /**
   * Test seam, absent in production: with `changed`, the readout throws, so a test can see the error
   * fallback. The island forwards it unchanged; the server never sets it.
   */
  faultAfterChange?: true;
  /** Whether the visitor has committed a change to this Figure since the island loaded. */
  changed?: boolean;
};

export function SizingFigureView({ id, context, values, controls, announcement, preview, faultAfterChange, changed }: SizingFigureViewProps) {
  const v = normalizeFullPlan(values);
  const plan = fullPlanModel(v);
  const noun = PLANNER_NOUN[context];
  // The Lab shows the exhibit in the reading model; the Retention page places the bare Figure itself.
  const exhibit = context === 'hypothetical';
  const figure = (
    <Figure
      id={id}
      title={PLANNER_COPY[context].sizingTitle}
      lead={exhibit ? <PhonePoint>{SIZING_TAKEAWAY}</PhonePoint> : undefined}
      provenance="simulated"
      table={fullPlanTable(v, noun)}
      controls={controls}
      preview={preview}
      announcement={announcement}
      result={
        <>
          <span data-planner-result="" {...SIMULATED}>
            To detect a rise of {riseText(v)}, from {percentText(v.baseline)} to {percentText(plan.target)}.
          </span>{' '}
          <ResultBadge context={context} />
        </>
      }
      caption={
        exhibit ? (
          <SizingContextNote context={context} />
        ) : (
          <>
            <SizingContextNote context={context} /> <SizingMethod context={context} />
          </>
        )
      }
    >
      <Readout value={plan.nPerArm} unit={`${noun} per group`} mark="data-planner-n" />
      {faultAfterChange && changed ? <SizingSeamFailure /> : null}
    </Figure>
  );
  if (!exhibit) return figure;
  return (
    <Exhibit
      summary="The method behind the sample size"
      leadIn={SIZING_LEAD_IN}
      takeaway={SIZING_TAKEAWAY}
      method={
        <>
          <p data-method-terms="">
            <SizingTerms />
          </p>
          <p data-method-text="">
            <SizingMethod context={context} />
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}

export type DurationFigureViewProps = {
  id: string;
  context: PlannerContext;
  /** The sizing Figure's result: the visitors each group must reach. */
  nPerArm: number;
  traffic: number;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /** Test seam, as on the sizing Figure: with `changed`, the readout throws. */
  faultAfterChange?: true;
  /** Whether the visitor has committed a traffic change since the island loaded. */
  changed?: boolean;
};

export function DurationFigureView({ id, context, nPerArm, traffic, controls, announcement, preview, faultAfterChange, changed }: DurationFigureViewProps) {
  const t = normalizeTraffic(traffic);
  const { weeks } = durationModel(nPerArm, t);
  const noun = PLANNER_NOUN[context];
  const exhibit = context === 'hypothetical';
  const figure = (
    <Figure
      id={id}
      title={PLANNER_COPY[context].durationTitle}
      lead={exhibit ? <PhonePoint>{DURATION_TAKEAWAY}</PhonePoint> : undefined}
      provenance="simulated"
      table={durationTable(nPerArm, t, noun)}
      controls={controls}
      preview={preview}
      announcement={announcement}
      result={
        <>
          <span data-duration-result="" {...SIMULATED}>
            To reach {countText(nPerArm, noun)} per group, {formatNumber(2 * nPerArm, 0)} in all, at {formatNumber(t, 0)}{' '}
            {noun} a day.
          </span>{' '}
          <ResultBadge context={context} />
        </>
      }
      caption={<DurationCaption context={context} traffic={t} part={exhibit ? 'first' : 'all'} />}
    >
      <Readout value={weeks} unit={`${weeks === 1 ? 'week' : 'weeks'}, rounded up`} mark="data-duration-weeks" />
      {faultAfterChange && changed ? <DurationSeamFailure /> : null}
    </Figure>
  );
  if (!exhibit) return figure;
  return (
    <Exhibit
      summary="The method behind the run time"
      leadIn={DURATION_LEAD_IN}
      takeaway={DURATION_TAKEAWAY}
      method={
        <p data-method-text="">
          <DurationCaption context={context} traffic={t} part="rest" />
        </p>
      }
    >
      {figure}
    </Exhibit>
  );
}
