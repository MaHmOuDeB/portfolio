// A local HTTP fake of the Upstash Redis REST API (`/`, `/pipeline`, `/multi-exec`, bearer tokens),
// over the in-memory Redis. Its EVAL support is an exact-contract model, NOT a Lua runtime. The e2e run points KV_REST_API_URL at it, so pages and the event route go
// through the real REST client and Next's real fetch path. It binds to 127.0.0.1 only, and the
// read-only token refuses write commands (403). Never used in production.
//
// It also fakes Resend's send endpoint for the contact form (POST /resend/emails, bearer
// RESEND_API_KEY): the e2e server's RESEND_API_URL points here, so no test reaches Resend. It checks
// the payload's keys, answers 500 for a subject holding FAKE_RESEND_FAIL, and keeps what it accepted
// in memory for GET /resend/sent?reply_to=<address> (the e2e specs read their own messages back).
//
//   node scripts/fake-upstash.ts --port 8079   serve; tokens from KV_REST_API_TOKEN and
//                                              KV_REST_API_READ_ONLY_TOKEN, and the test clock
//                                              from EXPERIMENT_CLOCK_OFFSET_MS (the same offset the
//                                              e2e Next server runs with, so expiries agree)
//   node scripts/fake-upstash.ts --wait 8079   exit 0 once http://127.0.0.1:8079/health answers
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { READ_COMMANDS, createMemoryRedis, type MemoryRedis, type Reply } from '../src/lib/experiment/memory-redis.ts';

const STORE = Symbol.for('portfolio.fakeUpstash');
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;

type Command = (string | number)[];

/**
 * The one store of this process, on globalThis so every importer shares it. `now` (the store's
 * clock) applies when the first call creates it.
 */
export function fakeUpstashStore(now?: () => number): MemoryRedis {
  const g = globalThis as Record<symbol, unknown>;
  g[STORE] ??= createMemoryRedis(now === undefined ? {} : { now });
  return g[STORE] as MemoryRedis;
}

/** EXPERIMENT_CLOCK_OFFSET_MS as whole milliseconds; 0 when unset; anything else throws. */
export function clockOffsetFrom(value: string | undefined): number {
  if (value === undefined || value === '') return 0;
  const n = /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error('EXPERIMENT_CLOCK_OFFSET_MS must be a whole number of milliseconds');
  return n;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isCommand(value: unknown): value is Command {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'string' &&
    value.every((a) => typeof a === 'string' || (typeof a === 'number' && Number.isFinite(a)))
  );
}

const nameOf = (c: Command) => String(c[0]).toUpperCase();

/** A subject holding this makes the fake Resend answer 500 (the delivery-failure path). */
export const FAKE_RESEND_FAIL = 'FAKE_RESEND_FAIL';
const RESEND_KEYS = ['from', 'reply_to', 'subject', 'text', 'to'];
export type FakeEmail = { from: string; to: string; reply_to: string; subject: string; text: string };

