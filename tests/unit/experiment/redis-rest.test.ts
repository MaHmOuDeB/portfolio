import { RedisUnavailable, createRedisRest } from '@/lib/experiment/redis-rest';

const URL_ = 'https://eu1-quiet-otter-12345.upstash.io';
const HOST = 'eu1-quiet-otter-12345.upstash.io';
const TOKEN = 'test-token-AbCdEf0123456789';

type Call = { url: string; init: RequestInit };

/** A fake fetch that records every call and answers with `reply(call)`. */
function recordingFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return reply(call);
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function failure(p: Promise<unknown>): Promise<RedisUnavailable> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RedisUnavailable);
    return e as RedisUnavailable;
  }
  throw new Error('expected a rejection');
}

describe('createRedisRest', () => {
  it('command POSTs the JSON array to the base URL with the bearer token and returns result', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: ['t:a:entry', '3'] }));
    const redis = createRedisRest({ url: URL_, token: TOKEN, fetch });
    await expect(redis.command(['HGETALL', 'k'])).resolves.toEqual(['t:a:entry', '3']);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL_);
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(['HGETALL', 'k']);
  });

  it('a trailing slash on the URL is not doubled', async () => {
    const { calls, fetch } = recordingFetch(() => json([{ result: 1 }]));
    await createRedisRest({ url: `${URL_}/`, token: TOKEN, fetch }).pipeline([['INCR', 'k']]);
    expect(calls[0]!.url).toBe(`${URL_}/pipeline`);
  });

  it('pipeline and transaction POST to /pipeline and /multi-exec and unwrap each result', async () => {
    const { calls, fetch } = recordingFetch(() => json([{ result: 'OK' }, { result: 2 }]));
    const redis = createRedisRest({ url: URL_, token: TOKEN, fetch });
    const cs = [
      ['SET', 'k', 'a', 'NX', 'EX', 1800],
      ['INCR', 'n'],
    ];
    await expect(redis.pipeline(cs)).resolves.toEqual(['OK', 2]);
    await expect(redis.transaction(cs)).resolves.toEqual(['OK', 2]);
    expect(calls.map((c) => c.url)).toEqual([`${URL_}/pipeline`, `${URL_}/multi-exec`]);
    for (const c of calls) expect(JSON.parse(String(c.init.body))).toEqual(cs);
  });

  it('null results are results, not errors', async () => {
    const { fetch } = recordingFetch(() => json({ result: null }));
    await expect(createRedisRest({ url: URL_, token: TOKEN, fetch }).command(['GET', 'k'])).resolves.toBeNull();
  });

  describe('throws RedisUnavailable', () => {
    const cases: [string, () => Response | Promise<Response>, 'command' | 'pipeline' | 'transaction'][] = [
      ['an {error} reply to a command', () => json({ error: 'WRONGTYPE Operation against a key' }, 400), 'command'],
      ['an {error} reply with status 200', () => json({ error: 'ERR' }), 'command'],
      ['an item with error in a pipeline', () => json([{ result: 1 }, { error: 'ERR value is not an integer' }]), 'pipeline'],
      ['an item with error in a transaction', () => json([{ result: 1 }, { error: 'ERR' }]), 'transaction'],
      ['a discarded transaction (a single {error})', () => json({ error: 'ERR syntax error' }, 400), 'transaction'],
      ['a 500', () => new Response('oops', { status: 500 }), 'command'],
      ['a 401', () => json({ error: 'Unauthorized' }, 401), 'pipeline'],
      ['invalid JSON', () => new Response('{not json', { status: 200 }), 'command'],
      ['a reply without result', () => json({}), 'command'],
      ['a pipeline reply of the wrong length', () => json([{ result: 1 }]), 'pipeline'],
      ['a pipeline reply that is not an array', () => json({ result: 1 }), 'pipeline'],
      [
        'a network error naming the host',
        () => {
          throw new TypeError(`fetch failed: getaddrinfo ENOTFOUND ${HOST} ${TOKEN}`);
        },
        'command',
      ],
    ];

    it.each(cases)('%s', async (_name, reply, method) => {
      const { fetch } = recordingFetch(reply);
      const redis = createRedisRest({ url: URL_, token: TOKEN, fetch });
      const run =
        method === 'command'
          ? redis.command(['GET', 'k'])
          : redis[method]([
              ['INCR', 'k'],
              ['EXPIRE', 'k', 120, 'NX'],
            ]);
      const error = await failure(run);
      for (const text of [error.message, String(error), error.stack ?? '']) {
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain(HOST);
        expect(text).not.toContain('upstash.io');
      }
      expect(error.cause).toBeUndefined();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('a fetch that never settles, after the default 1,500 ms (fake timers)', async () => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const { fetch } = recordingFetch((call) => {
        signal = call.init.signal ?? undefined;
        return new Promise<Response>(() => {});
      });
      const outcome = vi.fn();
      const run = createRedisRest({ url: URL_, token: TOKEN, fetch })
        .command(['GET', 'k'])
        .then(
          () => outcome('resolved'),
          (e: unknown) => outcome(e),
        );
      await vi.advanceTimersByTimeAsync(1499);
      expect(outcome).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(outcome).toHaveBeenCalledTimes(1);
      const error = outcome.mock.calls[0]![0] as unknown;
      expect(error).toBeInstanceOf(RedisUnavailable);
      expect((error as Error).message).not.toContain(TOKEN);
      expect(signal?.aborted).toBe(true);
    });

    it('a custom timeoutMs is honoured', async () => {
      vi.useFakeTimers();
      const { fetch } = recordingFetch(() => new Promise<Response>(() => {}));
      const outcome = vi.fn();
      const run = createRedisRest({ url: URL_, token: TOKEN, fetch, timeoutMs: 2000 })
        .pipeline([['GET', 'k']])
        .catch((e: unknown) => outcome(e));
      await vi.advanceTimersByTimeAsync(1999);
      expect(outcome).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(outcome.mock.calls[0]![0]).toBeInstanceOf(RedisUnavailable);
    });
  });

  it('no request init has a cache or a next key (an ISR page must stay static)', async () => {
    const { calls, fetch } = recordingFetch((call) =>
      call.url.endsWith('/pipeline') || call.url.endsWith('/multi-exec') ? json([{ result: 1 }]) : json({ result: 1 }),
    );
    const redis = createRedisRest({ url: URL_, token: TOKEN, fetch });
    await redis.command(['INCR', 'k']);
    await redis.pipeline([['INCR', 'k']]);
    await redis.transaction([['INCR', 'k']]);
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(Object.keys(c.init)).not.toContain('cache');
      expect(Object.keys(c.init)).not.toContain('next');
    }
  });

  it('refuses redirects, so a body is never re-sent to another host', async () => {
    const { calls, fetch } = recordingFetch((call) =>
      call.url.endsWith('/pipeline') || call.url.endsWith('/multi-exec') ? json([{ result: 1 }]) : json({ result: 1 }),
    );
    const redis = createRedisRest({ url: URL_, token: TOKEN, fetch });
    await redis.command(['INCR', 'k']);
    await redis.pipeline([['INCR', 'k']]);
    await redis.transaction([['INCR', 'k']]);
    for (const c of calls) expect(c.init.redirect).toBe('error');
  });

  it('uses the global fetch at call time when none is given', async () => {
    const { calls, fetch } = recordingFetch(() => json({ result: 'PONG' }));
    const redis = createRedisRest({ url: URL_, token: TOKEN });
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetch);
    try {
      await expect(redis.command(['GET', 'k'])).resolves.toBe('PONG');
      expect(calls).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });
});
