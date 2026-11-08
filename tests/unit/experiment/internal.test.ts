import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INTERNAL_MESSAGE, isInternal, safeEqual } from '@/lib/experiment/internal';

const SECRET = 'test-internal-secret';
const valid = createHmac('sha256', SECRET).update(INTERNAL_MESSAGE).digest('hex');

describe('isInternal', () => {
  it('accepts the HMAC of INTERNAL_MESSAGE under the secret', () => {
    expect(isInternal(valid, SECRET)).toBe(true);
  });

  it.each([
    ['a wrong value', 'f'.repeat(64)],
    ['the HMAC under another secret', createHmac('sha256', 'other').update(INTERNAL_MESSAGE).digest('hex')],
    ['a 3-character header', 'abc'],
    ['an empty header', ''],
    ['no header', null],
    ['the value in upper case', valid.toUpperCase()],
    ['the value with a space', ` ${valid}`],
  ])('refuses %s without throwing', (_, header) => {
    expect(() => isInternal(header, SECRET)).not.toThrow();
    expect(isInternal(header, SECRET)).toBe(false);
  });

  it('refuses everything, without throwing, when the secret is undefined or empty', () => {
    expect(isInternal(valid, undefined)).toBe(false);
    expect(isInternal('', undefined)).toBe(false);
    expect(isInternal(createHmac('sha256', '').update(INTERNAL_MESSAGE).digest('hex'), '')).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares strings of any length without throwing', () => {
    expect(() => safeEqual('a', 'ab')).not.toThrow();
    expect(safeEqual('a', 'ab')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
    expect(safeEqual('same', 'same')).toBe(true);
    expect(safeEqual('same', 'Same')).toBe(false);
  });
});

it('the e2e fixtures sign the same message', () => {
  const fixtures = readFileSync(join(import.meta.dirname, '../../e2e/fixtures.ts'), 'utf8');
  expect(fixtures).toContain(`'${INTERNAL_MESSAGE}'`);
  expect(INTERNAL_MESSAGE).toBe('portfolio-internal-traffic');
});
