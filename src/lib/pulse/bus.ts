// The local event bus of the Pulse dashboard demo: synchronous and memory-only. It accepts only the
// events of the taxonomy it is given (each with exactly that event's properties, as strings) and
// delivers each one once to each subscriber. It keeps no events: the stream a visitor sees is the
// caller's own state, which clear() asks every subscriber to empty. No network, no storage, no
// visitor identity. Client-safe: it imports types only, and receives the taxonomy rows as an argument.
import type { DerivedRef } from '@/components/kit/Derived';
import type { PulseEventName, PulseTaxonomyRow } from '@/lib/pulse/taxonomy';

export type PulseEvent = { name: PulseEventName; properties: Readonly<Record<string, string>> };

export type PulseBus = {
  emit(event: PulseEvent): void;
  /** Adds a subscriber; onClear runs on clear(). Returns the function that removes both. */
  subscribe(fn: (event: PulseEvent) => void, onClear?: () => void): () => void;
  /** Asks every subscriber to empty the stream it keeps. The bus itself holds none. */
  clear(): void;
};

/**
 * The Viewed Dashboard prompt_version value this local demo sends. The key comes from the export;
 * this value is the demo's own, so its refs say simulated.
 */
export const DEMO_PROMPT_VERSION = { value: 'demo-v1', refs: ['simulated'] } as const satisfies {
  value: string;
  refs: readonly DerivedRef[];
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function createPulseBus(taxonomy: readonly PulseTaxonomyRow[]): PulseBus {
  if (taxonomy.length === 0) throw new TypeError('pulse bus: the taxonomy is empty');
  // The allow-list is copied, so a later change to the caller's array does not reach it.
  const allowed = new Map<string, readonly string[]>();
  for (const row of taxonomy) {
    if (allowed.has(row.name)) throw new TypeError(`pulse bus: the event '${row.name}' appears twice`);
    if (new Set(row.properties).size !== row.properties.length) throw new TypeError(`pulse bus: '${row.name}' repeats a property`);
    allowed.set(row.name, [...row.properties].sort());
  }

  const subscribers = new Set<(event: PulseEvent) => void>();
  const clearers = new Map<(event: PulseEvent) => void, () => void>();

  function check(event: unknown): PulseEvent {
    if (!isRecord(event) || typeof event.name !== 'string') throw new TypeError('pulse bus: an event needs a name');
    const expected = allowed.get(event.name);
    if (expected === undefined) throw new TypeError(`pulse bus: '${event.name}' is not in the taxonomy`);
    const props = event.properties;
    if (!isRecord(props)) throw new TypeError(`pulse bus: '${event.name}' needs a properties object`);
    const keys = Object.keys(props).sort();
    if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
      throw new TypeError(`pulse bus: '${event.name}' takes exactly ${expected.join(', ')}; got ${keys.join(', ') || 'none'}`);
    }
    const copy: Record<string, string> = {};
    for (const k of keys) {
      const v = props[k];
      if (typeof v !== 'string') throw new TypeError(`pulse bus: '${event.name}'.${k} is not a string`);
      copy[k] = v;
    }
    return Object.freeze({ name: event.name as PulseEventName, properties: Object.freeze(copy) });
  }

  return {
    emit(event) {
      const delivered = check(event);
      // A snapshot, so a subscriber that unsubscribes during delivery does not skip the next one.
      for (const fn of [...subscribers]) fn(delivered);
    },
    subscribe(fn, onClear) {
      subscribers.add(fn);
      if (onClear) clearers.set(fn, onClear);
      return () => {
        subscribers.delete(fn);
        clearers.delete(fn);
      };
    },
    clear() {
      for (const onClear of [...clearers.values()]) onClear();
    },
  };
}
