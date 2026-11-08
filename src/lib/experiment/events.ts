// The beacon's wire format: one request carries one view's events in the order they happened.
// Pure and dependency-light: the browser beacon, the event route and the tests all import it.
import { ARMS, type Arm } from '../../experiment.values.ts';

export const EVENT_TYPES = ['entry', 'inview', 'engaged', 'card', 'secondary', 'cv', 'contact'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The rejects the browser decides, in attribution order: the first that applies names the view. */
export const CLIENT_REJECTS = ['bot', 'forced', 'not_entry'] as const;
export type ClientReject = (typeof CLIENT_REJECTS)[number];

/** Every reason an entry view is excluded; each is counted under its own name. */
export const REJECT_REASONS = ['bot', 'internal', 'self', 'forced', 'not_entry', 'rate_limited', 'ceiling'] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export type BeaconItem = { type: EventType; reject?: ClientReject };
/** One request: one view, events in the order they happened. */
export type BeaconBatch = { v: 1; ns: string; pv: string; arm: Arm; events: BeaconItem[] };

export const MAX_BODY_BYTES = 1024;
export const MAX_EVENTS = 7;

/** The events that must already be counted for a view before this one can count. */
export const PREREQUISITES: Readonly<Record<EventType, readonly EventType[]>> = {
  entry: [],
  inview: ['entry'],
  engaged: ['entry'],
  card: ['entry', 'inview'],
  secondary: ['entry', 'inview'],
  cv: ['entry'],
  contact: ['entry'],
};

export type ItemOutcome = 'counted' | 'duplicate' | 'orphan';
export type Refusal =
  | RejectReason
  | 'paused'
  | 'not-production'
  | 'not-started'
  | 'ended'
  | 'stale-namespace'
  | 'unavailable'
  | 'misconfigured';
export type BeaconResponse =
  | { ok: true; arm: Arm; viewN?: number; results: { type: EventType; outcome: ItemOutcome }[] }
  | { ok: false; reason: Refusal };

const NAMESPACE = /^[a-z0-9.-]{1,32}$/;
/** 'rl' would share the `exp:rl:` prefix of the rate-limit keys. */
const RESERVED_NAMESPACES = ['rl'];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BATCH_KEYS = ['arm', 'events', 'ns', 'pv', 'v'];

const encoder = new TextEncoder();

/** 1 to 32 of a-z, 0-9, dot and hyphen, and not a reserved key prefix. */
export function isNamespace(ns: string): boolean {
  return NAMESPACE.test(ns) && !RESERVED_NAMESPACES.includes(ns);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.every((k) => allowed.includes(k)) && required.every((k) => own.includes(k));
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function parseItem(value: unknown): BeaconItem | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'reject'], ['type'])) return null;
  if (!includes(EVENT_TYPES, value.type)) return null;
  if (!('reject' in value)) return { type: value.type };
  if (value.type !== 'entry' || !includes(CLIENT_REJECTS, value.reject)) return null;
  return { type: value.type, reject: value.reject };
}

/**
 * Reads a request body as a batch, or gives null. The byte length is checked before parsing. A
 * reject rides only on an entry that is the only item; no type repeats; an entry, when present,
 * is first. The result is a fresh object that holds only the known fields.
 */
export function parseBeaconBatch(body: string): BeaconBatch | null {
  if (encoder.encode(body).length > MAX_BODY_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(value) || !hasOnlyKeys(value, BATCH_KEYS, BATCH_KEYS)) return null;
  const { v, ns, pv, arm, events } = value;
  if (v !== 1) return null;
  if (typeof ns !== 'string' || !isNamespace(ns)) return null;
  if (typeof pv !== 'string' || !UUID_V4.test(pv)) return null;
  if (!includes(ARMS, arm)) return null;
  if (!Array.isArray(events) || events.length < 1 || events.length > MAX_EVENTS) return null;
  const items: BeaconItem[] = [];
  for (const raw of events) {
    const item = parseItem(raw);
    if (item === null) return null;
    items.push(item);
  }
  if (items.some((i) => i.reject !== undefined) && items.length !== 1) return null;
  // The sender never repeats a type and always sends the entry first; the route relies on both.
  if (new Set(items.map((i) => i.type)).size !== items.length) return null;
  if (items.findIndex((i) => i.type === 'entry') > 0) return null;
  return { v: 1, ns, pv, arm, events: items };
}
