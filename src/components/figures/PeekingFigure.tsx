// The peeking Figure ("More looks, more false winners") as a page places it. The server looks the
// preset up (daily, 20 looks, no fix) and draws it with its table: the static HTML, also what a
// visitor without JavaScript keeps, with the open table. The island loads on intent, or at once for
// a URL with this Figure's keys (`?peeking.preset=interview` among them), and receives the preset's
// view. Nothing simulates in the browser: every view is a lookup in the precomputed table.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a committed change. Only a test host sets it.
import { computePeek } from '@/lib/lab/peeking';
import { PEEK_ID, PEEK_PRESETS } from '@/lib/lab/peeking-values';
import { InertPeekingControls, PeekingFigureClient } from './PeekingFigureClient';
import { PeekingFigureView } from './PeekingView';

export function PeekingFigure({ id = PEEK_ID, faultAfterChange }: { id?: string; faultAfterChange?: true }) {
  const initial = computePeek(PEEK_PRESETS.default);
  return (
    <PeekingFigureClient
      id={id}
      initial={initial}
      preview={<PeekingFigureView id={id} view={initial} controls={<InertPeekingControls id={id} values={initial.values} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}
