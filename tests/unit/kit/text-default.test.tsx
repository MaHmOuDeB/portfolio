// The kit's default (English) markup, fixed before the kit text moved into `KitText`: each scenario's
// server-rendered HTML (with React's text separators, as the build writes it) must hash to the value
// recorded from the code as it was. A change of a single character of English kit text breaks it.
import { createHash } from 'node:crypto';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { liveFixture, FRESHNESS_KINDS, pausedAbAboveZeroFixture } from '@/app/(en)/kitchen-sink/_parts/live-fixtures';
import { CharacterCount } from '@/components/kit/CharacterCount';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { Fact } from '@/components/kit/Fact';
import { Field } from '@/components/kit/Field';
import { Figure, FigureErrorFallback } from '@/components/kit/Figure';
import { ProgressLine, UpdatedLabel } from '@/components/kit/LiveLabels';
import { LiveStateBody } from '@/components/kit/LiveStateBody';
import { NowRow } from '@/components/kit/NowRow';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';
import { ResetButton } from '@/components/kit/ResetButton';
import { SelectField } from '@/components/kit/SelectField';
import { Slider } from '@/components/kit/Slider';
import { StepNav } from '@/components/kit/StepNav';
import { TextArea } from '@/components/kit/TextArea';
import { FACTS, type FactId } from '@/lib/facts';
import { liveFigureState } from '@/lib/figure/cs-band';
import { DATA_AMOUNTS, LIVE_PHASES, resolveFigureBody } from '@/lib/figure/states';

const REFS = ['simulated'] as const;
const noop = () => {};
const hash = (html: string) => createHash('sha256').update(html).digest('hex').slice(0, 16);
const TABLE: TableData = { columns: ['Rise', 'Visitors'], rows: [[1, 30_000]], refs: REFS, note: 'A note.' };
const CHART = <svg role="img" aria-label="A fictional chart" />;
const FACT_ID = Object.keys(FACTS)[0] as FactId;

const scenarios: Record<string, () => string> = {};
const add = (name: string, node: () => React.ReactElement) => {
  scenarios[name] = () => renderToString(node());
};