export async function startFakeUpstash(o: {
  port: number;
  token: string;
  readOnlyToken: string;
  /** The store's clock (ms); the real one by default. */
  now?: () => number;
  /** The bearer key the fake Resend endpoint accepts; without one it answers 401. */
  resendKey?: string;
}): Promise<{ url: string; address(): AddressInfo; close(): Promise<void>; emails: FakeEmail[] }> {
  if (o.token === '' || o.readOnlyToken === '' || o.token === o.readOnlyToken) {
    throw new Error('fake-upstash needs two different, non-empty tokens');
  }
  const store = fakeUpstashStore(o.now);
  const exec = (c: Command): Reply => (store.supports(c) ? store.exec(c) : { error: `ERR unknown command '${nameOf(c)}'` });

  const emails: FakeEmail[] = [];

  async function resend(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    if (req.method === 'GET' && url.pathname === '/resend/sent') {
      return send(res, 200, emails.filter((e) => e.reply_to === url.searchParams.get('reply_to')));
    }
    if (req.method !== 'POST' || url.pathname !== '/resend/emails') return send(res, 404, { error: 'not found' });
    if (!o.resendKey || req.headers.authorization !== `Bearer ${o.resendKey}`) return send(res, 401, { message: 'unauthorized' });
    const text = await readBody(req);
    let body: unknown;
    try {
      body = JSON.parse(text ?? '');
    } catch {
      return send(res, 400, { message: 'invalid json' });
    }
    const keys = body !== null && typeof body === 'object' ? Object.keys(body).sort() : [];
    if (JSON.stringify(keys) !== JSON.stringify(RESEND_KEYS) || !Object.values(body as object).every((v) => typeof v === 'string')) {
      return send(res, 422, { message: 'unexpected payload' });
    }
    const email = body as FakeEmail;
    if (email.subject.includes(FAKE_RESEND_FAIL)) return send(res, 500, { message: 'fake failure' });
    emails.push(email);
    send(res, 200, { id: `fake-${emails.length}` });
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const path = url.pathname;
    if (req.method === 'GET' && path === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    if (path.startsWith('/resend/')) return resend(req, res, url);
    if (req.method !== 'POST' || !['/', '/pipeline', '/multi-exec'].includes(path)) return send(res, 404, { error: 'not found' });

    const auth = req.headers.authorization;
    const readOnly = auth === `Bearer ${o.readOnlyToken}`;
    if (auth !== `Bearer ${o.token}` && !readOnly) return send(res, 401, { error: 'Unauthorized' });

    const text = await readBody(req);
    if (text === null) return send(res, 413, { error: 'ERR max request size exceeded' });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return send(res, 400, { error: 'ERR failed to parse command' });
    }
    const commands = path === '/' ? [body] : body;
    if (!Array.isArray(commands) || commands.length === 0 || !commands.every(isCommand)) {
      return send(res, 400, { error: 'ERR failed to parse command' });
    }
    if (readOnly && commands.some((c) => !READ_COMMANDS.includes(nameOf(c)))) {
      return send(res, 403, { error: 'NOPERM this token can only run read commands' });
    }

    if (path === '/') {
      const reply = exec(commands[0]!);
      return send(res, 'error' in reply ? 400 : 200, reply);
    }
    if (path === '/multi-exec') {
      const unsupported = commands.find((c) => !store.supports(c));
      if (unsupported !== undefined) return send(res, 400, { error: `ERR unknown command '${nameOf(unsupported)}'` });
    }
    if (path === '/pipeline') {
      const replies: Reply[] = [];
      // Yield between commands: real pipelines permit other requests to interleave.
      for (const c of commands) { replies.push(exec(c)); await new Promise<void>(resolve => setImmediate(resolve)); }
      return send(res, 200, replies);
    }
    send(res, 200, commands.map(exec));
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'ERR internal error' });
      else res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port, HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = () => server.address() as AddressInfo;
  return {
    url: `http://${HOST}:${address().port}`,
    address,
    emails,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeAllConnections();
      }),
  };
}

/** Polls /health until it answers 200, or gives up after timeoutMs. */
async function waitFor(port: number, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${HOST}:${port}/health`);
      if (res.status === 200) return true;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

function portArg(value: string | undefined): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('a port from 1 to 65535 is required');
  return port;
}

async function main(argv: string[]): Promise<number> {
  const [flag, value] = argv;
  if (flag === '--wait') return (await waitFor(portArg(value))) ? 0 : 1;
  if (flag !== '--port') throw new Error('usage: fake-upstash.ts --port <port> | --wait <port>');
  if (process.env.VERCEL_ENV === 'production') throw new Error('fake-upstash never runs in production');
  const token = process.env.KV_REST_API_TOKEN ?? '';
  const readOnlyToken = process.env.KV_REST_API_READ_ONLY_TOKEN ?? '';
  const offset = clockOffsetFrom(process.env.EXPERIMENT_CLOCK_OFFSET_MS);
  const resendKey = process.env.RESEND_API_KEY || undefined;
  const server = await startFakeUpstash({ port: portArg(value), token, readOnlyToken, now: () => Date.now() + offset, resendKey });
  console.log(`fake upstash listening on ${server.url}`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void server.close().then(() => process.exit(0)));
  }
  return -1;
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(
    (code) => {
      if (code >= 0) process.exit(code);
    },
    (e: unknown) => {
      console.error(`fake-upstash: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
}
