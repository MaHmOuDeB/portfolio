// The full planner's Figures, drawn from their inputs. The Retention page's pair: the sizing Figure
// (the visitors each group needs to detect a rise, shown in points or as a percent of the baseline)
// and the duration Figure (the whole weeks the test then needs at a given traffic). The Lab's merged
// Figure (LabPlannerView): the same model in one Figure, both readouts under one result line, in the
// Lab's reading model. Shared and hook-free: the server draws the presets with them (the static HTML,
// also the no-JS view) and the islands draw the live values with the same markup. Every computed
// number is marked 'simulated'; the Retention context's sourced baseline and target carry their fact
// refs (content/lab.tsx).
//
// `faultAfterChange` is a test seam, absent in production: with `changed`, the Figure's body throws,
// so a test can see the kit's error fallback after an input change. The island forwards it
// unchanged; the server never sets it.
import type { ReactNode } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { formatNumber } from '@/lib/figure/format';
import { fill } from '@/lib/i18n/template';
import {
  FULL_PLANNER_REFS,
  PLANNER_NOUN,
  countText,
  durationModel,
  fullPlanModel,
  fullPlanTable,
  durationTable,
  labPlanLead,
  labPlanModel,
  labPlanTable,
  normalizeFullPlan,
  normalizeLabPlan,
  normalizeTraffic,
  percentText,
  riseText,
  type FullPlanValues,
  type LabPlanValues,
  type PlannerContext,
} from '@/lib/lab/full-planner';
import { labKit, plural } from '@/lib/lab/text-common';
import { EN_PLANNER, type PlannerText } from '@/lib/lab/text-planner';
import { sentenceNodes } from '@/lib/retention/sentence';
import { Exhibit, PhonePoint } from './Exhibit';
import { DurationCaption, PlannerWeeksMethod, SizingContextNote, SizingMethod, SizingTerms } from './PlannerCopy';

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

/** The Lab's merged Figure's counterpart of SizingSeamFailure. */
function LabPlannerSeamFailure(): never {
  throw new Error('The planner readout failed after a change (test seam)');
}

/** The kind of case beside the result. The provenance badge comes from the Figure, not from here. */
function ResultBadge({ context, text }: { context: PlannerContext; text: PlannerText }) {
  return <span className="text-sm text-muted">{text.context[context].label}</span>;
}

/**
 * A large number and its unit. The number keeps room for the widest result the inputs allow, so
 * nothing beside or under it moves while it changes. With text enlarged that room can pass the screen,
 * so it is capped at the page's width (the page padding is 1rem a side) and the number then breaks.
 */
