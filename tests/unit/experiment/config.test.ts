import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatFact, getFact } from '@/lib/facts';
import { detectableEffectCs, mixtureCs, optimalTau2, srmTest } from '@/lib/stats';
import { ARMS, EXPERIMENT, FIXTURE_START, TAU2, calibrationStart, type ExperimentConfig } from '../../../src/experiment.config';
import { HEADLINES, type HeadlinePart } from '../../../content/experiment/headlines';
import { preregHash } from '../../../scripts/prereg-hash';
import { COMMANDS_PER_FULL_VIEW, MONTHLY_COMMAND_QUOTA, MONTHLY_PAGE_READ_BUDGET, REFUSED_ENTRIES_PER_DAY, REFUSED_ENTRY_COMMANDS } from './budget';

const ROOT = join(import.meta.dirname, '../../..');

describe('EXPERIMENT', () => {
  it('holds every pre-registered value', () => {
    expect(ARMS).toEqual(['a', 'b']);
    expect(FIXTURE_START).toBe('2026-11-02T00:00:00+01:00');
    expect(EXPERIMENT).toEqual({
      id: 'card-headlines',
      prereg: { version: 'v1', tag: 'prereg-v1' },
      phase: 'calibration',
      namespace: 'aa-v1',
      calibration: { startedOn: null, minDays: 14, minAnalysedViews: 100 },
      ab: { startedOn: null, capMonths: 6 },
      alpha: 0.05,
      power: 0.8,
      srmFlagP: 0.001,
      minPerGroup: 50,
      primary: { planningBaseline: 0.15 },
      guardrail: { quickExitSeconds: 5, marginPp: 10, planningBaseline: 0.5 },
      capPerArm: 225,
      entryCapPerArm: 375,
      cardsInView: { visibleShare: 0.5, dwellMs: 1000, cardClickCounts: true },
      pvTtlSeconds: 1800,
      rateLimit: { perMinute: 30, keyTtlSeconds: 120, ipv6PrefixBits: 64 },
      dailyEntryCeiling: 200,
      flagsCacheSeconds: 45,
      revalidateSeconds: 300,
      staleAfterMinutes: 15,
      smallCellBelow: 5,
      botRulesVersion: 'isbot@5.2.2',
    });
  });

  it('leaves both start dates unset and starts in calibration', () => {
    expect(EXPERIMENT.calibration.startedOn).toBeNull();
    expect(EXPERIMENT.ab.startedOn).toBeNull();
    expect(EXPERIMENT.phase).toBe('calibration');
  });
});

describe('the daily ceiling and the command quota', () => {
  it('the metered full view and monthly page reads fit the free command quota', () => {
    expect(EXPERIMENT.dailyEntryCeiling).toBe(200);
    expect(COMMANDS_PER_FULL_VIEW).toBeLessThanOrEqual(50);
    const atCeiling = EXPERIMENT.dailyEntryCeiling * COMMANDS_PER_FULL_VIEW * 30;
    expect(atCeiling + MONTHLY_PAGE_READ_BUDGET).toBeLessThan(MONTHLY_COMMAND_QUOTA);
  });

  it('still fit with the worst-case refused entries every day (200 x 48 x 30 + 55,000 + 650 x 8 x 30 = 499,000)', () => {
    const atCeiling = EXPERIMENT.dailyEntryCeiling * COMMANDS_PER_FULL_VIEW * 30;
    const refused = REFUSED_ENTRIES_PER_DAY * REFUSED_ENTRY_COMMANDS * 30;
    expect(atCeiling + MONTHLY_PAGE_READ_BUDGET + refused).toBe(499_000);
    expect(atCeiling + MONTHLY_PAGE_READ_BUDGET + refused).toBeLessThan(MONTHLY_COMMAND_QUOTA);
  });
});

describe('TAU2', () => {
  it('is the optimal mixing variance for each metric at its cap', () => {
    expect(TAU2.primary).toBe(optimalTau2({ baseline: 0.15, nCapPerArm: 225, alpha: 0.05 }));
    expect(TAU2.guardrail).toBe(optimalTau2({ baseline: 0.5, nCapPerArm: 375 }));
  });

  it('gives a detectable effect of about 15 percentage points at 225 views per group', () => {
    const d = detectableEffectCs({ nPerArm: 225, baseline: 0.15, tau2: TAU2.primary, alpha: 0.05, power: 0.8 });
    expect(d).toBeGreaterThanOrEqual(0.14);
    expect(d).toBeLessThanOrEqual(0.16);
  });
});

