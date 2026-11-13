// The Pulse local event bus: a synchronous, memory-only bus for the local dashboard demo. It accepts
// only the events of the taxonomy it is given, each with exactly that event's properties as strings,
// delivers each event once to each subscriber, and keeps no events of its own: the stream a visitor
// sees is the caller's state, emptied through clear(). It makes no network call, touches no storage,
// imports no analytics SDK and has no identify call.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as busModule from '@/lib/pulse/bus';
import { DEMO_PROMPT_VERSION, createPulseBus, type PulseEvent } from '@/lib/pulse/bus';
import { PULSE_TAXONOMY_REFS, pulseTaxonomy, type PulseEventName } from '@/lib/pulse/taxonomy';

const ROOT = resolve(import.meta.dirname, '../../..');
const BUS_FILE = join(ROOT, 'src/lib/pulse/bus.ts');
const TAXONOMY = pulseTaxonomy();

/** One valid event per taxonomy entry, with local demo values for every property. */
const FIXTURES: Record<PulseEventName, PulseEvent> = {
  'Viewed Dashboard': { name: 'Viewed Dashboard', properties: { prompt_version: DEMO_PROMPT_VERSION.value } },
  'Applied Filter': { name: 'Applied Filter', properties: { filter_type: 'channel', value: 'email' } },
  'Changed Date Range': { name: 'Changed Date Range', properties: { range: '30d' } },
  'Viewed Chart Detail': { name: 'Viewed Chart Detail', properties: { chart: 'sessions' } },
  'Exported Report': { name: 'Exported Report', properties: { format: 'csv' } },
  'Saved View': { name: 'Saved View', properties: { view_name: 'Email, last 30 days' } },
  'Loaded Saved View': { name: 'Loaded Saved View', properties: { view_name: 'Email, last 30 days' } },
};

function collect(bus: ReturnType<typeof createPulseBus>) {
  const seen: PulseEvent[] = [];
  const off = bus.subscribe((e) => seen.push(e));
  return { seen, off };
}

describe('the fixtures', () => {
  it('cover all seven taxonomy events with exactly their export properties', () => {
    expect(Object.keys(FIXTURES)).toEqual(TAXONOMY.map((r) => r.name));
    for (const row of TAXONOMY) expect(Object.keys(FIXTURES[row.name].properties).sort()).toEqual([...row.properties].sort());
  });
});

