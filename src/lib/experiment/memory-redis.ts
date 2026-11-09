// An in-memory Redis with exactly the commands the experiment store uses (SET takes NX, XX, EX,
// PXAT and KEEPTTL), answering as the Upstash
// REST API does (JSON results, `{error}` replies). EVAL recognizes the exact experiment
// contracts using a synchronous TypeScript MODEL, never by interpreting Lua. Unit tests use it directly; scripts/fake-upstash.ts
// serves it over HTTP so the e2e run goes through the real REST client. Any other command throws.
import { ATOMIC_ENTRY_SCRIPT, ATOMIC_LATER_SCRIPT, INCREMENT_EXPIRING_SCRIPT } from './store.ts';
import { EVENT_TYPES, PREREQUISITES, type EventType } from './events.ts';
import { unwrap, type RedisCommand, type RedisRest } from './redis-rest.ts';

export const MEMORY_COMMANDS = ['SET', 'GET', 'MGET', 'INCR', 'EXPIRE', 'PTTL', 'PEXPIRETIME', 'HINCRBY', 'HGETALL', 'TYPE', 'TIME', 'HMGET', 'HSET', 'EVAL'] as const;
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
  /** Fixture cleanup without adding a command to the fake REST protocol. */
  remove(key: string): boolean;
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

