// The returns-cleaning Figure as a page places it. The server reads the export: it draws the clean
// preset with the sourced table (the static HTML, also what a visitor without JavaScript keeps, with
// the open table), and hands the island only the monthly rows it plots (their returns columns, not
// the sales ones), the badge and the January reversal's date. The island loads on intent, or at
// once for a URL with `returns.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a mode change. Only a test host sets it.
import { getFact } from '@/lib/facts';
import { RETAIL, figureProvenance } from '@/lib/retention/data';
import { RETURNS_PRESETS, returnsPlotRows, type ReturnsEvidence } from '@/lib/retention/returns';
import { EN_RETURNS, type ReturnsText } from '@/lib/retention/text';
import { returnsTable } from '@/lib/retention/tables';
import { InertReturnsControls, ReturnsFigureClient } from './ReturnsFigureClient';
import { ReturnsFigureView } from './ReturnsView';

/** The reversed order behind most of the January to November change, found by its fact value. */
function januaryReversalDate(): string {
  const value = getFact('retail.reversal.january_gbp').value;
  const row = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === value);
  if (!row) throw new Error('retail: the January reversal is not in largest_reversals');
  return row.date;
}

/**
 * `text` is the Figure's words in a language other than English; English (the default) hands the
 * island nothing, so its markup and its payload are what they always were.
 */
export function ReturnsFigure({ faultAfterChange, text }: { faultAfterChange?: true; text?: ReturnsText } = {}) {
  const data = returnsPlotRows(RETAIL.tables.monthly);
  const evidence: ReturnsEvidence = { provenance: figureProvenance('retail'), januaryReversalDate: januaryReversalDate() };
  const mode = RETURNS_PRESETS.default.mode;
  const view = (
    <ReturnsFigureView
      mode={mode}
      data={data}
      evidence={evidence}
      table={returnsTable(mode, text ?? EN_RETURNS)}
      controls={text ? <InertReturnsControls mode={mode} text={text} /> : <InertReturnsControls mode={mode} />}
      text={text}
    />
  );
  // A client component gets `text` only in a language other than English, so the English payload is unchanged.
  return text ? (
    <ReturnsFigureClient preview={view} data={data} evidence={evidence} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <ReturnsFigureClient preview={view} data={data} evidence={evidence} faultAfterChange={faultAfterChange} />
  );
}
