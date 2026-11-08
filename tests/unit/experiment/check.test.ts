import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { main } from '../../../scripts/experiment-check.ts';

const REDIS_URL = 'https://eu1-secret-host-1234.upstash.io';
const READ_TOKEN = 'read-token-value-that-must-never-be-printed';
const GLOBAL_CONFIG = 'https://edge-config.vercel.com/ecfg_secretid123?token=edge-token-value-never-printed';
const SECRETS = [REDIS_URL, 'secret-host', READ_TOKEN, 'ecfg_secretid123', 'edge-token-value-never-printed'];

const DATA = {
  schema: 'experiment-data/1',
  namespace: 'aa-v1',
  configPhase: 'calibration',
  status: 'calibration',
  source: 'store',
  unavailable: null,
  readAt: '2026-11-20T10:00:00.000Z',
  funnel: { excluded: { bot: 12, internal: '<5', self: 0, forced: 0, not_entry: 7, rate_limited: 0, ceiling: 0 } },
  srm: { assignment: { chi2: 0.4, flagged: false }, analysed: null, firstFlaggedOn: null, flaggedBase: null, flaggedLook: null, afterDecision: false },
  calibration: { days: 18, srmPassed: true, intervalContainsZero: true, evaluatedOn: '2026-11-19', ready: true, failed: false },
  decision: null,
  decidedOn: null,
  frozenAt: null,
  held: null,
  ceilingDays: [],
};

let server: Server;
let origin: string;
let body: unknown = DATA;
let status = 200;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/experiment/data.json') {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  body = DATA;
  status = 200;
});

async function run(argv: string[], env: Record<string, string | undefined> = {}, fetchImpl?: typeof fetch) {
  const lines: string[] = [];
  const code = await main(argv, { env, out: (l) => lines.push(l), fetch: fetchImpl });
  return { code, out: lines.join('\n'), lines };
}

describe('experiment:check --url', () => {
  it('prints the phase, the funnel, the split checks, the calibration check, the decision and the closed state', async () => {
    const r = await run(['--url', origin]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^phase: calibration \(status calibration, source store\)$/m);
    expect(r.out).toMatch(/^funnel excluded: bot 12, internal <5, self 0, forced 0, not_entry 7, rate_limited 0, ceiling 0$/m);
    expect(r.out).toMatch(/^srm: assignment passed \(chi2 0\.4\), analysed not yet, first flagged on none$/m);
    expect(r.out).toMatch(/^calibration: ready, days 18, srm passed yes, interval contains 0 yes, failed no$/m);
    expect(r.out).toMatch(/^decision: none$/m);
    expect(r.out).toMatch(/^closed: no \(not frozen, not held, ceiling days none\)$/m);
  });

  it('shows a decision and a frozen analysis as closed', async () => {
    body = { ...DATA, status: 'aa-failed', decision: null, frozenAt: '2026-11-19', calibration: { ...DATA.calibration, ready: false, failed: true } };
    const r = await run(['--url', origin]);
    expect(r.out).toMatch(/^calibration: not ready, .*failed yes$/m);
    expect(r.out).toMatch(/^closed: yes \(frozen at 2026-11-19/m);
  });

  it('says why a placeholder has no data', async () => {
    body = { ...DATA, source: 'unavailable', unavailable: 'not-started', calibration: null };
    const r = await run(['--url', origin]);
    expect(r.out).toMatch(/^phase: calibration \(status calibration, source unavailable, not-started\)$/m);
    expect(r.out).toMatch(/^calibration: none yet$/m);
  });

  it('exits 1 on a bad answer', async () => {
    status = 500;
    expect((await run(['--url', origin])).code).toBe(1);
  });
});

describe('experiment:check --storage', () => {
  const ENV = { KV_REST_API_URL: REDIS_URL, KV_REST_API_READ_ONLY_TOKEN: READ_TOKEN, GLOBAL_CONFIG };

  function fakeFetch(edge: { status: number; body?: unknown; digest?: boolean }): { fetch: typeof fetch; seen: string[] } {
    const seen: string[] = [];
    const f: typeof fetch = async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      seen.push(url);
      if (url.startsWith(REDIS_URL)) {
        expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${READ_TOKEN}`);
        return new Response(JSON.stringify({ result: 14 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (edge.digest) headers['x-edge-config-digest'] = 'abc';
      return new Response(edge.body === undefined ? '' : JSON.stringify(edge.body), { status: edge.status, headers });
    };
    return { fetch: f, seen };
  }

  it('prints only the two status lines, never the token, the URL or a value', async () => {
    const f = fakeFetch({ status: 404, digest: true });
    const r = await run(['--storage'], ENV, f.fetch);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual(['redis: ok (14 fields in exp:aa-v1)', 'edge config: ok (item experiment: missing)']);
    for (const s of SECRETS) expect(r.out).not.toContain(s);
    expect(f.seen.some((u) => u.startsWith(REDIS_URL))).toBe(true);
  });

  it('reads a valid and a malformed item without printing it', async () => {
    const valid = await run(['--storage'], ENV, fakeFetch({ status: 200, body: { paused: { on: '2026-11-20T10:00:00+01:00', reason: 'a private reason text' } } }).fetch);
    expect(valid.lines[1]).toBe('edge config: ok (item experiment: valid)');
    expect(valid.out).not.toContain('a private reason text');
    const malformed = await run(['--storage'], ENV, fakeFetch({ status: 200, body: { paused: 'yes' } }).fetch);
    expect(malformed.lines[1]).toBe('edge config: ok (item experiment: malformed)');
  });

  it('a failing read prints a category only and exits 1', async () => {
    const failing: typeof fetch = async () => {
      throw new Error(`connect ECONNREFUSED ${REDIS_URL} ${READ_TOKEN}`);
    };
    const r = await run(['--storage'], ENV, failing);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^redis: failed/m);
    expect(r.out).toMatch(/^edge config: failed/m);
    for (const s of SECRETS) expect(r.out).not.toContain(s);
  });

  it('missing variables exit 1, naming only the variables', async () => {
    const r = await run(['--storage'], { KV_REST_API_URL: REDIS_URL });
    expect(r.code).toBe(1);
    expect(r.out).toContain('KV_REST_API_READ_ONLY_TOKEN');
    expect(r.out).toContain('GLOBAL_CONFIG');
    expect(r.out).not.toContain(REDIS_URL);
    expect(r.out).not.toContain('KV_REST_API_URL');
  });
});

describe('experiment:check usage', () => {
  it('exits 2 without a mode', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['--url'])).code).toBe(2);
  });
});
