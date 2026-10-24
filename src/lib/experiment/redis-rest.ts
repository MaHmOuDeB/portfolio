// A minimal client for the Upstash Redis REST API: one command, a pipeline and a transaction, each
// a POST of a JSON array with a bearer token. It replaces @upstash/redis, whose default fetch sets
// `cache: 'no-store'` and would turn an ISR page dynamic: no request init here has a `cache` or a
// `next` key. Server only. Error messages name a category, never the token, the URL or a key.

export type RedisCommand = readonly (string | number)[];

export interface RedisRest {
  /** POST {url}, body ["HGETALL","k"]; returns the reply's `result`. */
  command(c: RedisCommand): Promise<unknown>;
  /** POST {url}/pipeline, body [[...],[...]]; not atomic. */
  pipeline(cs: RedisCommand[]): Promise<unknown[]>;
  /** POST {url}/multi-exec, body [[...],[...]]; atomic (MULTI/EXEC). */
  transaction(cs: RedisCommand[]): Promise<unknown[]>;
}

/** The store could not be used: a network error, a timeout, a non-2xx, or an `{error}` reply. */
export class RedisUnavailable extends Error {
  constructor(message: string) {
    super(`redis unavailable: ${message}`);
    this.name = 'RedisUnavailable';
  }
}

export const DEFAULT_TIMEOUT_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `result` of one reply item; an `{error}` item or any other shape throws. */
export function unwrap(item: unknown, what: string): unknown {
  if (isRecord(item) && 'error' in item) throw new RedisUnavailable(`${what} returned an error`);
  if (isRecord(item) && 'result' in item) return item.result;
  throw new RedisUnavailable(`${what} returned an unexpected reply`);
}

function unwrapAll(body: unknown, count: number, what: string): unknown[] {
  if (!Array.isArray(body)) {
    // A discarded transaction answers with a single {error}.
    unwrap(body, what);
    throw new RedisUnavailable(`${what} returned an unexpected reply`);
  }
  if (body.length !== count) throw new RedisUnavailable(`${what} returned ${body.length} replies for ${count} commands`);
  return body.map((item, i) => unwrap(item, `${what} item ${i}`));
}

export function createRedisRest(o: {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): RedisRest {
  const base = o.url.replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /**
   * One POST, bounded by timeoutMs end to end (headers and body). The global timer drives the
   * bound, because Node's AbortSignal.timeout runs on an internal timer that test clocks cannot
   * move; the signal also aborts the real request.
   */
  async function post(path: string, body: unknown, what: string): Promise<unknown> {
    const doFetch = o.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RedisUnavailable(`${what} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
    });
    const request = (async () => {
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${o.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]),
        });
      } catch {
        // The cause is dropped on purpose: a fetch error can name the host.
        throw new RedisUnavailable(`${what} failed (network)`);
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new RedisUnavailable(`${what} failed (HTTP ${res.status})`);
      }
      try {
        return (await res.json()) as unknown;
      } catch {
        throw new RedisUnavailable(`${what} returned invalid JSON`);
      }
    })();
    try {
      return await Promise.race([request, timeout]);
    } finally {
      clearTimeout(timer);
      // A request that loses the race must not surface as an unhandled rejection.
      request.catch(() => {});
    }
  }

  return {
    async command(c) {
      return unwrap(await post('', c, 'command'), 'command');
    },
    async pipeline(cs) {
      return unwrapAll(await post('/pipeline', cs, 'pipeline'), cs.length, 'pipeline');
    },
    async transaction(cs) {
      return unwrapAll(await post('/multi-exec', cs, 'transaction'), cs.length, 'transaction');
    },
  };
}
