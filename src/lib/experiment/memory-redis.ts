// An in-memory Redis with exactly the commands the experiment store uses (SET takes NX, XX, EX,
// PXAT and KEEPTTL), answering as the Upstash
// REST API does (JSON results, `{error}` replies). Unit tests use it directly; scripts/fake-upstash.ts
// serves it over HTTP so the e2e run goes through the real REST client. Any other command throws.
import { unwrap, type RedisCommand, type RedisRest } from './redis-rest.ts';

export const MEMORY_COMMANDS = ['SET', 'GET', 'MGET', 'INCR', 'EXPIRE', 'PTTL', 'PEXPIRETIME', 'HINCRBY', 'HGETALL'] as const;
/** The commands a read-only token may run. */
export const READ_COMMANDS: readonly string[] = ['GET', 'MGET', 'PTTL', 'PEXPIRETIME', 'HGETALL'];

export type Reply = { result: unknown } | { error: string };
export type MemoryEntry = { key: string; value: string | Record<string, string>; expiresAt: number | null };

export interface MemoryRedis extends RedisRest {
  /** One command, answered as the REST API would; an unsupported command throws. */
  exec(c: RedisCommand): Reply;
  /** True for a command this store implements. */
  supports(c: RedisCommand): boolean;
  /** The live keys, their values and absolute expiry (ms), for scanning in tests. */
  entries(): MemoryEntry[];
}

/** A programming error, not an outage: the store was asked for a command it does not implement. */
export class UnsupportedCommand extends Error {
  constructor(name: string) {
    super(`memory-redis: unsupported command ${name}`);
    this.name = 'UnsupportedCommand';
  }
}

type Slot = { value: string | Map<string, string>; expiresAt: number | null };

const INTEGER = /^-?(0|[1-9]\d*)$/;

