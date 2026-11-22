// The kit's German text: the same keys and placeholders as English, no English kit string in a German
// render, and the German forms of the pieces that format (dates, numbers, the step position).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { KIT_TEXT_DE } from '../../../content/de/kit';
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
import { KIT_TEXT_EN, type KitText } from '@/components/kit/text';
import { TextArea } from '@/components/kit/TextArea';
import { FACTS, type FactId } from '@/lib/facts';
import { liveFigureState } from '@/lib/figure/cs-band';
import { DATA_AMOUNTS, LIVE_PHASES, resolveFigureBody } from '@/lib/figure/states';

const REFS = ['simulated'] as const;
const noop = () => {};
const T = KIT_TEXT_DE;
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'");

// Every string of a KitText by its path. A function is called with placeholder children, so its
// sentence shows as text with the placeholders in it.
const holes = new Proxy({}, { get: (_t, key) => `⟦${String(key)}⟧` }) as never;
function leaves(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (typeof value === 'function') {
    return [[path, textOf(html(<span>{(value as (p: never) => React.ReactNode)(holes)}</span>))]];
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [];
}
const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z]+)\}|⟦([A-Za-z]+)⟧/g)].map((m) => m[1] ?? m[2]).sort();

const EN = new Map(leaves(KIT_TEXT_EN));
const DE = new Map(leaves(T));

describe('KIT_TEXT_DE', () => {
  it('has exactly the keys of KIT_TEXT_EN', () => {
    expect([...DE.keys()].sort()).toEqual([...EN.keys()].sort());
    expect(DE.size).toBeGreaterThan(80);
  });

  it('keeps every placeholder of every template and every value a sentence function takes', () => {
    for (const [path, en] of EN) expect(placeholders(DE.get(path)!), path).toEqual(placeholders(en));
  });

  it('translates every string (none is the English one)', () => {
    for (const [path, en] of EN) {
      if (en.trim() === '' || /^[^A-Za-z]*$/.test(en)) continue;
      expect(DE.get(path), path).not.toBe(en);
    }
  });

  it('uses the status words and the minus of the glossary', () => {
    expect(T.live.srmPassed).toBe('SRM bestanden');
    expect(T.confidence.yLabel).toBe('B − A (Prozentpunkte)');
    expect(T.reset).toBe('Zurücksetzen');
  });

  it('uses no em or en dash, arrow, middle dot or du-form', () => {
    for (const [path, de] of DE) {
      expect(de, path).not.toMatch(/[–—→·]/);
      expect(de, path).not.toMatch(/\b(dein|du|dich)\b/i);
    }
  });
});

// The English phrases of the kit, cut at the placeholders: none may show in a German render.
const ENGLISH = [...EN.values()]
  .flatMap((s) => s.split(/\{[A-Za-z]+\}|⟦[A-Za-z]+⟧/))
  .map((s) => s.replace(/^[.:,;\s]+|[\s]+$/g, ''))
  .filter((s) => s.length >= 7);
const noEnglish = (markup: string) => {
  const text = textOf(markup).replace(/\s+/g, ' ');
  for (const phrase of ENGLISH) {
    if (phrase.startsWith('B ')) continue;
    expect(text, `English kit text in a German render: "${phrase}"`).not.toContain(phrase);
  }
};

const TABLE: TableData = { columns: ['Anstieg', 'Besucher'], rows: [[1.5, 30_000]], refs: REFS, formats: ['points', 'count'] };
const CHART = <svg role="img" aria-label="Ein Diagramm" />;

describe('the English-phrase check', () => {
  it('has phrases to look for and notices an English render', () => {
    expect(ENGLISH.length).toBeGreaterThan(40);
    const s = liveFixture('ab', 'enough-data', 'fresh');
    expect(() => noEnglish(html(<LiveStateBody id="x" snapshot={s} body="ab" refs={REFS} />))).toThrow(/English kit text/);
  });
});

