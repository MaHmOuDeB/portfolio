import { assignArm, isBotUserAgent } from '@/lib/experiment/assign';
import { sfc32, srmTest } from '@/lib/stats';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BOTS = ['Googlebot/2.1', 'LinkedInBot/1.0', 'Slackbot-LinkExpanding 1.0', 'facebookexternalhit/1.1', 'HeadlessChrome/131'];
const never = () => {
  throw new Error('random() must not be called');
};

describe('assignArm', () => {
  it.each(['a', 'b'] as const)('?variant=%s forces that arm', (arm) => {
    expect(assignArm({ search: new URLSearchParams(`variant=${arm}`), userAgent: CHROME, random: never })).toEqual({ arm, forced: true, bot: false });
  });

  it.each(['variant=c', 'variant=', 'variant=A', 'Variant=b', ''])('ignores ?%s and randomises', (query) => {
    const search = new URLSearchParams(query);
    expect(assignArm({ search, userAgent: CHROME, random: () => 0.49 })).toEqual({ arm: 'a', forced: false, bot: false });
    expect(assignArm({ search, userAgent: CHROME, random: () => 0.5 })).toEqual({ arm: 'b', forced: false, bot: false });
  });

  it.each(BOTS)('sends the bot %s to a, ignoring a forced group', (ua) => {
    expect(assignArm({ search: new URLSearchParams(), userAgent: ua, random: () => 0.9 })).toEqual({ arm: 'a', forced: false, bot: true });
    expect(assignArm({ search: new URLSearchParams('variant=b'), userAgent: ua, random: () => 0.9 })).toEqual({ arm: 'a', forced: false, bot: true });
  });

  it('gives a when random() < 0.5 and b otherwise', () => {
    for (const r of [0, 0.25, 0.4999999]) expect(assignArm({ search: new URLSearchParams(), userAgent: CHROME, random: () => r }).arm).toBe('a');
    for (const r of [0.5, 0.75, 0.9999999]) expect(assignArm({ search: new URLSearchParams(), userAgent: CHROME, random: () => r }).arm).toBe('b');
  });

  it('splits 100,000 seeded draws without a sample-ratio mismatch', () => {
    const rng = sfc32(7);
    let nA = 0;
    let nB = 0;
    for (let i = 0; i < 100_000; i += 1) {
      const { arm } = assignArm({ search: new URLSearchParams(), userAgent: CHROME, random: rng.uniform });
      if (arm === 'a') nA += 1;
      else nB += 1;
    }
    expect(nA + nB).toBe(100_000);
    expect(srmTest(nA, nB).flagged).toBe(false);
  });
});

describe('isBotUserAgent', () => {
  it.each(BOTS)('flags %s', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it('does not flag a browser, an empty user agent or a missing one', () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent('')).toBe(false);
    expect(isBotUserAgent(null)).toBe(false);
  });
});
