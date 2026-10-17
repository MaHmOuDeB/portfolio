import { isCurrent } from '@/lib/nav';

describe('isCurrent', () => {
  it('matches the page itself and pages below it', () => {
    expect(isCurrent('/work', '/work')).toBe(true);
    expect(isCurrent('/work/pulse', '/work')).toBe(true);
  });

  it('does not match siblings that share a prefix, the home page or a missing path', () => {
    expect(isCurrent('/workshop', '/work')).toBe(false);
    expect(isCurrent('/', '/work')).toBe(false);
    expect(isCurrent('/lab', '/work')).toBe(false);
    expect(isCurrent(null, '/work')).toBe(false);
  });
});
