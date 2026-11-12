// The send path: one server-side POST to Resend with exactly the five keys, plain text, the visitor's
// address as reply_to; fail closed when a variable is missing; log a status code or a variable name,
// never a value. fetch is always a test double: no test reaches the network.
import { contactConfig, deliver, RESEND_URL, type ContactMessage } from '@/lib/contact/send';
import type { ServerEnv } from '@/lib/env';

// Placeholders only: never the owner's address or a real key.
const KEY = 'test-resend-key-placeholder';
const TO = 'inbox@example.test';
const MESSAGE: ContactMessage = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  reason: 'job',
  subject: 'A role on our growth team',
  message: 'Hello,\nI would like to talk about a role.',
};

const env = (patch: Partial<ServerEnv> = {}): ServerEnv => ({ vercelEnv: 'production', fakeStore: false, resendApiKey: KEY, contactToEmail: TO, ...patch });

function fakeFetch(response: Response | Error = new Response('{"id":"x"}', { status: 200 })) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fn, calls };
}

function logger() {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

describe('deliver', () => {
  it('posts once to Resend with exactly from, to, reply_to, subject and text', async () => {
    const f = fakeFetch();
    const l = logger();
    expect(await deliver(MESSAGE, contactConfig(env()), { fetch: f.fn, log: l.log })).toBe('sent');
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(RESEND_URL).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['from', 'reply_to', 'subject', 'text', 'to']);
    expect(body.from).toBe('Portfolio contact <onboarding@resend.dev>');
    expect(body.to).toBe(TO);
    expect(body.reply_to).toBe('ada@example.test');
    expect(body.subject).toBe('[Portfolio] Job opportunity: A role on our growth team');
    expect(body.text).toBe(
      'Name: Ada Lovelace\nE-mail: ada@example.test\nReason: Job opportunity\n\nMessage:\nHello,\nI would like to talk about a role.\n',
    );
    expect(l.lines).toEqual([]);
  });

  it('fails closed, without a request, when a variable is missing, and logs one line naming it', async () => {
    for (const [patch, name] of [
      [{ resendApiKey: undefined }, 'RESEND_API_KEY'],
      [{ contactToEmail: undefined }, 'CONTACT_TO_EMAIL'],
    ] as const) {
      const f = fakeFetch();
      const l = logger();
      expect(await deliver(MESSAGE, contactConfig(env(patch)), { fetch: f.fn, log: l.log })).toBe('failed');
      expect(f.calls).toHaveLength(0);
      expect(l.lines).toEqual([`contact form: ${name} is not set; nothing was sent`]);
    }
    const f = fakeFetch();
    const l = logger();
    await deliver(MESSAGE, contactConfig(env({ resendApiKey: undefined, contactToEmail: undefined })), { fetch: f.fn, log: l.log });
    expect(l.lines).toEqual([
      'contact form: RESEND_API_KEY is not set; nothing was sent',
      'contact form: CONTACT_TO_EMAIL is not set; nothing was sent',
    ]);
  });

  it('logs only the status code of a Resend error, never its body (which can echo the addresses)', async () => {
    for (const status of [401, 422, 429, 500, 503]) {
      const f = fakeFetch(new Response(JSON.stringify({ message: `bad ${TO} ada@example.test ${KEY}` }), { status }));
      const l = logger();
      expect(await deliver(MESSAGE, contactConfig(env()), { fetch: f.fn, log: l.log })).toBe('failed');
      expect(l.lines).toEqual([`contact form: Resend answered ${status}; nothing was sent`]);
    }
  });

  it('a network error or a timeout fails and logs no detail', async () => {
    const f = fakeFetch(new Error(`connect failed to ${TO} with ${KEY}`));
    const l = logger();
    expect(await deliver(MESSAGE, contactConfig(env()), { fetch: f.fn, log: l.log })).toBe('failed');
    expect(l.lines).toEqual(['contact form: the request to Resend failed; nothing was sent']);
  });

  it('sets a timeout on the request', async () => {
    const f = fakeFetch();
    await deliver(MESSAGE, contactConfig(env()), { fetch: f.fn, log: () => {} });
    expect(f.calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('contactConfig', () => {
  it('uses the real Resend endpoint in production, whatever RESEND_API_URL says', () => {
    expect(contactConfig(env({ resendApiUrl: 'http://127.0.0.1:8079/resend/emails' })).apiUrl).toBe(RESEND_URL);
  });

  it('outside production, honours a loopback RESEND_API_URL only (the e2e fake)', () => {
    const dev = (url: string) => contactConfig(env({ vercelEnv: 'development', resendApiUrl: url })).apiUrl;
    expect(dev('http://127.0.0.1:8079/resend/emails')).toBe('http://127.0.0.1:8079/resend/emails');
    expect(dev('http://localhost:8079/resend/emails')).toBe('http://localhost:8079/resend/emails');
    expect(dev('https://evil.example/emails')).toBe(RESEND_URL);
    expect(dev('not a url')).toBe(RESEND_URL);
    expect(contactConfig(env({ vercelEnv: 'preview', resendApiUrl: 'http://127.0.0.1:1/x' })).apiUrl).toBe('http://127.0.0.1:1/x');
  });
});