add('fact', () => <Fact id={FACT_ID} />);
for (const kind of ['simulated', 'public-data', 'live'] as const) add(`badge ${kind}`, () => <ProvenanceBadge kind={kind} />);
add('reset', () => <ResetButton onReset={noop} id="r" />);
add('stepnav', () => <StepNav current={3} total={5} onChange={noop} label="Steps" refs={REFS} id="s" />);
add('slider', () => (
  <Slider id="sl" label="Looks" min={1} max={50} step={1} value={20} onChange={noop} valueText={(v) => `${v} looks`} refs={REFS} />
));
add('select', () => <SelectField id="se" name="se" label="Reason" options={[{ value: 'a', label: 'A' }]} />);
add('field error', () => (
  <Field id="f" label="Name" hint="A hint" error="Too short">
    {() => <input id="f" />}
  </Field>
));
add('textarea', () => <TextArea id="t" name="t" label="Message" limit={2000} refs={REFS} />);
add('character count', () => <CharacterCount id="c" controlId="t" limit={2000} refs={REFS} />);
add('table disclosure', () => <DataTable id="d" caption="Caption" table={TABLE} mode="disclosure" noJsNote="Controls need JavaScript." />);
add('table disclosure plain', () => <DataTable id="d" caption="Caption" table={TABLE} mode="disclosure" />);
for (const body of ['static', 'live', 'diagram'] as const) {
  add(`fallback ${body}`, () => <FigureErrorFallback id="x" body={body} preview={CHART} table={TABLE} />);
}
add('figure default', () => (
  <Figure id="demo" title="A finding." caption="Caption." provenance="simulated" table={TABLE} lead={<span>Lead</span>} controls={<button type="button">C</button>} result="Result">
    {CHART}
  </Figure>
));
add('figure no-js', () => (
  <Figure id="demo" title="A finding." caption="Caption." provenance="public-data" table={TABLE} controls={<button type="button">C</button>} state={{ runtime: 'no-js' }}>
    {CHART}
  </Figure>
));
add('figure error', () => (
  <Figure id="demo" title="A finding." caption="Caption." provenance="live" table={TABLE} state={{ runtime: 'error' }}>
    {CHART}
  </Figure>
));
add('figure untitled caption', () => (
  <Figure id="demo" title={<span>Node title</span>} caption="Caption." provenance="simulated" table={TABLE}>
    {CHART}
  </Figure>
));
add('figure diagram', () => (
  <Figure id="demo" kind="diagram" title="Steps" caption="Caption.">
    {CHART}
  </Figure>
));
add('figure diagram error', () => (
  <Figure id="demo" kind="diagram" title="Steps" caption="Caption." state={{ runtime: 'error' }}>
    {CHART}
  </Figure>
));
add('figure stale', () => (
  <Figure
    id="demo"
    title="A finding."
    caption="Caption."
    provenance="live"
    table={TABLE}
    state={{ live: { phase: 'ab', data: 'enough-data', freshness: { kind: 'stale', updatedAt: '2026-10-24T22:30:00Z', renderedAt: '2026-10-25T12:00:00Z' } } }}
  >
    {CHART}
  </Figure>
));
add('updated same day', () => <UpdatedLabel updatedAt="2026-10-25T12:05:00Z" renderedAt="2026-10-25T14:00:00Z" refs={REFS} />);
add('updated other day', () => <UpdatedLabel updatedAt="2026-10-24T22:30:00Z" renderedAt="2026-10-25T14:00:00Z" refs={REFS} />);
add('progress fixed', () => <ProgressLine nSmaller={12} target={50} plannedEnd="2027-05-01T00:00:00Z" plannedEndKind="fixed" refs={REFS} />);
add('progress earliest', () => <ProgressLine nSmaller={12} target={50} plannedEnd="2027-05-01T00:00:00Z" plannedEndKind="earliest" refs={REFS} />);
add('phase paused', () => <PhaseLabel note={{ mode: 'paused' }} href="/experiment" refs={REFS} />);
add('phase calibration', () => <PhaseLabel note={{ mode: 'calibration' }} href="/experiment" refs={REFS} />);
add('phase ab few', () => <PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 3, nB: 4 }} href="/experiment" refs={REFS} />);
add('phase ab many', () => <PhaseLabel note={{ mode: 'ab', arm: 'b', nA: 300, nB: 400 }} href="/experiment" refs={REFS} />);
add('nowrow interval', () => <NowRow domain={[-2, 2]} interval={{ lower: -0.5, upper: 1.2 }} refs={REFS} />);
for (const label of ['now', 'final', 'last'] as const) {
  add(`nowrow ${label}`, () => <NowRow domain={[-2, 2]} interval={{ lower: -0.5, upper: 1.2 }} label={label} refs={REFS} />);
}
for (const [n, due] of [[12, false], [80, false], [80, true]] as const) {
  add(`nowrow collecting ${n} ${due}`, () => (
    <NowRow domain={[-1, 1]} collecting={{ nSmaller: n, plannedEnd: '2027-05-01T00:00:00Z', plannedEndKind: 'fixed', due }} refs={REFS} />
  ));
}
for (const phase of LIVE_PHASES) {
  for (const data of DATA_AMOUNTS) {
    for (const fresh of FRESHNESS_KINDS) {
      const s = () => liveFixture(phase, data, fresh);
      const body = () => resolveFigureBody(liveFigureState(s()));
      add(`live body ${phase} ${data} ${fresh}`, () => <LiveStateBody id="x" snapshot={s()} body={body()} refs={REFS} />);
      add(`chart ${phase} ${data} ${fresh}`, () => <ConfidenceChart id="x" snapshot={s()} body={body()} refs={REFS} />);
    }
  }
}
add('chart paused ab above zero', () => (
  <ConfidenceChart id="x" snapshot={pausedAbAboveZeroFixture()} body="paused" refs={REFS} />
));
add('body paused ab above zero', () => (
  <LiveStateBody id="x" snapshot={pausedAbAboveZeroFixture()} body="paused" refs={REFS} />
));

