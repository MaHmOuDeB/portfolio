import { describe, expect, it, vi } from 'vitest';
import { UUID_V4 } from '../../../src/lib/experiment/events.ts';
import { newViewId } from '../../../src/lib/experiment/view-id.ts';

// A page served over plain http from a LAN address (a phone review) is not a secure context, and
// Safari before 15.4 has no randomUUID at all: there crypto.randomUUID is undefined, and calling
// it threw and took the English Home down. getRandomValues exists in every context.
describe('newViewId', () => {
  it('uses randomUUID where the browser has it', () => {
    const randomUUID = vi.fn(() => '3b241101-e2bb-4255-8caf-4136c566a962' as const);
    expect(newViewId({ randomUUID, getRandomValues: (a) => a })).toBe('3b241101-e2bb-4255-8caf-4136c566a962');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('builds a version 4 id from getRandomValues where randomUUID is missing', () => {
    const c = { getRandomValues: <T extends ArrayBufferView | null>(a: T) => globalThis.crypto.getRandomValues(a as Uint8Array) as unknown as T };
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newViewId(c);
      expect(id).toMatch(UUID_V4);
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });

  it('sets the version and variant bits whatever the random bytes are', () => {
    for (const fill of [0x00, 0xff]) {
      const id = newViewId({ getRandomValues: <T extends ArrayBufferView | null>(a: T) => { (a as Uint8Array).fill(fill); return a; } });
      expect(id).toMatch(UUID_V4);
    }
  });
});
