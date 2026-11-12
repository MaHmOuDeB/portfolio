// The contact form's server side, end to end with test doubles: the honeypot, the minimum fill time,
// validation, the limit and delivery, and what each path logs (nothing about the visitor).
import { handleContact, MIN_FILL_MS, type ContactContext } from '@/lib/contact/handle';
import { createContactLimiter } from '@/lib/contact/limiter';
import { contactConfig, deliver, type ContactMessage } from '@/lib/contact/send';

const KEY = 'test-resend-key-placeholder';
const TO = 'inbox@example.test';
const IP = '198.51.100.23';
const NOW = 1_700_000_000_000;
const FIELDS = {
  name: 'Ada Lovelace',
  email: 'ada@example.test',
  reason: 'interview',
  subject: 'Interview next week',
  message: 'Could we talk on Tuesday?',
};

function form(patch: Record<string, string> = {}, issuedAt: number | null = NOW - 10_000): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...FIELDS, website: '', ...patch })) fd.set(k, v);
  if (issuedAt !== null) fd.set('issuedAt', String(issuedAt));
  return fd;
}

function context(o: { status?: number; env?: Partial<Parameters<typeof contactConfig>[0]> } = {}) {
  const sent: ContactMessage[] = [];
  const requests: string[] = [];
  const lines: string[] = [];
  const limiter = createContactLimiter({ now: () => NOW, schedule: () => {} });
  const ctx: ContactContext = {
    now: () => NOW,
    ip: IP,
    limiter,
    deliver: (m) => {
      sent.push(m);
      return deliver(m, contactConfig({ vercelEnv: 'production', fakeStore: false, resendApiKey: KEY, contactToEmail: TO, ...o.env }), {
        fetch: (async (_u: string | URL, init?: RequestInit) => {
          requests.push(String(init?.body));
          return new Response('{}', { status: o.status ?? 200 });
        }) as typeof fetch,
        log: (line) => lines.push(line),
      });
    },
  };
  return { ctx, sent, requests, lines, limiter };
}

describe('handleContact', () => {
  it('sends a valid message after the minimum fill time', async () => {
    const c = context();
    expect(await handleContact(form(), c.ctx)).toEqual({ status: 'sent' });
    expect(c.sent).toEqual([FIELDS]);
    expect(c.requests).toHaveLength(1);
  });

  it('trims the one-line fields before sending', async () => {
    const c = context();
    await handleContact(form({ name: '  Ada  ', subject: ' Hi ' }), c.ctx);
    expect(c.sent[0]).toMatchObject({ name: 'Ada', subject: 'Hi' });
  });

  it('answers a filled honeypot as if sent, and sends nothing', async () => {
    const c = context();
    expect(await handleContact(form({ website: 'https://spam.example' }), c.ctx)).toEqual({ status: 'sent' });
    expect(c.sent).toEqual([]);
    expect(c.limiter.size()).toBe(0);
  });

  it('refuses a form sent sooner than three seconds after it was issued, keeping the text', async () => {
    expect(MIN_FILL_MS).toBe(3000);
    const c = context();
    const state = await handleContact(form({}, NOW - 2999), c.ctx);
    expect(state).toEqual({ status: 'failed', reason: 'fast', values: FIELDS, issuedAt: NOW - 2999 });
    expect(c.sent).toEqual([]);
    expect(await handleContact(form({}, NOW - 3000), c.ctx)).toEqual({ status: 'sent' });
  });

  it('treats a missing, unreadable or future timestamp as too fast', async () => {
    const c = context();
    for (const fd of [form({}, null), form({ issuedAt: 'soon' }, null), form({}, NOW + 60_000)]) {
      expect((await handleContact(fd, c.ctx)).status).toBe('failed');
    }
    expect(c.sent).toEqual([]);
  });

  it('returns every field error with the values, and sends nothing', async () => {
    const c = context();
    const state = await handleContact(form({ email: 'nope', subject: 'Hi\r\nBcc: x@example.test' }), c.ctx);
    expect(state).toEqual({
      status: 'invalid',
      errors: { email: 'Enter a full e-mail address, with an @ and a domain', subject: 'Enter the subject on one line' },
      values: { ...FIELDS, email: 'nope', subject: 'Hi\nBcc: x@example.test' },
      issuedAt: NOW - 10_000,
    });
    expect(c.sent).toEqual([]);
    expect(c.limiter.size()).toBe(0);
  });

  it('lets five messages an hour through from one address, then says the form reached its limit', async () => {
    const c = context();
    for (let i = 0; i < 5; i++) expect((await handleContact(form(), c.ctx)).status).toBe('sent');
    expect(await handleContact(form(), c.ctx)).toEqual({ status: 'failed', reason: 'limit', values: FIELDS, issuedAt: NOW - 10_000 });
    expect(c.sent).toHaveLength(5);
  });

  it('says delivery failed when Resend fails or a variable is missing, keeping the text', async () => {
    for (const c of [context({ status: 500 }), context({ status: 422 }), context({ env: { resendApiKey: undefined } }), context({ env: { contactToEmail: undefined } })]) {
      expect(await handleContact(form(), c.ctx)).toEqual({ status: 'failed', reason: 'delivery', values: FIELDS, issuedAt: NOW - 10_000 });
    }
  });

  it('logs nothing about the visitor on any path: no field, no address, no hash, no inbox, no key', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const all: string[] = [];
    try {
      const runs: [FormData, ReturnType<typeof context>][] = [
        [form(), context()],
        [form({ email: 'nope' }), context()],
        [form({ website: 'x' }), context()],
        [form({}, NOW - 100), context()],
        [form(), context({ env: { resendApiKey: undefined, contactToEmail: undefined } })],
        [form(), context({ status: 400 })],
        [form(), context({ status: 503 })],
      ];
      for (const [fd, c] of runs) {
        await handleContact(fd, c.ctx);
        all.push(...c.lines);
      }
      const limited = context();
      for (let i = 0; i < 6; i++) await handleContact(form(), limited.ctx);
      all.push(...limited.lines, ...limited.limiter.keys());
      const hashes = limited.limiter.keys();
      const printed = [...spies.flatMap((s) => s.mock.calls.flat().map(String)), ...limited.lines, ...runs.flatMap(([, c]) => c.lines)].join('\n');
      for (const secret of [...Object.values(FIELDS), IP, TO, KEY, ...hashes]) expect(printed, secret).not.toContain(secret);
      // The lines that are logged are the fixed ones.
      for (const line of runs.flatMap(([, c]) => c.lines)) expect(line).toMatch(/^contact form: (RESEND_API_KEY|CONTACT_TO_EMAIL) is not set; nothing was sent$|^contact form: Resend answered \d{3}; nothing was sent$/);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it('keeps nothing after a failure: no retry and no queue', async () => {
    const c = context({ status: 500 });
    await handleContact(form(), c.ctx);
    expect(c.requests).toHaveLength(1);
  });
});
