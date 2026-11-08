import { readCapped } from '@/lib/experiment/body';

const LIMIT = 1024;

/** A body that is pulled one byte at a time, counting the bytes the reader took. */
function trickle(total: number): { request: Request; pulled: () => number } {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(new Uint8Array([0x61]));
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request('http://localhost/api/e', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  return { request, pulled: () => pulled };
}

describe('readCapped', () => {
  it('returns a body of exactly the limit', async () => {
    const body = 'a'.repeat(LIMIT);
    await expect(readCapped(new Request('http://localhost/api/e', { method: 'POST', body }), LIMIT)).resolves.toBe(body);
  });

  it('returns a streamed body of exactly the limit', async () => {
    const { request } = trickle(LIMIT);
    await expect(readCapped(request, LIMIT)).resolves.toBe('a'.repeat(LIMIT));
  });

  it('gives null for a streamed body one byte over, without Content-Length, reading at most limit + 1 bytes', async () => {
    const { request, pulled } = trickle(100_000);
    expect(request.headers.get('content-length')).toBeNull();
    await expect(readCapped(request, LIMIT)).resolves.toBeNull();
    expect(pulled()).toBeLessThanOrEqual(LIMIT + 1);
  });

  it('gives null when the bytes exceed the limit even though the characters do not', async () => {
    const body = 'é'.repeat(LIMIT / 2 + 1);
    await expect(readCapped(new Request('http://localhost/api/e', { method: 'POST', body }), LIMIT)).resolves.toBeNull();
  });

  it('gives an empty string for a request without a body', async () => {
    await expect(readCapped(new Request('http://localhost/api/e', { method: 'POST' }), LIMIT)).resolves.toBe('');
  });

  it('decodes UTF-8', async () => {
    await expect(readCapped(new Request('http://localhost/api/e', { method: 'POST', body: 'Grüße' }), LIMIT)).resolves.toBe('Grüße');
  });
});
