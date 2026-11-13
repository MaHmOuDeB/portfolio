import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, request, type Server } from 'node:http';
import { isIPv6 } from 'node:net';
import { request as playwrightRequest } from '@playwright/test';
import { clientAddress, startClientProxy, type ClientProxy } from '../e2e/client-proxy';
import { ipBucket } from '../../src/lib/experiment/keys';

const servers: Server[] = [];
const proxies: ClientProxy[] = [];
afterEach(async () => {
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); })));
});
async function upstream() {
  const received: { headers: Record<string, unknown>; body: string; url: string }[] = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received.push({ headers: req.headers, body, url: req.url! });
    res.writeHead(201, { 'set-cookie': ['one=1', 'two=2'], 'content-type': 'text/plain' }); res.end(body);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('no address');
  return { origin: `http://localhost:${addr.port}`, received };
}
async function send(proxy: ClientProxy, origin: string, body: string) {
  return new Promise<{ status: number; body: string; cookies: string[] | undefined }>((resolve, reject) => {
    const req = request(proxy.server, { method: 'POST', path: origin + '/api/e?probe=1', headers: {
      host: new URL(origin).host, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'text/plain',
      'x-forwarded-for': 'bad', connection: 'x-remove', 'x-remove': 'bad',
    } }, async (res) => { let data = ''; for await (const chunk of res) data += chunk; resolve({ status: res.statusCode!, body: data, cookies: res.headers['set-cookie'] }); });
    req.on('error', reject); req.end(body);
  });
}
it('allocates valid, noncolliding production /64 buckets across workers and executions', () => {
  const buckets = new Set<string>();
  for (const worker of [0, 1, 255, 65535]) for (const ordinal of [1, 2, 255, 65535]) {
    const address = clientAddress(worker, ordinal);
    expect(isIPv6(address)).toBe(true);
    const bucket = ipBucket(address); expect(bucket).not.toBeNull(); buckets.add(bucket!);
  }
  expect(buckets.size).toBe(16);
  for (const [worker, ordinal] of [[-1, 1], [65536, 1], [0, 0], [0, 65536], [0.5, 1], [0, NaN]]) {
    expect(() => clientAddress(worker!, ordinal!)).toThrow(RangeError);
  }
});
it('streams bytes and origin metadata, stamps the allocated address, preserves cookies', async () => {
  const target = await upstream(); const proxy = await startClientProxy(target.origin, clientAddress(3, 1)); proxies.push(proxy);
  const body = 'beacon 🦉\u0000'; const res = await send(proxy, target.origin, body);
  expect(res).toEqual({ status: 201, body, cookies: ['one=1', 'two=2'] });
  expect(target.received).toEqual([{ url: '/api/e?probe=1', body, headers: expect.objectContaining({
    'x-forwarded-for': proxy.address, 'x-real-ip': proxy.address, origin: target.origin, host: new URL(target.origin).host, 'sec-fetch-site': 'same-origin',
  }) }]);
  expect(target.received[0]!.headers['x-remove']).toBeUndefined();
  expect(proxy.events).toEqual([{ body, status: 201, address: proxy.address }]);
});
it('holds only the selected response, allowing a subsequent beacon request through', async () => {
  const target = await upstream(); const proxy = await startClientProxy(target.origin, clientAddress(4, 1)); proxies.push(proxy);
  const gate = proxy.holdResponse((body) => body === 'engaged');
  const pending = send(proxy, target.origin, 'engaged');
  await gate.entered;
  expect((await send(proxy, target.origin, 'engaged,inview,card')).status).toBe(201);
  gate.release(); expect((await pending).status).toBe(201);
});
it('records the upstream answer when the client hangs up after the response head, as Chromium does with an unload beacon', async () => {
  // The head and the first bytes leave at once, the end only later: the window in which Chromium
  // cancels a detached document's beacon and closes its connection.
  let ended!: () => void;
  const upstreamEnded = new Promise<void>((resolve) => (ended = resolve));
  const server = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"ok":');
    setTimeout(() => { res.end('true}'); ended(); }, 200);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('no address');
  const origin = `http://localhost:${addr.port}`;
  const proxy = await startClientProxy(origin, clientAddress(8, 1)); proxies.push(proxy);

  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(proxy.server, { method: 'POST', path: origin + '/api/e', headers: { host: new URL(origin).host, 'content-type': 'text/plain' } },
      (res) => { resolve(res.statusCode); req.destroy(); });
    req.on('error', (e) => { if (!req.destroyed) reject(e); });
    req.end('engaged,inview,card');
  });
  expect(status).toBe(200);
  await upstreamEnded;
  await vi.waitFor(() => expect(proxy.events).toEqual([{ body: 'engaged,inview,card', status: 200, address: proxy.address }]), { timeout: 2_000 });
});
it('refuses invalid addresses and non-loopback upstreams', async () => {
  await expect(startClientProxy('http://localhost:1234', 'garbage')).rejects.toThrow('address');
  await expect(startClientProxy('https://example.com', clientAddress(0, 1))).rejects.toThrow('loopback');
});