describe('createPulseBus', () => {
  it('delivers an Applied Filter with filter_type and value to a subscriber exactly once, unchanged', () => {
    const bus = createPulseBus(TAXONOMY);
    const fn = vi.fn();
    bus.subscribe(fn);
    bus.emit({ name: 'Applied Filter', properties: { filter_type: 'channel', value: 'email' } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({ name: 'Applied Filter', properties: { filter_type: 'channel', value: 'email' } });
  });

  it('delivers synchronously, before emit returns', () => {
    const bus = createPulseBus(TAXONOMY);
    const { seen } = collect(bus);
    bus.emit(FIXTURES['Exported Report']);
    expect(seen).toHaveLength(1);
  });

  it('accepts every one of the seven fixtures and delivers them in emit order', () => {
    const bus = createPulseBus(TAXONOMY);
    const { seen } = collect(bus);
    for (const row of TAXONOMY) bus.emit(FIXTURES[row.name]);
    expect(seen.map((e) => e.name)).toEqual(TAXONOMY.map((r) => r.name));
    expect(seen).toEqual(TAXONOMY.map((r) => FIXTURES[r.name]));
  });

  it('delivers to every subscriber, and a function subscribed twice still gets each event once', () => {
    const bus = createPulseBus(TAXONOMY);
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(a);
    bus.subscribe(b);
    bus.emit(FIXTURES['Saved View']);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops delivery after unsubscribe, and unsubscribing twice is harmless', () => {
    const bus = createPulseBus(TAXONOMY);
    const fn = vi.fn();
    const off = bus.subscribe(fn);
    bus.emit(FIXTURES['Changed Date Range']);
    off();
    off();
    bus.emit(FIXTURES['Changed Date Range']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('lets a subscriber unsubscribe while an event is delivered without skipping another subscriber', () => {
    const bus = createPulseBus(TAXONOMY);
    const second = vi.fn();
    const off: () => void = bus.subscribe(() => off());
    bus.subscribe(second);
    bus.emit(FIXTURES['Viewed Chart Detail']);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('keeps no events: a late subscriber gets nothing earlier, and the bus has no stream to read', () => {
    const bus = createPulseBus(TAXONOMY);
    bus.emit(FIXTURES['Viewed Dashboard']);
    bus.emit(FIXTURES['Applied Filter']);
    const late = vi.fn();
    bus.subscribe(late);
    expect(late).not.toHaveBeenCalled();
    expect(Object.keys(bus).sort()).toEqual(['clear', 'emit', 'subscribe']);
  });

  it('clear() empties the stream the caller keeps, and delivery goes on afterwards', () => {
    const bus = createPulseBus(TAXONOMY);
    // The caller's state: the stream it shows, filled by its subscriber and emptied on clear.
    let stream: PulseEvent[] = [];
    const off = bus.subscribe(
      (e) => {
        stream = [...stream, e];
      },
      () => {
        stream = [];
      },
    );
    bus.emit(FIXTURES['Viewed Dashboard']);
    bus.emit(FIXTURES['Applied Filter']);
    expect(stream).toHaveLength(2);
    bus.clear();
    expect(stream).toEqual([]);
    bus.emit(FIXTURES['Viewed Dashboard']);
    expect(stream).toEqual([FIXTURES['Viewed Dashboard']]);
    // After unsubscribing, clear no longer reaches that caller.
    off();
    bus.clear();
    expect(stream).toEqual([FIXTURES['Viewed Dashboard']]);
  });

  it('clear() with a subscriber that keeps no stream is harmless and keeps it subscribed', () => {
    const bus = createPulseBus(TAXONOMY);
    const fn = vi.fn();
    bus.subscribe(fn);
    bus.clear();
    bus.emit(FIXTURES['Exported Report']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('hands subscribers a frozen copy, so one subscriber cannot change what the next sees or the emitter holds', () => {
    const bus = createPulseBus(TAXONOMY);
    const sent = { name: 'Applied Filter' as const, properties: { filter_type: 'channel', value: 'email' } };
    const { seen } = collect(bus);
    bus.emit(sent);
    const got = seen[0]!;
    expect(Object.isFrozen(got)).toBe(true);
    expect(Object.isFrozen(got.properties)).toBe(true);
    expect(got.properties).not.toBe(sent.properties);
    sent.properties.value = 'paid';
    expect(got.properties.value).toBe('email');
  });

  describe('rejects an event outside the taxonomy, delivering nothing', () => {
    const cases: [label: string, event: unknown][] = [
      ['an unknown name', { name: 'Clicked Button', properties: {} }],
      ['a name in another case', { name: 'applied filter', properties: { filter_type: 'channel', value: 'email' } }],
      ['a missing property', { name: 'Applied Filter', properties: { filter_type: 'channel' } }],
      ['an extra property', { name: 'Applied Filter', properties: { filter_type: 'channel', value: 'email', user_id: 'u1' } }],
      ['an extra property on Viewed Dashboard', { name: 'Viewed Dashboard', properties: { prompt_version: DEMO_PROMPT_VERSION.value, role: 'analyst' } }],
      ['a property that is not a string', { name: 'Changed Date Range', properties: { range: 30 } }],
      ['no properties object', { name: 'Exported Report' }],
      ['properties that are an array', { name: 'Exported Report', properties: ['csv'] }],
      ['an inherited property', { name: 'Exported Report', properties: Object.create({ format: 'csv' }) as object }],
      ['not an object', 'Viewed Dashboard'],
    ];
    for (const [label, event] of cases) {
      it(label, () => {
        const bus = createPulseBus(TAXONOMY);
        const fn = vi.fn();
        bus.subscribe(fn);
        expect(() => bus.emit(event as PulseEvent)).toThrow(TypeError);
        expect(fn).not.toHaveBeenCalled();
      });
    }
  });

  it('allows only the taxonomy it is given: an event outside a smaller taxonomy is rejected', () => {
    const bus = createPulseBus(TAXONOMY.filter((r) => r.name === 'Viewed Dashboard'));
    expect(() => bus.emit(FIXTURES['Viewed Dashboard'])).not.toThrow();
    expect(() => bus.emit(FIXTURES['Applied Filter'])).toThrow(TypeError);
  });

  it('refuses a taxonomy that is empty, repeats a name, or repeats a property', () => {
    expect(() => createPulseBus([])).toThrow(TypeError);
    expect(() => createPulseBus([TAXONOMY[0]!, TAXONOMY[0]!])).toThrow(TypeError);
    expect(() => createPulseBus([{ ...TAXONOMY[1]!, properties: ['value', 'value'] }])).toThrow(TypeError);
  });

  it('is unaffected when the caller changes the taxonomy array after creating the bus', () => {
    const rows = TAXONOMY.filter((r) => r.name === 'Viewed Dashboard');
    const bus = createPulseBus(rows);
    rows.push(TAXONOMY[1]!);
    expect(() => bus.emit(FIXTURES['Applied Filter'])).toThrow(TypeError);
  });

  it('keeps two buses apart', () => {
    const one = createPulseBus(TAXONOMY);
    const two = createPulseBus(TAXONOMY);
    const fn = vi.fn();
    two.subscribe(fn);
    one.emit(FIXTURES['Viewed Dashboard']);
    one.clear();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('the local demo prompt version', () => {
  const viewed = TAXONOMY.find((r) => r.name === 'Viewed Dashboard')!;

  it('is the value "demo-v1", marked simulated', () => {
    expect(DEMO_PROMPT_VERSION).toEqual({ value: 'demo-v1', refs: ['simulated'] });
  });

  it('fills the prompt_version key, which comes from the export and carries the source ref', () => {
    expect(viewed.properties).toEqual(['prompt_version']);
    expect(PULSE_TAXONOMY_REFS).toEqual(['source:pulse']);
  });

  it('is not a value from the export: the source file never contains it', () => {
    expect(readFileSync(join(ROOT, 'data/sources/pulse.json'), 'utf8')).not.toContain(DEMO_PROMPT_VERSION.value);
  });

  it('is the only export besides the bus factory', () => {
    expect(Object.keys(busModule).sort()).toEqual(['DEMO_PROMPT_VERSION', 'createPulseBus']);
  });
});

describe('no network, storage or SDK', () => {
  const touched: string[] = [];
  const trap = (name: string) =>
    new Proxy(() => undefined, {
      get: (_t, key) => {
        touched.push(`${name}.${String(key)}`);
        return () => undefined;
      },
      apply: () => {
        touched.push(name);
        return undefined;
      },
    });

  beforeEach(() => {
    touched.length = 0;
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'navigator', 'document', 'BroadcastChannel']) {
      vi.stubGlobal(name, trap(name));
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs a whole session without reaching any network, storage or document global', () => {
    const bus = createPulseBus(TAXONOMY);
    const off = bus.subscribe(() => undefined, () => undefined);
    for (const row of TAXONOMY) bus.emit(FIXTURES[row.name]);
    bus.clear();
    off();
    expect(touched).toEqual([]);
  });

  it('imports nothing at run time: only the types of the taxonomy and the derived refs', () => {
    const sf = ts.createSourceFile(BUS_FILE, readFileSync(BUS_FILE, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const imports: { from: string; typeOnly: boolean }[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isImportDeclaration(n)) imports.push({ from: (n.moduleSpecifier as ts.StringLiteral).text, typeOnly: n.importClause?.isTypeOnly === true });
      if (ts.isExportDeclaration(n) && n.moduleSpecifier) imports.push({ from: (n.moduleSpecifier as ts.StringLiteral).text, typeOnly: n.isTypeOnly });
      if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
        imports.push({ from: '<dynamic>', typeOnly: false });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(imports.sort((a, b) => a.from.localeCompare(b.from))).toEqual([
      { from: '@/components/kit/Derived', typeOnly: true },
      { from: '@/lib/pulse/taxonomy', typeOnly: true },
    ]);
  });

  it('names no network, storage, identity or analytics API anywhere in its code', () => {
    const sf = ts.createSourceFile(BUS_FILE, readFileSync(BUS_FILE, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const names = new Set<string>();
    const visit = (n: ts.Node): void => {
      if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) names.add(n.text);
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) names.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    const API = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'cookie', 'document', 'window', 'globalThis', 'BroadcastChannel', 'identify', 'track', 'amplitude', 'init', 'setUserId', 'deviceId', 'userId'];
    for (const api of API) expect([...names], api).not.toContain(api);
  });
});
