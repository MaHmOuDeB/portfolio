// The "Static primitives" section of the kitchen sink: badge, callout, table, test note, updated
// label and progress line. All data is fictional; every number is marked 'simulated'.
import { Callout } from '@/components/kit/Callout';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { ProgressLine, UpdatedLabel } from '@/components/kit/LiveLabels';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { Specimen } from './Specimen';

const REFS = ['simulated'] as const;
const row = 'flex flex-wrap items-center gap-x-6 gap-y-3';

const FICTIONAL_TABLE: TableData = {
  columns: ['Group', 'Views', 'Conversions', 'Difference (points)'],
  rows: [
    ['Group A', 1353, 168, 0],
    ['Group B', 1301, 181, -0.4],
  ],
  refs: REFS,
};

// Fixed instants, so the baselines never change. The first pair is the same Berlin day, the second
// is the same UTC day but a different Berlin day.
const SAME_DAY = { updatedAt: '2026-07-01T12:05:00Z', renderedAt: '2026-07-01T20:00:00Z' };
const OTHER_DAY = { updatedAt: '2026-10-24T21:30:00Z', renderedAt: '2026-10-24T22:30:00Z' };
const PLANNED_END = '2026-11-15T10:00:00Z';

export function StaticSection() {
  return (
    <>
      <Specimen
        id="badge--all"
        title="Provenance badge"
        note="Three forms in one neutral style. The wording carries the meaning, not the colour."
      >
        <div className={row}>
          <ProvenanceBadge kind="simulated" />
          <ProvenanceBadge kind="public-data" />
          <ProvenanceBadge kind="live" />
        </div>
      </Specimen>
      <Specimen id="callout--titled" title="Callout" note="A short note with a rule at the left, for limits and caveats.">
        <div className="grid gap-6">
          <Callout title="A limit of this fictional run">
            The groups are simulated, so the difference says nothing about a real site.
          </Callout>
          <Callout>A callout without a title reads as one plain note.</Callout>
        </div>
      </Specimen>
      <Specimen
        id="table--disclosure"
        title="Data table, folded"
        note="The fallback under a chart: a details element whose summary is a full-height touch target."
      >
        <DataTable
          id="sink-table-folded"
          caption="Views and conversions by group in a fictional run"
          table={FICTIONAL_TABLE}
          mode="disclosure"
        />
      </Specimen>
      <Specimen id="table--open" title="Data table, open" note="The bare table, as shown when JavaScript is off.">
        <DataTable
          id="sink-table-open"
          caption="Views and conversions by group in a fictional run, open"
          table={FICTIONAL_TABLE}
          mode="open"
        />
      </Specimen>
      <Specimen
        id="testnote--ab-early"
        title="Test note: A/B, early"
        note="Fewer than fifty views in the smaller group, so no view count."
      >
        <PhaseLabel note={{ mode: 'ab', arm: 'b', nA: 49, nB: 49 }} href="/kitchen-sink" refs={REFS} />
      </Specimen>
      <Specimen
        id="testnote--ab-counted"
        title="Test note: A/B, counted"
        note="Fifty or more in the smaller group, so the total views follow the link."
      >
        <PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 162, nB: 50 }} href="/kitchen-sink" refs={REFS} />
      </Specimen>
      <Specimen id="testnote--calibration" title="Test note: calibration">
        <PhaseLabel note={{ mode: 'calibration' }} href="/kitchen-sink" refs={REFS} />
      </Specimen>
      <Specimen id="testnote--paused" title="Test note: paused" note="The link's accessible name says what it explains.">
        <PhaseLabel note={{ mode: 'paused' }} href="/kitchen-sink" refs={REFS} />
      </Specimen>
      <Specimen
        id="updated--labels"
        title="Updated label"
        note="Berlin time. The date is added when the update was on another Berlin day than the render."
      >
        <div className={row}>
          <UpdatedLabel {...SAME_DAY} refs={REFS} />
          <UpdatedLabel {...OTHER_DAY} refs={REFS} />
        </div>
      </Specimen>
      <Specimen
        id="progress--states"
        title="Progress line"
        note="A native progress element that names the group it counts: empty, part way and complete."
      >
        <div className="grid gap-6">
          <ProgressLine nSmaller={0} target={50} plannedEnd={PLANNED_END} refs={REFS} />
          <ProgressLine nSmaller={12} target={50} plannedEnd={PLANNED_END} refs={REFS} />
          <ProgressLine nSmaller={50} target={50} plannedEnd={PLANNED_END} refs={REFS} />
        </div>
      </Specimen>
    </>
  );
}