it('stamps the actual APIRequestContext HTTP CONNECT transport', async () => {
  const target = await upstream(); const proxy = await startClientProxy(target.origin, clientAddress(5, 1)); proxies.push(proxy);
  const api = await playwrightRequest.newContext({ proxy: { server: proxy.server } });
  try {
    const response = await api.post(target.origin + '/api/e', { data: 'connect-body' });
    expect(response.status()).toBe(201);
    expect(target.received[0]!.headers['x-forwarded-for']).toBe(proxy.address);
    expect(await response.text()).toBe('connect-body');
  } finally { await api.dispose(); }
});

it('rejects a foreign target or Host before forwarding credential headers', async () => {
  const target = await upstream();
  const foreign = await upstream();
  const proxy = await startClientProxy(target.origin, clientAddress(6, 1), { 'x-internal': 'test-marker' });
  proxies.push(proxy);

  for (const [url, host] of [
    [foreign.origin, new URL(foreign.origin).host],
    [target.origin, new URL(foreign.origin).host],
  ]) {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(proxy.server, {
        path: url + '/api/e',
        headers: { host, authorization: 'test-marker', cookie: 'test-marker' },
      }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(502);
  }

  expect(target.received).toEqual([]);
  expect(foreign.received).toEqual([]);
});

it('dials the loopback origin directly when Node enables its environment proxy', async () => {
  const target = await upstream();
  const environmentProxy = await upstream();
  const origin = target.origin.replace('localhost', '127.0.0.1');
  const proxyURL = environmentProxy.origin.replace('localhost', '127.0.0.1');
  const marker = 'direct-agent-regression-marker';
  const { stdout } = await promisify(execFile)(process.execPath, [
    '--input-type=module', '--eval', `
      import { get } from 'node:http';

      const [moduleURL, origin, marker] = process.argv.slice(1);
      const { startClientProxy, clientAddress } = await import(moduleURL);
      const proxy = await startClientProxy(origin, clientAddress(7, 1), { 'x-internal': marker });
      try {
        const status = await new Promise((resolve, reject) => {
          get(proxy.server, {
            agent: false,
            path: origin + '/probe',
            headers: { host: new URL(origin).host, authorization: marker, cookie: 'marker=' + marker },
          }, (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
          }).on('error', reject);
        });
        console.log(status);
      } finally {
        await proxy.close();
      }
    `,
    new URL('../e2e/client-proxy.ts', import.meta.url).href, origin, marker,
  ], {
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', HTTP_PROXY: proxyURL, http_proxy: proxyURL, NO_PROXY: '', no_proxy: '' },
    timeout: 4_000,
  });

  expect(environmentProxy.received).toEqual([]);
  expect(stdout.trim()).toBe('201');
  expect(target.received).toEqual([{
    url: '/probe',
    body: '',
    headers: expect.objectContaining({ authorization: marker, cookie: 'marker=' + marker, 'x-internal': marker }),
  }]);
});