const EXPECTED: Record<string, string> = {
  "fact": "53cdc930476f0b5e",
  "badge simulated": "e245a9013056b658",
  "badge public-data": "aa8b10f4e64ea1ff",
  "badge live": "fee96f24662c8756",
  "reset": "47db52e1735db159",
  "stepnav": "e4b05fcf28a1ee6e",
  "slider": "c92810612a7614f0",
  "select": "5c8d1d1ee985805f",
  "field error": "d40d02634ac90ecc",
  "textarea": "3575e80da3d3f66e",
  "character count": "1c6c01375a0ddaa2",
  "table disclosure": "dacc6d41dce7d098",
  "table disclosure plain": "0375d26b037df3c4",
  "fallback static": "8b516462424a36aa",
  "fallback live": "d929de56dc31bfb7",
  "fallback diagram": "d4972eded4fb804f",
  "figure default": "ff771e787dd5e156",
  "figure no-js": "ba034f0027eb1026",
  "figure error": "e91e870dfa7de181",
  "figure untitled caption": "cff219795d0f2a2a",
  "figure diagram": "c4e0353608503abc",
  "figure diagram error": "00117131e5d8ec30",
  "figure stale": "25ddf24421065326",
  "updated same day": "3b5abe723bd80d06",
  "updated other day": "d777ca8c84dde5dc",
  "progress fixed": "d3879367099a62a6",
  "progress earliest": "831a000285bf844c",
  "phase paused": "07eecdbaa1a8487d",
  "phase calibration": "e0eeb45dd123cc81",
  "phase ab few": "d39dff43b499cee8",
  "phase ab many": "fe1878f8aaf3e23f",
  "nowrow interval": "59288cac9cebcb7c",
  "nowrow now": "59288cac9cebcb7c",
  "nowrow final": "7f10912f75b65668",
  "nowrow last": "61c39ab7ac4af304",
  "nowrow collecting 12 false": "e21b31a100f39fa9",
  "nowrow collecting 80 false": "b2766a8f49c448d4",
  "nowrow collecting 80 true": "5a55a1e9d2631728",
  "live body before-data low-data fresh": "1a3131887d2825b5",
  "chart before-data low-data fresh": "120f3aa684925877",
  "live body before-data low-data stale": "1a3131887d2825b5",
  "chart before-data low-data stale": "120f3aa684925877",
  "live body before-data low-data paused": "77495e5659f54760",
  "chart before-data low-data paused": "120f3aa684925877",
  "live body before-data enough-data fresh": "1a3131887d2825b5",
  "chart before-data enough-data fresh": "120f3aa684925877",
  "live body before-data enough-data stale": "1a3131887d2825b5",
  "chart before-data enough-data stale": "120f3aa684925877",
  "live body before-data enough-data paused": "77495e5659f54760",
  "chart before-data enough-data paused": "120f3aa684925877",
  "live body calibration low-data fresh": "04e0cf60839e95e2",
  "chart calibration low-data fresh": "cc95e56b4507eefe",
  "live body calibration low-data stale": "04e0cf60839e95e2",
  "chart calibration low-data stale": "cc95e56b4507eefe",
  "live body calibration low-data paused": "23b64a99ccf9dda3",
  "chart calibration low-data paused": "cc95e56b4507eefe",
  "live body calibration enough-data fresh": "82fcb12a1a6fe114",
  "chart calibration enough-data fresh": "d5fdea38ff7b2442",
  "live body calibration enough-data stale": "82fcb12a1a6fe114",
  "chart calibration enough-data stale": "d5fdea38ff7b2442",
  "live body calibration enough-data paused": "2acffd2afb017500",
  "chart calibration enough-data paused": "deccb2994a96903b",
  "live body aa-failed low-data fresh": "6432571f63736876",
  "chart aa-failed low-data fresh": "e3b0c44298fc1c14",
  "live body aa-failed low-data stale": "6432571f63736876",
  "chart aa-failed low-data stale": "e3b0c44298fc1c14",
  "live body aa-failed low-data paused": "f46b31b5959a03e4",
  "chart aa-failed low-data paused": "e3b0c44298fc1c14",
  "live body aa-failed enough-data fresh": "a1c6015c74f2b226",
  "chart aa-failed enough-data fresh": "e3b0c44298fc1c14",
  "live body aa-failed enough-data stale": "a1c6015c74f2b226",
  "chart aa-failed enough-data stale": "e3b0c44298fc1c14",
  "live body aa-failed enough-data paused": "16ecd0a2a70d02ab",
  "chart aa-failed enough-data paused": "e3b0c44298fc1c14",
  "live body ab low-data fresh": "e151484691d894df",
  "chart ab low-data fresh": "1640617d31722570",
  "live body ab low-data stale": "e151484691d894df",
  "chart ab low-data stale": "1640617d31722570",
  "live body ab low-data paused": "8270366957de7f5f",
  "chart ab low-data paused": "1640617d31722570",
  "live body ab enough-data fresh": "08ed52721e64ef46",
  "chart ab enough-data fresh": "7f099d98809f6d46",
  "live body ab enough-data stale": "08ed52721e64ef46",
  "chart ab enough-data stale": "7f099d98809f6d46",
  "live body ab enough-data paused": "3ad1f1f9df5b901e",
  "chart ab enough-data paused": "2833d96c1974941d",
  "live body inconclusive low-data fresh": "59760ea0a41952df",
  "chart inconclusive low-data fresh": "e3b0c44298fc1c14",
  "live body inconclusive low-data stale": "59760ea0a41952df",
  "chart inconclusive low-data stale": "e3b0c44298fc1c14",
  "live body inconclusive low-data paused": "50f701fa0ee4feda",
  "chart inconclusive low-data paused": "e3b0c44298fc1c14",
  "live body inconclusive enough-data fresh": "5f7c7beb6741f9f6",
  "chart inconclusive enough-data fresh": "09b4d8a9605df30b",
  "live body inconclusive enough-data stale": "5f7c7beb6741f9f6",
  "chart inconclusive enough-data stale": "09b4d8a9605df30b",
  "live body inconclusive enough-data paused": "547f420741222b7f",
  "chart inconclusive enough-data paused": "4dcc8b4edd56e5ca",
  "live body ship-b low-data fresh": "b5f018676a193e66",
  "chart ship-b low-data fresh": "e3b0c44298fc1c14",
  "live body ship-b low-data stale": "b5f018676a193e66",
  "chart ship-b low-data stale": "e3b0c44298fc1c14",
  "live body ship-b low-data paused": "753c626f00b8a8be",
  "chart ship-b low-data paused": "e3b0c44298fc1c14",
  "live body ship-b enough-data fresh": "114d1d3cb8e79c0f",
  "chart ship-b enough-data fresh": "fca9bc6390969aa5",
  "live body ship-b enough-data stale": "114d1d3cb8e79c0f",
  "chart ship-b enough-data stale": "fca9bc6390969aa5",
  "live body ship-b enough-data paused": "a04821d89ecac611",
  "chart ship-b enough-data paused": "fa087a0c7bd6f1b7",
  "live body stop-for-harm low-data fresh": "fbabcdcee354e4c9",
  "chart stop-for-harm low-data fresh": "e3b0c44298fc1c14",
  "live body stop-for-harm low-data stale": "fbabcdcee354e4c9",
  "chart stop-for-harm low-data stale": "e3b0c44298fc1c14",
  "live body stop-for-harm low-data paused": "41fcf08f6d473d84",
  "chart stop-for-harm low-data paused": "e3b0c44298fc1c14",
  "live body stop-for-harm enough-data fresh": "e8d2f0880ef4ce29",
  "chart stop-for-harm enough-data fresh": "efce68cf57c4e57e",
  "live body stop-for-harm enough-data stale": "e8d2f0880ef4ce29",
  "chart stop-for-harm enough-data stale": "efce68cf57c4e57e",
  "live body stop-for-harm enough-data paused": "dccb4b0eb9e95fa6",
  "chart stop-for-harm enough-data paused": "a60f651cf8c2f806",
  "live body srm-suppressed low-data fresh": "49fab8fcdae3736b",
  "chart srm-suppressed low-data fresh": "e3b0c44298fc1c14",
  "live body srm-suppressed low-data stale": "49fab8fcdae3736b",
  "chart srm-suppressed low-data stale": "e3b0c44298fc1c14",
  "live body srm-suppressed low-data paused": "347be7b783ba08c2",
  "chart srm-suppressed low-data paused": "e3b0c44298fc1c14",
  "live body srm-suppressed enough-data fresh": "48ac69e79e397292",
  "chart srm-suppressed enough-data fresh": "e3b0c44298fc1c14",
  "live body srm-suppressed enough-data stale": "48ac69e79e397292",
  "chart srm-suppressed enough-data stale": "e3b0c44298fc1c14",
  "live body srm-suppressed enough-data paused": "4b1d7c49fffc97ad",
  "chart srm-suppressed enough-data paused": "e3b0c44298fc1c14",
  "chart paused ab above zero": "bef63121ef3965f0",
  "body paused ab above zero": "93473b39670a186b",
};

describe('the kit default markup is unchanged', () => {
  it('records one hash per scenario', () => {
    if (process.env.KIT_HASH_PRINT) {
      console.log(`HASHES ${JSON.stringify(Object.fromEntries(Object.entries(scenarios).map(([k, f]) => [k, hash(f())])))}`);
    }
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(scenarios).sort());
  });
  for (const [name, render] of Object.entries(scenarios)) {
    it(name, () => {
      expect(hash(render())).toBe(EXPECTED[name]);
    });
  }
});
