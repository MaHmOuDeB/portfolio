'use client';

// The returns Figure's island, loaded by EagerOrIntent (ReturnsFigureClient imports it lazily). It
// reads and writes its URL state (`?returns.mode=raw`), draws the chosen mode and announces the
// result on a committed change only: a mode change or Reset.
//
// It passes `preview={false}` to the Figure: if its chart throws after a change, the fallback shows
// the kit's sentence and the table of the mode on screen, never a preset chart beside it.
// `faultAfterChange` (a test seam, absent in production) makes the chart throw on the first render
// after a mode change.
import { useState } from 'react';
import { instantly } from '@/components/kit/Figure';
import { useFigureParams } from '@/components/kit/useFigureParams';
import { factText } from '@/lib/facts/text';
import { sentenceText } from '@/lib/retention/sentence';
import { EN_RETURNS, type ReturnsText } from '@/lib/retention/text';
import {
  RETURNS_ID,
  RETURNS_PRESETS,
  RETURNS_SCHEMA,
  RULE_HOURS,
  comparisonPeriod,
  returnsTableFrom,
  type RetailMonth,
  type ReturnMode,
  type ReturnsEvidence,
} from '@/lib/retention/returns';
import { ReturnsControls } from './ReturnsFigureClient';
import { ReturnsFigureView } from './ReturnsView';

export type ReturnsInteractiveProps = {
  data: readonly RetailMonth[];
  evidence: ReturnsEvidence;
  faultAfterChange?: true;
  /** The Figure's words; English when absent. */
  text?: ReturnsText;
};

/** The announcement: the result line's first sentence, as plain text. */
function resultText(mode: ReturnMode, data: readonly RetailMonth[], text: ReturnsText): string {
  const locale = text.kit.locale;
  return sentenceText(text.lead[mode], {
    hours: String(RULE_HOURS),
    growth: factText(mode === 'raw' ? 'retail.returns.yoy_growth_raw' : 'retail.returns.yoy_growth_clean', { locale }),
    period: comparisonPeriod(data, { locale, words: text.period }),
    reversal: '',
  }).trimEnd();
}

export default function ReturnsInteractive({ data, evidence, faultAfterChange, text = EN_RETURNS }: ReturnsInteractiveProps) {
  const { values, preset, set, reset } = useFigureParams(RETURNS_ID, RETURNS_SCHEMA, RETURNS_PRESETS);
  const [announcement, setAnnouncement] = useState('');
  const [changed, setChanged] = useState(false);
  const mode = values.mode;
  return (
    <ReturnsFigureView
      mode={mode}
      data={data}
      evidence={evidence}
      table={returnsTableFrom(data, mode, text)}
      text={text}
      preview={false}
      announcement={announcement}
      faultAfterChange={faultAfterChange}
      changed={changed}
      controls={
        <ReturnsControls
          text={text}
          mode={mode}
          onMode={(next) => {
            set('mode', next);
            setChanged(true);
            setAnnouncement(resultText(next, data, text));
          }}
          onReset={() =>
            instantly(RETURNS_ID, () => {
              reset();
              setAnnouncement(resultText(RETURNS_PRESETS[preset]!.mode, data, text));
            })
          }
        />
      }
    />
  );
}