/** A Redis integer argument, or null. */
function integer(arg: string | number | undefined): number | null {
  const s = arg === undefined ? '' : String(arg);
  if (!INTEGER.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

const error = (message: string): Reply => ({ error: message });
const result = (value: unknown): Reply => ({ result: value });
const WRONGTYPE = 'WRONGTYPE Operation against a key holding the wrong kind of value';
const NOT_INTEGER = 'ERR value is not an integer or out of range';
const SYNTAX = 'ERR syntax error';
const arity = (name: string) => error(`ERR wrong number of arguments for '${name.toLowerCase()}' command`);

const commandName = (c: RedisCommand): string => String(c[0] ?? '').toUpperCase();

export function createMemoryRedis(o: { now?: () => number } = {}): MemoryRedis {
  const now = o.now ?? Date.now;
  const data = new Map<string, Slot>();

  /** The live slot of a key; an expired one is removed first. */
  function slot(key: string): Slot | undefined {
    const s = data.get(key);
    if (s !== undefined && s.expiresAt !== null && now() >= s.expiresAt) {
      data.delete(key);
      return undefined;
    }
    return s;
  }

  function set(args: string[]): Reply {
    const [key, value, ...options] = args;
    if (key === undefined || value === undefined) return arity('SET');
    let condition: 'NX' | 'XX' | null = null;
    let expiresAt: number | null = null;
    // One of EX, PXAT or KEEPTTL at most.
    let expiryOption: 'EX' | 'PXAT' | 'KEEPTTL' | null = null;
    for (let i = 0; i < options.length; i++) {
      const option = options[i]!.toUpperCase();
      if ((option === 'NX' || option === 'XX') && condition === null) {
        condition = option;
      } else if ((option === 'EX' || option === 'PXAT') && expiryOption === null) {
        const n = integer(options[++i]);
        if (n === null || n <= 0) return error('ERR invalid expire time in set');
        expiresAt = option === 'EX' ? now() + n * 1000 : n;
        expiryOption = option;
      } else if (option === 'KEEPTTL' && expiryOption === null) {
        expiryOption = option;
      } else {
        return error(SYNTAX);
      }
    }
    const existing = slot(key);
    if (condition === 'NX' && existing !== undefined) return result(null);
    if (condition === 'XX' && existing === undefined) return result(null);
    if (expiryOption === 'KEEPTTL') expiresAt = existing?.expiresAt ?? null;
    data.delete(key);
    // A PXAT in the past is accepted and the key is gone at once, as in Redis.
    if (expiresAt === null || now() < expiresAt) data.set(key, { value, expiresAt });
    return result('OK');
  }

  function stringValue(key: string): string | null | Reply {
    const s = slot(key);
    if (s === undefined) return null;
    return typeof s.value === 'string' ? s.value : error(WRONGTYPE);
  }

  function run(name: string, args: string[]): Reply {
    switch (name) {
      case 'SET':
        return set(args);
      case 'GET': {
        if (args.length !== 1) return arity(name);
        const v = stringValue(args[0]!);
        return typeof v === 'object' && v !== null ? v : result(v);
      }
      case 'MGET': {
        if (args.length < 1) return arity(name);
        return result(
          args.map((key) => {
            const s = slot(key);
            return s !== undefined && typeof s.value === 'string' ? s.value : null;
          }),
        );
      }
      case 'INCR': {
        if (args.length !== 1) return arity(name);
        const key = args[0]!;
        const s = slot(key);
        if (s !== undefined && typeof s.value !== 'string') return error(WRONGTYPE);
        const current = s === undefined ? 0 : integer(s.value as string);
        if (current === null || !Number.isSafeInteger(current + 1)) return error(NOT_INTEGER);
        data.set(key, { value: String(current + 1), expiresAt: s?.expiresAt ?? null });
        return result(current + 1);
      }
      case 'EXPIRE': {
        if (args.length !== 2 && args.length !== 3) return arity(name);
        const [key, seconds, flag] = args as [string, string, string | undefined];
        const n = integer(seconds);
        if (n === null) return error(NOT_INTEGER);
        if (flag !== undefined && flag.toUpperCase() !== 'NX') return error(SYNTAX);
        const s = slot(key);
        if (s === undefined) return result(0);
        if (flag !== undefined && s.expiresAt !== null) return result(0);
        if (n <= 0) data.delete(key);
        else s.expiresAt = now() + n * 1000;
        return result(1);
      }
      case 'PTTL':
      case 'PEXPIRETIME': {
        if (args.length !== 1) return arity(name);
        const s = slot(args[0]!);
        if (s === undefined) return result(-2);
        if (s.expiresAt === null) return result(-1);
        return result(name === 'PTTL' ? s.expiresAt - now() : s.expiresAt);
      }
      case 'HINCRBY': {
        if (args.length !== 3) return arity(name);
        const [key, field, by] = args as [string, string, string];
        const increment = integer(by);
        if (increment === null) return error(NOT_INTEGER);
        let s = slot(key);
        if (s !== undefined && typeof s.value === 'string') return error(WRONGTYPE);
        if (s === undefined) {
          s = { value: new Map(), expiresAt: null };
          data.set(key, s);
        }
        const hash = s.value as Map<string, string>;
        const current = integer(hash.get(field) ?? '0');
        if (current === null || !Number.isSafeInteger(current + increment)) return error('ERR hash value is not an integer');
        hash.set(field, String(current + increment));
        return result(current + increment);
      }
      case 'HGETALL': {
        if (args.length !== 1) return arity(name);
        const s = slot(args[0]!);
        if (s === undefined) return result([]);
        if (typeof s.value === 'string') return error(WRONGTYPE);
        return result([...s.value].flat());
      }
      default:
        throw new UnsupportedCommand(name);
    }
  }

  const supports = (c: RedisCommand) => (MEMORY_COMMANDS as readonly string[]).includes(commandName(c));

  function exec(c: RedisCommand): Reply {
    const name = commandName(c);
    if (!supports(c)) throw new UnsupportedCommand(name || '(empty)');
    return run(name, c.slice(1).map(String));
  }

  return {
    exec,
    supports,
    entries() {
      const out: MemoryEntry[] = [];
      for (const key of [...data.keys()]) {
        const s = slot(key);
        if (s === undefined) continue;
        out.push({ key, value: typeof s.value === 'string' ? s.value : Object.fromEntries(s.value), expiresAt: s.expiresAt });
      }
      return out;
    },
    async command(c) {
      return unwrap(exec(c), 'command');
    },
    async pipeline(cs) {
      // Like the REST client, an error item fails the whole call (the other commands still ran).
      const replies = cs.map((c) => exec(c));
      return replies.map((r, i) => unwrap(r, `pipeline item ${i}`));
    },
    async transaction(cs) {
      // An unsupported command discards the transaction before anything runs, as in Redis.
      const unsupported = cs.find((c) => !supports(c));
      if (unsupported !== undefined) throw new UnsupportedCommand(commandName(unsupported) || '(empty)');
      const replies = cs.map((c) => exec(c));
      return replies.map((r, i) => unwrap(r, `transaction item ${i}`));
    },
  };
}
