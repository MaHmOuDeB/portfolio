// Plan 06 Task 3: the live kit components take their refs explicitly (a live component that forgot
// them would silently claim 'live'), and the pre-registered values come from the config.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { liveFixture } from '@/app/kitchen-sink/_parts/live-fixtures';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { ProgressLine, UpdatedLabel } from '@/components/kit/LiveLabels';
import { LiveStateBody } from '@/components/kit/LiveStateBody';
import { NowRow } from '@/components/kit/NowRow';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { EXPERIMENT } from '@/experiment.config';
import { confidenceTable, liveFigureState, type LiveSnapshot } from '@/lib/figure/cs-band';
import { MIN_PER_GROUP, resolveFigureBody } from '@/lib/figure/states';

const SIM = ['simulated'] as const;
const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const bodyOf = (s: LiveSnapshot) => resolveFigureBody(liveFigureState(s));
const AB = liveFixture('ab', 'enough-data', 'fresh');
const PLANNED = '2026-11-15T10:00:00Z';

describe('required refs', () => {
  it('rejects every live component and confidenceTable without refs (type level)', () => {
    // These only compile-check; none is rendered.
    // @ts-expect-error refs is required
    const phase = <PhaseLabel note={{ mode: 'calibration' }} href="/x" />;
    // @ts-expect-error refs is required
    const updated = <UpdatedLabel updatedAt={PLANNED} renderedAt={PLANNED} />;
    // @ts-expect-error refs is required
    const progress = <ProgressLine nSmaller={1} target={50} plannedEnd={PLANNED} plannedEndKind="fixed" />;
    // @ts-expect-error refs is required
    const chart = <ConfidenceChart id="x" snapshot={AB} body="ab" />;
    // @ts-expect-error refs is required
    const row = <NowRow domain={[-1, 1]} interval={{ lower: -1, upper: 1 }} />;
    // @ts-expect-error refs is required
    const live = <LiveStateBody id="x" snapshot={AB} body="ab" />;
    // @ts-expect-error id is required
    const noId = <LiveStateBody snapshot={AB} body="ab" refs={SIM} />;
    // @ts-expect-error refs is required
    const table = confidenceTable(AB);
    expect([phase, updated, progress, chart, row, live, noId, table]).toHaveLength(8);
  });

  it('claims no live data when every component is given simulated refs', () => {
    const html = [
      renderToStaticMarkup(<PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 60, nB: 60 }} href="/x" refs={SIM} />),
      renderToStaticMarkup(<UpdatedLabel updatedAt={PLANNED} renderedAt={PLANNED} refs={SIM} />),
      renderToStaticMarkup(<ProgressLine nSmaller={3} target={50} plannedEnd={PLANNED} plannedEndKind="fixed" refs={SIM} />),
      renderToStaticMarkup(<NowRow domain={[-1, 1]} interval={{ lower: -1, upper: 1 }} refs={SIM} />),
      renderToStaticMarkup(
        <NowRow
          domain={[-1, 1]}
          collecting={{ nSmaller: 3, plannedEnd: PLANNED, plannedEndKind: 'earliest' }}
          refs={SIM}
        />,
      ),
      renderToStaticMarkup(<ConfidenceChart id="x" snapshot={AB} body={bodyOf(AB)} refs={SIM} />),
      renderToStaticMarkup(<LiveStateBody id="x" snapshot={AB} body={bodyOf(AB)} refs={SIM} />),
      JSON.stringify(confidenceTable(AB, SIM)),
    ].join('\n');
    expect(html).not.toContain('data-derived="live"');
    expect(html).not.toContain('"live"');
    expect(html).toContain('data-derived="simulated"');
  });
});

describe('pre-registered constants', () => {
  it('takes the view threshold from the config', () => {
    expect(MIN_PER_GROUP).toBe(EXPERIMENT.minPerGroup);
  });

  it('keeps the six-month cap the kit copy names', () => {
    expect(EXPERIMENT.ab.capMonths, 'the kit says "six-month limit"; change that copy with the cap').toBe(6);
  });

  it('prints the guardrail window from the config', () => {
    const html = renderToStaticMarkup(<LiveStateBody id="x" snapshot={AB} body={bodyOf(AB)} refs={SIM} />);
    expect(plain(html)).toContain(`Leaving within ${EXPERIMENT.guardrail.quickExitSeconds} seconds`);
  });
});

describe('a failed calibration with no restart date yet', () => {
  const failed = liveFixture('aa-failed', 'enough-data', 'fresh');
  const open: LiveSnapshot = { ...failed, aaFailed: { on: '2026-10-13T10:00:00Z', reason: 'the split check failed' } };

  it('says it stopped and leaves out the restart sentence', () => {
    const text = plain(renderToStaticMarkup(<LiveStateBody id="x" snapshot={open} body={bodyOf(open)} refs={SIM} />));
    expect(text).toContain('Calibration stopped on 13.10: the split check failed.');
    expect(text).not.toContain('restarts');
    expect(text).toContain('Views when it stopped: 212 in A, 148 in B.');
  });

  it('keeps the restart sentence when the date is set', () => {
    const text = plain(renderToStaticMarkup(<LiveStateBody id="x" snapshot={failed} body={bodyOf(failed)} refs={SIM} />));
    expect(text).toContain('Calibration stopped on 13.10: the split check failed. Calibration restarts on 20.10.');
  });
});

describe('the planned end', () => {
  it('reads "Earliest end" during the calibration', () => {
    const html = renderToStaticMarkup(
      <ProgressLine nSmaller={12} target={50} plannedEnd={PLANNED} plannedEndKind="earliest" refs={SIM} />,
    );
    expect(plain(html)).toContain('Earliest end: 15.11.');
    expect(plain(html)).not.toContain('Planned end');
  });

  it('reads "Planned end" when it is fixed', () => {
    const html = renderToStaticMarkup(
      <ProgressLine nSmaller={12} target={50} plannedEnd={PLANNED} plannedEndKind="fixed" refs={SIM} />,
    );
    expect(plain(html)).toContain('Planned end: 15.11.');
  });

  it('follows the snapshot into the collecting row', () => {
    const calibrating = liveFixture('calibration', 'low-data', 'fresh');
    expect(calibrating.plannedEndKind).toBe('earliest');
    const text = plain(
      renderToStaticMarkup(<ConfidenceChart id="x" snapshot={calibrating} body={bodyOf(calibrating)} refs={SIM} />),
    );
    expect(text).toContain('Earliest end:');
    const ab = liveFixture('ab', 'low-data', 'fresh');
    expect(ab.plannedEndKind).toBe('fixed');
    expect(plain(renderToStaticMarkup(<ConfidenceChart id="x" snapshot={ab} body={bodyOf(ab)} refs={SIM} />))).toContain(
      'Planned end:',
    );
  });

  it('accepts the day of a final decision without changing the body', () => {
    const decided: LiveSnapshot = { ...liveFixture('ship-b', 'enough-data', 'fresh') };
    const withDay: LiveSnapshot = { ...decided, decidedOn: '2026-12-01T00:00:00+01:00' };
    const render = (s: LiveSnapshot) => renderToStaticMarkup(<LiveStateBody id="x" snapshot={s} body={bodyOf(s)} refs={SIM} />);
    expect(render(withDay)).toBe(render(decided));
  });
});
