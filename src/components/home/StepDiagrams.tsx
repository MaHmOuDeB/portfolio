// The four diagrams of the Home scroll moment, each a diagram Figure (no badge, controls or table):
// - the hypothesis in the calibration: both groups see the same headlines;
// - the hypothesis in the A/B: group A's headlines name the topic, group B's state a finding;
// - the split: two equal, unnumbered group outlines;
// - the decision: the three outcomes of the pre-registered rule.
// They show no observed data and no number. The hypothesis diagrams describe the headlines without
// quoting them, so a reader in one group is never shown the other group's headline. Each takes an
// optional `id`, so a page can draw it twice. Server-safe.
import { Figure } from '@/components/kit/Figure';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';

const OUTLINE = 'min-w-0 rounded-sm border border-muted p-4';
const GROUPS = [
  { arm: 'a', name: 'Group A' },
  { arm: 'b', name: 'Group B' },
] as const;

/** Three small cards: the glyph each case-study card opens with, and a rule for its headline. */
function CardSketch() {
  return (
    <span aria-hidden="true" className="mt-3 grid gap-3">
      {['w-full', 'w-3/4', 'w-5/6'].map((width) => (
        <span key={width} className="grid gap-1">
          <span className="block leading-none">
            <IntervalGlyph length={28} />
          </span>
          <span className={`block h-2 rounded-sm bg-line ${width}`} />
        </span>
      ))}
    </span>
  );
}

const HYPOTHESIS = {
  'identical-headlines': {
    title: 'Both groups see the same headlines while the test calibrates',
    caption: 'During the calibration every visitor sees group A’s headlines, so the two groups can be compared before anything differs.',
    lines: ['Headlines that name the topic', 'Headlines that name the topic'],
  },
  'topic-finding': {
    title: 'Group A’s headlines name the topic; group B’s state a finding',
    caption: 'Only the headlines differ. The descriptions, links and layout of the cards are the same in both groups.',
    lines: ['Headlines that name the topic', 'Headlines that state a finding'],
  },
} as const;

/** The headlines each group sees: identical in the calibration, topic versus finding in the A/B. */
export function HypothesisDiagram({ kind, id = 'home-hypothesis' }: { kind: 'identical-headlines' | 'topic-finding'; id?: string }) {
  const d = HYPOTHESIS[kind];
  return (
    <Figure kind="diagram" id={id} titleLevel={4} title={d.title} caption={d.caption}>
      <div data-diagram={kind} className="grid grid-cols-2 gap-4">
        {GROUPS.map((g, i) => (
          <div key={g.arm} data-group-outline={g.arm} className={OUTLINE}>
            <p className="text-sm font-semibold">{g.name}</p>
            <p data-outline-headlines="" className="mt-1 text-sm text-muted">
              {d.lines[i]}
            </p>
            <CardSketch />
          </div>
        ))}
      </div>
    </Figure>
  );
}

/** Two groups of the same design, with no count: the split before any data is shown. */
export function GroupOutlinesDiagram({ id = 'home-split' }: { id?: string }) {
  return (
    <Figure
      kind="diagram"
      id={id}
      titleLevel={4}
      title="Every counted visit joins one of two groups at random"
      caption="The server picks the group before the page is sent. The split check compares the two groups with the even split the design expects."
    >
      <div data-diagram="group-outlines" className="grid gap-3">
        <p className="justify-self-center rounded-sm border border-line px-3 py-1 text-sm text-muted">A visit to the home page</p>
        <div aria-hidden="true" className="mx-auto h-3 w-1/2 border-x border-t border-line" />
        <div className="grid grid-cols-2 gap-4">
          {GROUPS.map((g) => (
            <div key={g.arm} data-group-outline={g.arm} className={`${OUTLINE} text-center`}>
              <p className="text-sm font-semibold">{g.name}</p>
            </div>
          ))}
        </div>
      </div>
    </Figure>
  );
}

const ZONES = [
  { id: 'stop-for-harm', name: 'Stop for harm', rule: 'The interval lies below zero.', from: 0.08, to: 0.4 },
  { id: 'inconclusive', name: 'Inconclusive', rule: 'Neither of the others holds by the six-month limit.', from: 0.3, to: 0.7 },
  {
    id: 'ship-b',
    name: 'Ship B',
    rule: 'The interval lies above zero, the quick-exit guardrail passes and the split check passes.',
    from: 0.6,
    to: 0.92,
  },
] as const;

const ROW = 24;
const MID = 12;

/** An interval for B − A against the zero line: the signature mark drawn across a flat axis. */
function ZoneSketch({ from, to }: { from: number; to: number }) {
  const pc = (v: number) => `${v * 100}%`;
  return (
    <svg aria-hidden="true" focusable="false" width="100%" height={ROW} className="mt-2 block overflow-visible">
      <line x1={0} x2="100%" y1={MID + 0.5} y2={MID + 0.5} className="stroke-line" />
      <rect x={pc(from)} y={MID - 1} width={pc(to - from)} height={2} fill="var(--color-series-1)" />
      {[from, to].map((at) => (
        <line key={at} x1={pc(at)} x2={pc(at)} y1={MID - 4} y2={MID + 4} stroke="var(--color-series-1)" strokeWidth={1.5} />
      ))}
      <circle cx={pc((from + to) / 2)} cy={MID} r={4} fill="var(--color-series-2)" stroke="var(--color-bg)" strokeWidth={4} paintOrder="stroke" />
      <line x1="50%" x2="50%" y1={0} y2={ROW} className="stroke-ink" />
    </svg>
  );
}

/** The three outcomes of the pre-registered decision rule. */
export function DecisionZonesDiagram({ id = 'home-decision' }: { id?: string }) {
  return (
    <Figure
      kind="diagram"
      id={id}
      titleLevel={4}
      title="Three outcomes, written down before the data"
      caption="Each bar is an interval for B minus A, and the dark vertical line is zero. The rule is part of the pre-registration."
    >
      <div data-diagram="decision-zones" className="grid gap-4 sm:grid-cols-3">
        {ZONES.map((z) => (
          <div key={z.id} data-decision-zone={z.id} className={OUTLINE}>
            <p className="text-sm font-semibold">{z.name}</p>
            <ZoneSketch from={z.from} to={z.to} />
            <p className="mt-2 text-sm text-muted">{z.rule}</p>
          </div>
        ))}
      </div>
    </Figure>
  );
}
