import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BENCHMARK_BAND,
  REFERENCE_BENCHMARK_INDEX,
  benchmarkIndexes,
  median,
  verdict,
} from '../../scripts/lhci-benchmark-guard.ts';

// The self-hosted Lighthouse run (the lhci job in ci.yml). Its CPU multiplier is calibrated to
// GitHub's hosted runner from this runner's benchmark index (837.5, measured in the capped job
// container); a busier machine measures a lower index and would report worse scores than the
// hosted runner. So the run checks the median benchmark index of its 5 runs against the calibrated
// band (+/-20%), collects again once if it is outside, and then fails as "machine too busy to
// measure", never as a budget failure.
const ROOT = join(import.meta.dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/lhci-calibrated.sh');

describe('the benchmark guard', () => {
  it('is calibrated to 837.5 with a +/-20% band, 670 to 1005', () => {
    expect(REFERENCE_BENCHMARK_INDEX).toBe(837.5);
    expect(BENCHMARK_BAND).toEqual([670, 1005]);
  });

  it('takes the median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('reads the benchmark index of every Lighthouse result in a folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lhci-guard-'));
    try {
      writeFileSync(join(dir, 'lhr-1.json'), JSON.stringify({ environment: { benchmarkIndex: 800 } }));
      writeFileSync(join(dir, 'lhr-2.json'), JSON.stringify({ environment: { benchmarkIndex: 900 } }));
      writeFileSync(join(dir, 'lhr-3.json'), JSON.stringify({ environment: { benchmarkIndex: 700.5 } }));
      writeFileSync(join(dir, 'manifest.json'), '[]');
      expect(benchmarkIndexes(dir).sort((a, b) => a - b)).toEqual([700.5, 800, 900]);
      expect(verdict(dir)).toEqual({ median: 800, inBand: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('puts the edges of the band inside and anything beyond outside', () => {
    const at = (bi: number) => {
      const dir = mkdtempSync(join(tmpdir(), 'lhci-guard-'));
      try {
        writeFileSync(join(dir, 'lhr-1.json'), JSON.stringify({ environment: { benchmarkIndex: bi } }));
        return verdict(dir).inBand;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    expect([at(670), at(1005), at(669.5), at(1005.5)]).toEqual([true, true, false, false]);
  });

  it('has no verdict without results', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lhci-guard-'));
    try {
      expect(verdict(dir)).toEqual({ median: null, inBand: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Runs scripts/lhci-calibrated.sh against a fake `npx` that serves the given benchmark indexes, one per collect. */
function run(indexes: number[], assertStatus = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'lhci-run-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(join(ROOT, 'scripts'), join(dir, 'scripts'));
  writeFileSync(join(dir, 'indexes'), indexes.join('\n'));
  writeFileSync(join(dir, 'summary'), '');
  // The fake npx: `collect` writes 5 results with the next benchmark index; upload and assert are logged.
  writeFileSync(
    join(bin, 'npx'),
    [
      '#!/usr/bin/env bash',
      'echo "$*" >> calls',
      'case "$*" in',
      '  *"lhci collect"*)',
      '    bi="$(head -1 indexes)"; tail -n +2 indexes > indexes.next; mv indexes.next indexes',
      '    mkdir -p .lighthouseci',
      '    for i in 1 2 3 4 5; do printf \'{"environment":{"benchmarkIndex":%s}}\' "$bi" > ".lighthouseci/lhr-$i.json"; done ;;',
      '  *"lhci upload"*) mkdir -p reports/lhci ;;',
      `  *"lhci assert"*) exit ${assertStatus} ;;`,
      'esac',
    ].join('\n'),
  );
  chmodSync(join(bin, 'npx'), 0o755);
  const r = spawnSync('bash', [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CHROME_PATH: '/usr/bin/true',
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      LHCI_RETRY_PAUSE: '0',
    } as Record<string, string | undefined> as NodeJS.ProcessEnv,
  });
  const calls = existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n') : [];
  const summary = readFileSync(join(dir, 'summary'), 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls, summary };
}

describe('scripts/lhci-calibrated.sh', () => {
  it('collects with the calibrated multiplier, then uploads and asserts when the machine is as calibrated', () => {
    const r = run([850]);
    expect(r.status).toBe(0);
    expect(r.calls).toEqual([
      '--no-install lhci collect --settings.chromeFlags=--no-sandbox --settings.throttling.cpuSlowdownMultiplier=1.5',
      '--no-install lhci upload',
      '--no-install lhci assert',
    ]);
    expect(r.summary).toContain('benchmark index 850 (calibrated band 670-1005, multiplier 1.5)');
  });

  it('collects again once when the first collection ran on a busier or faster machine', () => {
    const r = run([500, 900]);
    expect(r.status).toBe(0);
    expect(r.calls.filter((c) => c.includes('lhci collect'))).toHaveLength(2);
    expect(r.calls.at(-1)).toBe('--no-install lhci assert');
    expect(r.summary).toContain('benchmark index 900');
  });

  it('fails as "machine too busy to measure" when both collections are outside the band, never asserting a budget', () => {
    const r = run([500, 1200]);
    expect(r.status).toBe(1);
    expect(r.calls.filter((c) => c.includes('lhci collect'))).toHaveLength(2);
    expect(r.calls).not.toContain('--no-install lhci assert');
    expect(r.calls).toContain('--no-install lhci upload');
    expect(r.summary).toContain('machine too busy to measure (benchmark index 1200, expected 670-1005)');
  });

  it('fails as a budget failure only when the assertions fail on a calibrated machine', () => {
    const r = run([900], 1);
    expect(r.status).toBe(1);
    expect(r.summary).not.toContain('machine too busy');
  });
});