function Readout({
  value,
  unit,
  mark,
  locale,
}: {
  value: number;
  unit: string;
  mark: 'data-planner-n' | 'data-duration-weeks';
  locale: PlannerText['kit']['locale'];
}) {
  return (
    <div data-planner-readout="">
      <p className="text-3xl font-semibold">
        <data {...{ [mark]: '' }} data-num="" value={value} className="inline-block min-w-[min(6ch,calc(100vw-2rem))] wrap-anywhere" {...SIMULATED}>
          {formatNumber(value, 0, { locale })}
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
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: PlannerText;
};

export function SizingFigureView({ id, context, values, controls, announcement, preview, faultAfterChange, changed, text = EN_PLANNER }: SizingFigureViewProps) {
  const v = normalizeFullPlan(values);
  const plan = fullPlanModel(v);
  const noun = PLANNER_NOUN[context];
  const locale = text.kit.locale;
  return (
    <Figure
      id={id}
      title={text.context[context].sizingTitle}
      text={labKit(text.kit)}
      provenance="simulated"
      table={fullPlanTable(v, noun, text)}
      controls={controls}
      preview={preview}
      announcement={announcement}
      result={
        <>
          <span data-planner-result="" {...SIMULATED}>
            {sentenceNodes(text.sizingResult, {
              rise: riseText(v, text),
              from: percentText(v.baseline, text),
              to: percentText(plan.target, text),
            })}
          </span>{' '}
          <ResultBadge context={context} text={text} />
        </>
      }
      caption={
        <>
          <SizingContextNote context={context} text={text} /> <SizingMethod context={context} text={text} />
        </>
      }
    >
      <Readout value={plan.nPerArm} unit={fill(text.perGroup, { noun: text.nouns[noun].other })} mark="data-planner-n" locale={locale} />
      {faultAfterChange && changed ? <SizingSeamFailure /> : null}
    </Figure>
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
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: PlannerText;
};

export function DurationFigureView({
  id,
  context,
  nPerArm,
  traffic,
  controls,
  announcement,
  preview,
  faultAfterChange,
  changed,
  text = EN_PLANNER,
}: DurationFigureViewProps) {
  const t = normalizeTraffic(traffic);
  const { weeks } = durationModel(nPerArm, t);
  const noun = PLANNER_NOUN[context];
  const locale = text.kit.locale;
  return (
    <Figure
      id={id}
      title={text.context[context].durationTitle}
      text={labKit(text.kit)}
      provenance="simulated"
      table={durationTable(nPerArm, t, noun, text)}
      controls={controls}
      preview={preview}
      announcement={announcement}
      result={
        <>
          <span data-duration-result="" {...SIMULATED}>
            {sentenceNodes(text.durationResult, {
              count: countText(nPerArm, noun, text),
              all: formatNumber(2 * nPerArm, 0, { locale }),
              traffic: formatNumber(t, 0, { locale }),
              noun: text.nouns[noun].other,
            })}
          </span>{' '}
          <ResultBadge context={context} text={text} />
        </>
      }
      caption={<DurationCaption context={context} traffic={t} text={text} />}
    >
      <Readout value={weeks} unit={plural(weeks, text.weeksRounded)} mark="data-duration-weeks" locale={locale} />
      {faultAfterChange && changed ? <DurationSeamFailure /> : null}
    </Figure>
  );
}

export type LabPlannerViewProps = {
  id: string;
  values: LabPlanValues;
  controls?: ReactNode;
  announcement?: string;
  /** The island passes false, so a failure shows the kit's sentence and the current table only. */
  preview?: ReactNode;
  /** Test seam, as on the pair: with `changed`, the readout throws. */
  faultAfterChange?: true;
  /** Whether the visitor has committed a change since the island loaded. */
  changed?: boolean;
  /** The Figure's words and the language of its numbers; English when absent. */
  text?: PlannerText;
};

/**
 * The Lab's planner: one Figure in the reading model, three sliders and Reset, one result line in
 * plain words (power and the false-winner risk as "8 tests out of 10" and "1 in 20") and two
 * readouts, the visitors per group and the weeks. The method row holds the terms, the formula and the
 * assumptions.
 */
export function LabPlannerView({ id, values, controls, announcement, preview, faultAfterChange, changed, text = EN_PLANNER }: LabPlannerViewProps) {
  const v = normalizeLabPlan(values);
  const { nPerArm, weeks } = labPlanModel(v);
  const locale = text.kit.locale;
  const figure = (
    <Figure
      id={id}
      title={text.context.hypothetical.sizingTitle}
      text={labKit(text.kit)}
      lead={<PhonePoint label={text.exhibit.takeaway}>{text.lab.takeaway}</PhonePoint>}
      provenance="simulated"
      table={labPlanTable(v, text)}
      controls={controls}
      preview={preview}
      announcement={announcement}
      result={
        <span data-planner-result="" {...SIMULATED}>
          {labPlanLead(v, text)}
        </span>
      }
      caption={<SizingContextNote context="hypothetical" text={text} />}
    >
      <div className="flex flex-wrap gap-x-12 gap-y-6">
        <Readout value={nPerArm} unit={fill(text.perGroup, { noun: text.nouns.visitors.other })} mark="data-planner-n" locale={locale} />
        <Readout value={weeks} unit={plural(weeks, text.week)} mark="data-duration-weeks" locale={locale} />
      </div>
      {faultAfterChange && changed ? <LabPlannerSeamFailure /> : null}
    </Figure>
  );
  return (
    <Exhibit
      summary={text.lab.methodSummary}
      leadIn={text.lab.leadIn}
      takeaway={text.lab.takeaway}
      labels={text.exhibit}
      method={
        <>
          <p data-method-terms="">
            <SizingTerms text={text} />
          </p>
          <p data-method-text="">
            <SizingMethod context="hypothetical" text={text} />
          </p>
          <p data-method-text="">
            <PlannerWeeksMethod traffic={v.traffic} text={text} />
          </p>
        </>
      }
    >
      {figure}
    </Exhibit>
  );
}