describe('the guardrail disclosure', () => {
  /** Smallest entry views per group at which identical groups give a half-width below 0.10. */
  function smallestN(quickExitRate: number): number {
    for (let n = 50; n <= 2000; n += 1) {
      const x = Math.round(quickExitRate * n);
      if (mixtureCs({ xA: x, nA: n, xB: x, nB: n }, { tau2: TAU2.guardrail }).halfWidth < 0.1) return n;
    }
    return Infinity;
  }
  const why = 'the pre-registration says ship B needs "about 390 to 470" entry views per group';

  it(`needs 385 to 395 views at a quick-exit rate of 0.3 (${why})`, () => {
    const n = smallestN(0.3);
    expect(n, why).toBeGreaterThanOrEqual(385);
    expect(n, why).toBeLessThanOrEqual(395);
  });

  it(`needs 455 to 470 views at a quick-exit rate of 0.5 (${why})`, () => {
    const n = smallestN(0.5);
    expect(n, why).toBeGreaterThanOrEqual(455);
    expect(n, why).toBeLessThanOrEqual(470);
  });
});

describe('the SRM flag threshold', () => {
  it('flags exactly when p is below srmFlagP', () => {
    for (const [a, b] of [[5_520, 5_000], [5_380, 5_000]] as const) {
      const r = srmTest(a, b);
      expect(r.flagged).toBe(r.p < EXPERIMENT.srmFlagP);
    }
  });
});

describe('calibrationStart', () => {
  it('is null in production while no start is configured', () => {
    expect(calibrationStart(EXPERIMENT, 'production')).toBeNull();
  });

  it('is the fixture start outside production', () => {
    expect(calibrationStart(EXPERIMENT, 'preview')).toBe(FIXTURE_START);
    expect(calibrationStart(EXPERIMENT, 'development')).toBe(FIXTURE_START);
  });

  it('is the configured date everywhere', () => {
    const date = '2026-11-09T00:00:00+01:00';
    const configured: ExperimentConfig = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: date } };
    for (const env of ['production', 'preview', 'development'] as const) {
      expect(calibrationStart(configured, env)).toBe(date);
    }
  });
});

describe('HEADLINES', () => {
  const text = (parts: HeadlinePart[]): string =>
    parts.map((p) => (typeof p === 'string' ? p : formatFact(getFact(p.fact)))).join('');
  const by = (study: string) => HEADLINES.find((h) => h.study === study)!;

  it('has the three studies', () => {
    expect(HEADLINES.map((h) => h.study).sort()).toEqual(['audible', 'pulse', 'retention']);
  });

  it('keeps every headline to 60 characters or fewer', () => {
    for (const h of HEADLINES) {
      expect(text(h.a).length, `${h.study} a`).toBeLessThanOrEqual(60);
      expect(text(h.b).length, `${h.study} b`).toBeLessThanOrEqual(60);
    }
  });

  it('names the topic in group A', () => {
    expect(by('audible').a).toEqual(['How I run experiments']);
    expect(by('retention').a).toEqual(['Customer retention and reactivation analysis']);
    expect(by('pulse').a).toEqual(['Pulse: analytics instrumentation demo']);
  });

  it('states the finding in group B, with numbers as facts', () => {
    expect(by('audible').b).toEqual(['Most tests pitted personalisation against plain baselines']);
    expect(by('retention').b).toEqual([
      'Reversed orders turned ',
      { fact: 'retail.returns.yoy_growth_clean' },
      ' returns growth into ',
      { fact: 'retail.returns.yoy_growth_raw' },
    ]);
    expect(by('pulse').b).toEqual([{ fact: 'pulse.events.count' }, ' events, each designed to answer a product question']);
  });

  it('prints no typed numeral in any headline string', () => {
    for (const h of HEADLINES) {
      for (const part of [...h.a, ...h.b]) if (typeof part === 'string') expect(part).not.toMatch(/\d/);
    }
  });
});

describe('docs/experiment/prereg.md', () => {
  const doc = readFileSync(join(ROOT, 'docs/experiment/prereg.md'), 'utf8');

  it('states every pre-registered rule', () => {
    const required = [
      'α = 0.05', 'p < 0.001', '50 per group', 'at least 2 weeks', 'at least 100', '6-month cap',
      '+10 percentage points', '5 seconds', 'half of the cards area', '1 second', 'clicks a featured card',
      '30 minutes', 'completed Berlin day', 'first decision is final', 'Global Privacy Control',
      'Do Not Track', 'views, not people', '390 to 470', 'aa-v1.1', 'prereg-final', 'prereg-v1.1',
      'Threat model', 'At most 200 counted entry views per Berlin day',
      'any Berlin day that reached the ceiling\nis flagged and does not feed a look', `Pre-registration hash: ${preregHash()}`,
    ];
    for (const phrase of required) expect(doc, phrase).toContain(phrase);
  });
});
