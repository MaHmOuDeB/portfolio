// The planner's sentences that hold numbers and sources, drawn from its words (src/lib/lab/text-planner.ts)
// in either language: the sizing caption's first sentences in each context, the method and its formula,
// the duration caption, and the Lab's terms and run-time method. Every number is a <Fact>, a <Derived>
// that names its source, or a computed value marked simulated. Shared and hook-free: the server draws
// the presets with them and the lazy islands draw the live values.
import type { ReactNode } from 'react';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { getFact } from '@/lib/facts';
import { PLANNER_NOUN, type PlannerContext } from '@/lib/lab/full-planner-values';
import { PLANNER_ALPHA, PLANNER_POWER } from '@/lib/lab/planner-values';
import { EN_PLANNER, type PlannerText } from '@/lib/lab/text-planner';
import { sentenceNodes } from '@/lib/retention/sentence';
import { SAMPLE_SIZE_FORMULA } from '@/lib/stats';

const SIMULATED = ['simulated'] as const;

/** 34%: the observed baseline plus the uplift the win-back test was sized to detect, in whole points. */
function SourcedTarget({ text }: { text: PlannerText }) {
  const baseline = getFact('retention.winback.baseline_rate').value as number;
  const upliftPoints = getFact('retention.winback.uplift_pp').value as number;
  return (
    <Derived
      value={Math.round(baseline * 100 + upliftPoints) / 100}
      unit="share"
      decimals={0}
      refs={['retention.winback.baseline_rate', 'retention.winback.uplift_pp']}
      locale={text.kit.locale}
    />
  );
}

/** What the inputs are, per context: the first sentences of the sizing caption. */
export function SizingContextNote({ context, text = EN_PLANNER }: { context: PlannerContext; text?: PlannerText }): ReactNode {
  const locale = text.kit.locale;
  const values: Record<string, ReactNode> =
    context === 'retention'
      ? {
          baseline: <Fact id="retention.winback.baseline_rate" locale={locale} />,
          uplift: <Fact id="retention.winback.uplift_pp" locale={locale} />,
          target: <SourcedTarget text={text} />,
        }
      : {};
  return sentenceNodes(text.context[context].note, values);
}

/** The method and its assumptions, with the formula that produced the readout. */
export function SizingMethod({ context, text = EN_PLANNER }: { context: PlannerContext; text?: PlannerText }): ReactNode {
  const locale = text.kit.locale;
  return sentenceNodes(text.method, {
    alpha: <Derived value={PLANNER_ALPHA} unit="share" refs={SIMULATED} locale={locale} />,
    power: <Derived value={PLANNER_POWER} unit="share" refs={SIMULATED} locale={locale} />,
    noun: text.nouns[PLANNER_NOUN[context]].other,
    // The formula on a line of its own, wrapping at its spaces, with its full stop after it.
    formula: (
      <span data-formula="" className="my-2 block">
        <code {...derivedAttr(SIMULATED)}>{SAMPLE_SIZE_FORMULA}</code>.
      </span>
    ),
  });
}

/** The duration caption: hypothetical traffic, whole weeks rounded up, no promise of real visitors. */
export function DurationCaption({
  context,
  traffic,
  part = 'all',
  text = EN_PLANNER,
}: {
  context: PlannerContext;
  traffic: number;
  /** The Lab's method row takes only the sentences after the first. */
  part?: 'all' | 'rest';
  text?: PlannerText;
}): ReactNode {
  const words = text.context[context];
  if (part === 'rest') return text.durationRest;
  const first = sentenceNodes(words.durationFirst, {
    count: <Derived value={traffic} unit="count" refs={SIMULATED} locale={text.kit.locale} />,
  });
  return (
    <>
      {first} {text.durationRest}
      {words.durationExtra ? <> {words.durationExtra}</> : null}
    </>
  );
}

/** The terms the planner's method uses, each in one sentence, with the expert name for each. */
export function SizingTerms({ text = EN_PLANNER }: { text?: PlannerText }): ReactNode {
  const locale = text.kit.locale;
  const names = text.lab.termNames;
  const term = (name: string) => <strong className="font-semibold">{name}</strong>;
  const count = (value: number) => <Derived value={value} unit="count" refs={SIMULATED} locale={locale} />;
  return sentenceNodes(text.lab.terms, {
    sampleSize: term(names.sampleSize),
    mde: term(names.mde),
    power: term(names.power),
    alpha: term(names.alpha),
    powerShare: <Derived value={PLANNER_POWER} unit="share" refs={SIMULATED} locale={locale} />,
    hits: count(Math.round(PLANNER_POWER * 10)),
    of: count(10),
    alphaShare: <Derived value={PLANNER_ALPHA} unit="share" refs={SIMULATED} locale={locale} />,
    one: count(1),
    odds: count(Math.round(1 / PLANNER_ALPHA)),
  });
}

/** The Lab's run-time method: the weeks at the traffic set, rounded up, and what the traffic assumes. */
export function PlannerWeeksMethod({ traffic, text = EN_PLANNER }: { traffic: number; text?: PlannerText }): ReactNode {
  return sentenceNodes(text.lab.weeksMethod, {
    traffic: <Derived value={traffic} unit="count" refs={SIMULATED} locale={text.kit.locale} />,
    noun: traffic === 1 ? text.nouns.visitors.one : text.nouns.visitors.other,
    rest: <DurationCaption context="hypothetical" traffic={traffic} part="rest" text={text} />,
  });
}
