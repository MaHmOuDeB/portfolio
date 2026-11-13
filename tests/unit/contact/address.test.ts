import { describe, expect, it } from 'vitest';
import { addressFrom } from '@/lib/contact/address';

const h = (init: Record<string, string>) => new Headers(init);

describe('addressFrom', () => {
  it('reads the first x-forwarded-for entry', () => {
    expect(addressFrom(h({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(addressFrom(h({ 'x-real-ip': ' 2001:db8::1 ' }))).toBe('2001:db8::1');
    expect(addressFrom(h({ 'x-forwarded-for': ' ', 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('is null when neither header carries an address', () => {
    expect(addressFrom(h({}))).toBeNull();
    expect(addressFrom(h({ 'x-real-ip': '  ' }))).toBeNull();
  });
});