export function createMemoryRedis(o: { now?: () => number; /** Model-only tracing/fault injection before an internal command. */ atomicCommand?: (c: RedisCommand) => void } = {}): MemoryRedis {
  const clock = o.now ?? Date.now;
  let operationTime: number | null = null;
  const now = () => operationTime ?? clock();
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
      case 'EVAL':
        return atomicModel(args);
      case 'TYPE': {
        if (args.length !== 1) return arity(name);
        const s = slot(args[0]!);
        return result(s === undefined ? 'none' : typeof s.value === 'string' ? 'string' : 'hash');
      }
      case 'TIME': {
        if (args.length !== 0) return arity(name);
        const t = now();
        return result([String(Math.floor(t / 1000)), String((t % 1000) * 1000)]);
      }
      case 'HMGET': {
        if (args.length < 2) return arity(name);
        const s = slot(args[0]!);
        if (s !== undefined && typeof s.value === 'string') return error(WRONGTYPE);
        const h = s?.value as Map<string, string> | undefined;
        return result(args.slice(1).map(f => h?.get(f) ?? null));
      }
      case 'HSET': {
        if (args.length < 3 || args.length % 2 !== 1) return arity(name);
        let s = slot(args[0]!);
        if (s !== undefined && typeof s.value === 'string') return error(WRONGTYPE);
        if (s === undefined) { s = {value:new Map(),expiresAt:null}; data.set(args[0]!,s); }
        const h = s.value as Map<string,string>;
        let added = 0;
        for (let i=1;i<args.length;i+=2) { if(!h.has(args[i]!)) added++; h.set(args[i]!,args[i+1]!); }
        return result(added);
      }
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

  /** Exact contract MODEL, not a Lua interpreter or proof of script/backend conformance.
   * A changed/unknown script is rejected. One frozen clock and synchronous execution model the
   * intended isolation; every write still applies immediately, including before injected errors.
   */
  function atomicModel(args: string[]): Reply {
    const [script, keyCount, ...rest] = args;
    const entry = script === ATOMIC_ENTRY_SCRIPT;
    const increment = script === INCREMENT_EXPIRING_SCRIPT;
    if (!entry && !increment && script !== ATOMIC_LATER_SCRIPT) return error('ERR unsupported model script');
    if (increment ? keyCount !== '1' || rest.length !== 2 : keyCount !== '9' || rest.length < 12) return error(SYNTAX);
    const ks = rest.slice(0, 9), av = rest.slice(9);
    const [arm, inputDay, expected] = av;
    let day = inputDay;
    const call = (name: string, ...a: (string | number)[]) => {
      const c: RedisCommand = [name, ...a];
      o.atomicCommand?.(c);
      return unwrap(run(name, a.map(String)), 'atomic model command');
    };
    const invalid = () => { throw new Error('ERR atomic store preflight'); };
    const safe = (raw: unknown, increment: boolean): number => {
      if (raw === null) raw = '0';
      if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw)) return invalid();
      const n = Number(raw);
      if (!Number.isSafeInteger(n) || n < 0 || (increment && n >= Number.MAX_SAFE_INTEGER)) return invalid();
      return n;
    };
    const previous = operationTime;
    operationTime = clock();
    try {
      if (increment) {
        const n = call('INCR', rest[0]!);
        call('EXPIRE', rest[0]!, rest[1]!, 'NX');
        return result(n);
      }
      if ((arm !== 'a' && arm !== 'b') || !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '') || new Set(ks).size !== 9) invalid();
      const closed = call('GET', ks[1]!);
      const entryValue = call('GET', ks[2]!);
      let outcomes: (string | number)[][] = [];
      const planned: EventType[] = [];
      let expiry = 0;
      let mask: string[] | null = null;
      if (entry) {
        if (av.length !== 3 || !/^pending:[0-9a-f]{32}$/.test(expected ?? '')) invalid();
        expiry = call('PEXPIRETIME', ks[2]!) as number;
        if (closed !== null || expiry <= 0 || expiry > Number.MAX_SAFE_INTEGER || Number(call('PTTL', ks[2]!)) <= 0) return result(['orphan']);
        if (entryValue !== expected) return result(['duplicate']);
        planned.push('entry');
      } else {
        if (av.length < 4 || av.length > 9) invalid();
        const deadline = expected === '' ? null : safe(expected, false);
        if (closed !== null && deadline === null) return result(['closed', closed]);
        const packed = typeof entryValue === 'string' ? /^([ab])\|(\d{4}-\d{2}-\d{2})\|([1-9]\d*)\|([01-]{6})$/.exec(entryValue) : null;
        if (typeof entryValue === 'string' && entryValue.includes('|') && packed === null) invalid();
        let values: unknown[];
        let valid = false;
        if (packed !== null) {
          day = packed[2];
          expiry = safe(packed[3], false);
          mask = [...packed[4]!];
          valid = closed === null && packed[1] === arm && (deadline === null || deadline === expiry) && Number(call('PTTL', ks[2]!)) > 0;
          values = [packed[1], ...mask.map(state => state === '1' ? packed[1] : state === '-' ? '-' : null)];
        } else {
          if (entryValue === arm && closed === null) {
            expiry = call('PEXPIRETIME', ks[2]!) as number;
            if (expiry > 0 && expiry <= Number.MAX_SAFE_INTEGER && Number(call('PTTL', ks[2]!)) > 0) {
              if (deadline === null) return result(['legacy', expiry]);
              valid = expiry === deadline;
            }
          }
          values = [entryValue, ...ks.slice(3).map(k => entryValue === arm ? call('GET', k) : null)];
        }
        const ready = new Set<EventType>(EVENT_TYPES.filter((_, i) => values[i] === arm));
        const seen = new Set<string>();
        for (const raw of av.slice(3)) {
          if (!(EVENT_TYPES as readonly string[]).includes(raw) || raw === 'entry' || seen.has(raw)) invalid();
          seen.add(raw);
          const t = raw as EventType;
          if (!valid || !PREREQUISITES[t].every(p => ready.has(p))) outcomes.push([t, 'orphan']);
          else if (values[EVENT_TYPES.indexOf(t)] !== null) outcomes.push([t, 'duplicate']);
          else { outcomes.push([t, 'counted']); planned.push(t); ready.add(t); }
        }
      }
      const fields = planned.flatMap(t => [`t:${arm}:${t}`, `d:${day}:${arm}:${t}`]);
      const old = fields.length > 0 ? call('HMGET', ks[0]!, ...fields) as unknown[] : [];
      const next = old.map(v => safe(v, true) + 1);
      const write = () => call('HSET', ks[0]!, ...fields.flatMap((f, i) => [f, String(next[i])]));
      const setPacked = (bits: string) => {
        if (call('SET', ks[2]!, `${arm}|${day}|${expiry}|${bits}`, 'XX', 'KEEPTTL') !== 'OK') {
          throw new Error('ERR atomic store ownership');
        }
      };
      if (entry) {
        if (call('SET', ks[2]!, '-', 'XX', 'KEEPTTL') !== 'OK') return result(['orphan']);
        write();
        setPacked('000000');
      } else if (fields.length > 0 && mask !== null) {
        for (const t of planned) mask[EVENT_TYPES.indexOf(t) - 1] = t === 'inview' ? '-' : '1';
        setPacked(mask.join(''));
        write();
        if (planned.includes('inview')) {
          mask[0] = '1';
          setPacked(mask.join(''));
        }
      } else if (fields.length > 0) {
        for (const t of planned) {
          if (call('SET', ks[EVENT_TYPES.indexOf(t) + 2]!, '-', 'NX', 'PXAT', expiry) !== 'OK') throw new Error('ERR atomic store ownership');
        }
        write();
        for (const t of planned) {
          if (call('SET', ks[EVENT_TYPES.indexOf(t) + 2]!, arm!, 'XX', 'KEEPTTL') !== 'OK') throw new Error('ERR atomic store promotion');
        }
      }
      if (entry) return result(['counted', next[0], next[1], expiry]);
      outcomes = outcomes.map(out => {
        const i = planned.indexOf(out[0] as EventType);
        return i < 0 ? out : [...out, next[i * 2]!, next[i * 2 + 1]!];
      });
      return result(outcomes);
    } catch {
      return error('ERR atomic model operation failed');
    } finally { operationTime = previous; }
  }

  const supports = (c: RedisCommand) => commandName(c) === 'EVAL'
    ? c[1] === ATOMIC_ENTRY_SCRIPT || c[1] === ATOMIC_LATER_SCRIPT || c[1] === INCREMENT_EXPIRING_SCRIPT
    : (MEMORY_COMMANDS as readonly string[]).includes(commandName(c));

  function exec(c: RedisCommand): Reply {
    const name = commandName(c);
    if (!supports(c)) throw new UnsupportedCommand(name || '(empty)');
    return run(name, c.slice(1).map(String));
  }

  return {
    exec,
    supports,
    remove: key => slot(key) !== undefined && data.delete(key),
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
      const replies: Reply[] = [];
      for (const c of cs) { replies.push(exec(c)); await Promise.resolve(); }
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