describe('a German render', () => {
  it('shows no English kit string in a Figure in each runtime', () => {
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      const markup = html(
        <Figure id="demo" title="Ein Befund." caption="Unterschrift." provenance="simulated" table={TABLE} text={T} controls={<button type="button">x</button>} state={{ runtime }}>
          {CHART}
        </Figure>,
      );
      noEnglish(markup);
      if (runtime === 'default') {
        expect(markup).toContain('Zahlen als Tabelle anzeigen');
        expect(markup).toContain('aria-label="Bedienelemente"');
        expect(markup).toContain('Simuliert');
        expect(markup).toContain('Die Bedienelemente brauchen JavaScript.');
      }
      if (runtime === 'error') expect(markup).toContain('Dieses Diagramm konnte nicht geladen werden.');
    }
    noEnglish(html(<Figure id="demo" kind="diagram" title="Schritte" caption="Unterschrift." text={T} state={{ runtime: 'error' }}>{CHART}</Figure>));
    expect(html(<FigureErrorFallback id="x" body="live" preview={CHART} table={TABLE} text={T.error} locale="de" />)).toContain('beide Gruppen');
  });

  it('writes the table numbers with the German separators', () => {
    const markup = html(<DataTable id="d" caption="c" table={TABLE} mode="open" text={T} />);
    expect(markup).toContain('>1,5<');
    expect(markup).toContain('>30.000<');
    expect(html(<DataTable id="d" caption="c" table={TABLE} mode="open" />)).toContain('>30,000<');
  });

  it('shows no English kit string in any live state, chart or Now row', () => {
    for (const phase of LIVE_PHASES) {
      for (const data of DATA_AMOUNTS) {
        for (const fresh of FRESHNESS_KINDS) {
          const s = liveFixture(phase, data, fresh);
          const body = resolveFigureBody(liveFigureState(s));
          noEnglish(html(<LiveStateBody id="x" snapshot={s} body={body} refs={REFS} text={T} />));
          noEnglish(html(<ConfidenceChart id="x" snapshot={s} body={body} refs={REFS} text={T} />));
        }
      }
    }
    const paused = pausedAbAboveZeroFixture();
    noEnglish(html(<LiveStateBody id="x" snapshot={paused} body="paused" refs={REFS} text={T} />));
    noEnglish(html(<ConfidenceChart id="x" snapshot={paused} body="paused" refs={REFS} text={T} />));
    const due = { nSmaller: 80, plannedEnd: '2027-05-01T00:00:00Z', plannedEndKind: 'fixed', due: true } as const;
    noEnglish(html(<NowRow domain={[-1, 1]} collecting={due} refs={REFS} text={T} />));
    noEnglish(html(<NowRow domain={[-1, 1]} collecting={{ ...due, nSmaller: 12 }} refs={REFS} text={T} />));
  });

  it('draws the chart in German: the axis words, the zero-line words, the finding and the decimal comma', () => {
    const s = liveFixture('ab', 'enough-data', 'fresh');
    const markup = html(<ConfidenceChart id="x" snapshot={s} body={resolveFigureBody(liveFigureState(s))} refs={REFS} text={T} />);
    for (const word of ['Aufrufe je Gruppe', 'B − A (Prozentpunkte)', 'kein Unterschied', 'B höher', 'B niedriger', 'Der Unterschied zwischen den Gruppen']) {
      expect(markup).toContain(word);
    }
    expect(markup).not.toMatch(/aria-label="[^"]*\d/);
    expect(markup).toMatch(/(?:jetzt|endgültig): [^<]*<span[^>]*>[^<]*bis[^<]*</);
    const live = html(<LiveStateBody id="x" snapshot={s} body="ab" refs={REFS} text={T} />);
    expect(live).toContain('SRM bestanden');
    expect(live).toMatch(/A\/B-Test gestartet am <time[^>]*>\d\d\.\d\d\.<\/time>/);
  });

  it('closes a date with its dot and does not double it at the end of the progress line', () => {
    const markup = html(<ProgressLine nSmaller={12} target={50} plannedEnd="2027-05-01T00:00:00Z" plannedEndKind="earliest" refs={REFS} text={T} />);
    expect(textOf(markup).replace(/\s+/g, ' ')).toContain('Fortschritt: 12 von 50 in der kleineren Gruppe . Frühestes Ende: 01.05. ');
    expect(markup).not.toContain('01.05.</time>.');
    expect(html(<UpdatedLabel updatedAt="2026-10-24T22:30:00Z" renderedAt="2026-10-26T14:00:00Z" refs={REFS} text={T} />)).toContain('Aktualisiert 25.10., 00:30');
  });

  it('names no group in the no-group phase note and never prints the English sentence', () => {
    const note = (arm?: 'a' | 'b') => html(<PhaseLabel note={{ mode: 'ab', arm, nA: 300, nB: 400 }} href="/de/experiment" refs={REFS} text={T} />);
    for (const markup of [note(), note('a')]) noEnglish(markup);
    const plain = textOf(note()).replace(/\s+/g, ' ');
    expect(plain).toContain('Diese Website führt einen A/B-Test mit ihren Besuchern durch.');
    expect(plain).not.toMatch(/Gruppe [AB]/);
    expect(plain).toContain('Bisher gab es 700 Aufrufe.');
    expect(note()).toContain('Live-Ergebnisse ansehen');
    for (const mode of ['paused', 'calibration'] as const) {
      noEnglish(html(<PhaseLabel note={{ mode }} href="/de/experiment" refs={REFS} text={T} />));
    }
  });

  it('keeps the English no-group sentence when no arm is given in English', () => {
    const plain = textOf(html(<PhaseLabel note={{ mode: 'ab', nA: 3, nB: 4 }} href="/experiment" refs={REFS} />));
    expect(plain.replace(/\s+/g, ' ')).toContain('This site runs an A/B test on its visitors.');
    expect(plain).not.toMatch(/group [AB]/);
  });

  it('prints the controls in German', () => {
    expect(html(<ResetButton onReset={noop} label={T.reset} />)).toContain('>Zurücksetzen<');
    expect(html(<StepNav current={3} total={5} onChange={noop} label="Schritte" refs={REFS} text={T.step} />)).toMatch(/Zurück<[\s\S]*3 von 5[\s\S]*Weiter</);
    expect(html(<Slider id="s" label="Blicke" min={1} max={50} step={1} value={20} onChange={noop} valueText={String} refs={REFS} text={T.slider} />)).toContain('Blicke, genauer Wert');
    expect(html(<SelectField id="a" name="a" label="Grund" options={[]} text={T} />)).toContain('>Bitte wählen<');
    expect(html(<Field id="f" label="Name" error="Zu kurz" text={T}>{() => <input id="f" />}</Field>)).toContain('Fehler: ');
    expect(html(<ProvenanceBadge kind="live" text={T.badge} />)).toContain('Live von dieser Website');
    const count = html(<CharacterCount id="c" controlId="t" limit={2000} refs={REFS} text={T.count} />);
    expect(count).toMatch(/Bis zu <data[^>]*>2\.000<\/data> Zeichen/);
    expect(html(<TextArea id="t" name="t" label="Nachricht" limit={2000} refs={REFS} text={T} />)).toContain('Bis zu ');
  });

  it('prints a fact in German through the locale prop', () => {
    const id = Object.keys(FACTS)[0] as FactId;
    const en = html(<Fact id={id} />);
    expect(html(<Fact id={id} locale="en" />)).toBe(en);
    expect(html(<Fact id={id} locale="de" />)).toContain(`data-fact="${id}"`);
  });

  it('has a typed value for every slice a client component takes', () => {
    const slices: Array<keyof KitText> = ['reset', 'step', 'slider', 'count', 'error'];
    for (const k of slices) expect(T[k]).toBeDefined();
  });
});
