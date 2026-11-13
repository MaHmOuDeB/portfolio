// Test-only network boundary: Chromium unload beacons bypass extraHTTPHeaders and routing.
import { createServer, request, type ClientRequest, type IncomingHttpHeaders } from 'node:http';
import { createConnection, isIPv6 } from 'node:net';
import type { Socket } from 'node:net';

export function clientAddress(workerIndex: number, ordinal: number): string {
  if (!Number.isInteger(workerIndex) || workerIndex < 0 || workerIndex > 0xffff ||
      !Number.isInteger(ordinal) || ordinal < 1 || ordinal > 0xffff) {
    throw new RangeError('e2e address allocation exhausted or invalid');
  }
  // Both allocation components are inside the /64 that production uses as the rate bucket.
  return `2001:db8:${workerIndex.toString(16)}:${ordinal.toString(16)}::1`;
}

function endToEnd(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const omitted = new Set([
    'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection',
    'te', 'trailer', 'transfer-encoding', 'upgrade',
    ...(headers.connection ?? '').split(',').map((name) => name.trim().toLowerCase()),
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !omitted.has(name.toLowerCase())));
}

export type ProxiedEvent = { body: string; address: string; status: number };
export type ClientProxy = Awaited<ReturnType<typeof startClientProxy>>;

export async function startClientProxy(baseURL: string, address: string, internal: Record<string, string> = {}) {
  const origin = new URL(baseURL);
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error('e2e client proxy requires an HTTP loopback application');
  }
  if (!isIPv6(address) || !address.startsWith('2001:db8:')) throw new Error('invalid e2e documentation address');
  const events: ProxiedEvent[] = [];
  const pending = new Set<ClientRequest>();
  const sockets = new Set<Socket>();
  let hold: { matches: (body: string) => boolean; entered: () => void; released: Promise<void>; release: () => void; used: boolean } | undefined;
  const server = createServer((incoming, outgoing) => {
    let target: URL;
    try {
      target = incoming.url?.startsWith('/') ? new URL(incoming.url, origin) : new URL(incoming.url!);
    } catch { outgoing.writeHead(400).end(); return; }
    if (target.origin !== origin.origin || incoming.headers.host !== origin.host) { outgoing.writeHead(502).end(); return; }
    const headers = { ...endToEnd(incoming.headers), ...internal, 'x-forwarded-for': address, 'x-real-ip': address };
    const capture = target.pathname === '/api/e';
    const chunks: Buffer[] = [];
    let size = 0;
    let complete!: () => void;
    const bodyReady = new Promise<void>((resolve) => (complete = resolve));
    incoming.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (capture && size <= 65_536) chunks.push(chunk);
    });
    incoming.on('end', complete);
    incoming.on('error', complete);
    const upstream = request({
      // Keep the fixed loopback dial independent of Node's environment proxy.
      agent: false,
      hostname: origin.hostname === 'localhost' ? '127.0.0.1' : origin.hostname.replace(/^\[|\]$/g, ''),
      port: origin.port || 80, path: target.pathname + target.search, method: incoming.method, headers,
    }, (response) => {
      const finished = async () => {
        await bodyReady;
        const body = size <= 65_536 ? Buffer.concat(chunks).toString('utf8') : '';
        response.on('end', () => {
          if (capture) events.push({ body, address, status: response.statusCode ?? 502 });
        });
        const gate = hold;
        if (capture && gate && !gate.used && gate.matches(body)) {
          gate.used = true;
          gate.entered();
          await gate.released;
        }
        // An unload may detach its document, and Chromium cancels a detached document's beacon once
        // its response head arrives, closing the connection before the body is read. Either way the
        // real upstream answer is read to its end, so it is recorded: a closed client unpipes and
        // pauses the response, which would otherwise never end. The listener comes after pipe() so
        // that it runs after pipe's own close handler.
        if (outgoing.destroyed) response.resume();
        else {
          outgoing.writeHead(response.statusCode ?? 502, endToEnd(response.headers));
          response.pipe(outgoing);
          outgoing.on('close', () => response.resume());
        }
      };
      void finished().catch(() => { response.destroy(); outgoing.destroy(); });
      response.on('error', () => outgoing.destroy());
    });
    pending.add(upstream);
    upstream.on('close', () => pending.delete(upstream));
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.on('aborted', () => { complete(); upstream.destroy(); });
    incoming.pipe(upstream);
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  // Playwright's APIRequestContext and route.fetch tunnel even plain HTTP using CONNECT.
  // Loop the permitted HTTP tunnel back through this parser so its requests are stamped too.
  server.on('connect', (incoming, socket, head) => {
    if (incoming.url !== origin.host) {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      return;
    }
    const bound = server.address();
    if (!bound || typeof bound === 'string') { socket.destroy(); return; }
    const tunnel = createConnection({ host: '127.0.0.1', port: bound.port });
    sockets.add(tunnel);
    tunnel.on('close', () => sockets.delete(tunnel));
    tunnel.on('error', () => socket.destroy());
    socket.on('error', () => tunnel.destroy());
    socket.on('close', () => tunnel.destroy());
    tunnel.on('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) tunnel.write(head);
      socket.pipe(tunnel).pipe(socket);
    });
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const bound = server.address();
  if (bound === null || typeof bound === 'string') throw new Error('missing e2e proxy listener');
  return {
    address, events, server: `http://127.0.0.1:${bound.port}`,
    holdResponse(matches: (body: string) => boolean) {
      if (hold) throw new Error('only one response gate per test');
      let entered!: () => void;
      let release!: () => void;
      const holding = new Promise<void>((resolve) => (entered = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));
      hold = { matches, entered, released, release, used: false };
      return { entered: holding, release };
    },
    async close() {
      hold?.release();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeIdleConnections();
      try {
        await Promise.race([closed, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 1000); })]);
      } finally {
        if (timeout) clearTimeout(timeout);
        for (const upstream of pending) upstream.destroy();
        for (const socket of sockets) socket.destroy();
        await closed;
      }
    },
  };
}
