// Redis key and hash-field names for the experiment store, and the address bucket the rate limit
// counts under. Server only: ipBucket uses node:net.
import { isIPv4, isIPv6 } from 'node:net';
import { ARMS, EXPERIMENT, type Arm } from '../../experiment.values.ts';
import { EVENT_TYPES, REJECT_REASONS, type EventType, type RejectReason } from './events.ts';

/**
 * The raw address bucket: an IPv4 address or an IPv6 prefix. It is personal data, so it must never
 * reach Redis: the route keys the rate limit by its HMAC under RATELIMIT_HMAC_KEY, and keys.rate
 * refuses an IpBucket at the type level.
 */
export type IpBucket = string & { readonly __ipBucket: true };

export const keys = {
  /** The hash that holds every counter of a namespace. */
  counters: (ns: string) => `exp:${ns}`,
  /** One view's claim on one event type (SET NX). */
  claim: (ns: string, pv: string, type: EventType) => `exp:${ns}:pv:${pv}:${type}`,
  /** One address bucket's events in one minute, keyed by the bucket's HMAC, never the bucket. */
  rate: <T extends string>(bucketHash: T extends IpBucket ? never : T, minute: number) => `exp:rl:${bucketHash}:${minute}`,
  /** Counted entry views on one Berlin day. */
  ceiling: (ns: string, day: string) => `exp:${ns}:ceil:${day}`,
  /** Set once the first decision is made: the route stops counting. */
  closed: (ns: string) => `exp:${ns}:closed`,
};

export type CounterField =
  | { kind: 'total'; arm: Arm; metric: EventType }
  | { kind: 'day'; day: string; arm: Arm; metric: EventType }
  | { kind: 'rejection'; reason: RejectReason }
  | { kind: 'rejectionDay'; day: string; reason: RejectReason };

export function fieldName(f: CounterField): string {
  switch (f.kind) {
    case 'total':
      return `t:${f.arm}:${f.metric}`;
    case 'day':
      return `d:${f.day}:${f.arm}:${f.metric}`;
    case 'rejection':
      return `r:${f.reason}`;
    case 'rejectionDay':
      return `rd:${f.day}:${f.reason}`;
  }
}

function includes<T extends string>(list: readonly T[], value: string | undefined): value is T {
  return value !== undefined && (list as readonly string[]).includes(value);
}

function isCalendarDay(day: string | undefined): day is string {
  const m = day === undefined ? null : /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The inverse of fieldName; null for any name it could not have written. */
export function parseField(name: string): CounterField | null {
  const [kind, ...rest] = name.split(':');
  if (kind === 't' && rest.length === 2) {
    const [arm, metric] = rest;
    if (includes(ARMS, arm) && includes(EVENT_TYPES, metric)) return { kind: 'total', arm, metric };
  }
  if (kind === 'd' && rest.length === 3) {
    const [day, arm, metric] = rest;
    if (isCalendarDay(day) && includes(ARMS, arm) && includes(EVENT_TYPES, metric)) return { kind: 'day', day, arm, metric };
  }
  if (kind === 'r' && rest.length === 1) {
    const [reason] = rest;
    if (includes(REJECT_REASONS, reason)) return { kind: 'rejection', reason };
  }
  if (kind === 'rd' && rest.length === 2) {
    const [day, reason] = rest;
    if (isCalendarDay(day) && includes(REJECT_REASONS, reason)) return { kind: 'rejectionDay', day, reason };
  }
  return null;
}

/** The eight 16-bit groups of a valid IPv6 address (zone removed, `::` and a dotted tail expanded). */
function hextets(ip: string): number[] {
  const bare = ip.split('%')[0]!;
  const toGroups = (part: string): number[] =>
    part === ''
      ? []
      : part.split(':').flatMap((g) => {
          if (!g.includes('.')) return [parseInt(g, 16)];
          const [a, b, c, d] = g.split('.').map(Number) as [number, number, number, number];
          return [(a << 8) | b, (c << 8) | d];
        });
  const [head, tail] = bare.split('::') as [string, string | undefined];
  if (tail === undefined) return toGroups(head);
  const left = toGroups(head);
  const right = toGroups(tail);
  return [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/**
 * IPv4: the address; IPv6: its /64 prefix (EXPERIMENT.rateLimit.ipv6PrefixBits), normalised;
 * anything else: null. An IPv4-mapped IPv6 address gives the IPv4 address it carries. The result is
 * the raw bucket: hash it before it goes into a key.
 */
export function ipBucket(ip: string | null): IpBucket | null {
  if (ip === null || ip === '') return null;
  if (isIPv4(ip)) return ip as IpBucket;
  if (!isIPv6(ip)) return null;
  const g = hextets(ip);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff].join('.') as IpBucket;
  }
  const bits = EXPERIMENT.rateLimit.ipv6PrefixBits;
  const prefix = g.slice(0, Math.ceil(bits / 16)).map((x, i) => {
    const kept = Math.min(16, bits - i * 16);
    return x & ((0xffff << (16 - kept)) & 0xffff);
  });
  return `${prefix.map((x) => x.toString(16)).join(':')}::/${bits}` as IpBucket;
}
